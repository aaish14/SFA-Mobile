import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createInvoiceRouter } from "./invoiceRouter.js";
import { createInvoicePdf } from "./invoicePdf.js";

const id = "a0I000000000001AAA", distributor = "a0T000000000001AAA";
const sample = { Id: id, Name: "INV-TEST", Status__c: "Issued", Invoice_Date__c: "2026-10-26", Bill_To_Name__c: "Test outlet", Supplier_Name__c: "Test supplier", Total_Amount__c: 94.5, Balance_Due__c: 94.5 };
/**
 * Build the records and test dependencies needed to exercise this module without relying on
 * production data.
 */
function fixture(options: { missing?: boolean; fail?: boolean; noScope?: boolean; count?: number } = {}) {
  const queries: string[] = [];
  /**
   * Return controlled query fixtures for invoice-route tests; this does not query a live
   * Salesforce org.
   */
  const records = async (query: string) => {
    queries.push(query);
    if (options.fail) throw new Error("private Salesforce diagnostic must not leak");
    if (options.missing) return [];
    if (query.includes("FROM DMS_Invoice_Line__c")) return [{ Id: "line", Product__c: "a0P000000000001AAA", Product__r: { Product_Code__c: "TEST-SKU", Brand__c: "Test brand", Sub_Brand__c: "Test sub-brand", Brand_Alias__c: "Test alias" }, Product_Name__c: "Product", Quantity_Pieces__c: 10, Unit_Price__c: 10, Gross_Amount__c: 100, Discount_Amount__c: 10, Tax_Amount__c: 4.5, Total_Amount__c: 94.5 }];
    return Array.from({length: options.count || 1}, () => ({...sample}));
  };
  const app = express();
  app.use("/invoices", createInvoiceRouter(records, async () => options.noScope ? "" : `Distributor__c='${distributor}'`));
  return { app, queries };
}
describe("authorized invoice reader", () => {
  it("resolves invoice barcodes through the same owner scope without changing saved discounts", async () => {
    const f = fixture();
    const res = await request(f.app).get(`/invoices/barcode/I-${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.barcode.value).toBe(`I-${id}`);
    expect(res.body.data.barcode.image).toMatch(/^data:image\/png;base64,/);
    expect(res.body.data.lines[0].barcode.value).toBe("P-a0P000000000001AAA");
    expect(res.body.data.lines[0].Discount_Amount__c).toBe(10);
    expect(res.body.data.lines[0].Product__r.Brand__c).toBe("Test brand");
    expect(f.queries[0]).toContain(`Distributor__c='${distributor}'`);
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });
  it("rejects arbitrary barcode payloads before querying and hides inaccessible scanned invoices", async () => {
    const f = fixture();
    for (const code of ["P-a0P000000000001AAA", "I-bad", "https://evil.invalid", "I-'OR'1"])
      expect((await request(f.app).get(`/invoices/barcode/${encodeURIComponent(code)}`)).status).toBe(400);
    expect(f.queries).toHaveLength(0);
    const hidden = fixture({missing:true});
    expect((await request(hidden.app).get(`/invoices/barcode/I-${id}`)).status).toBe(404);
    expect(hidden.queries).toHaveLength(1);
    const denied = fixture({noScope:true});
    expect((await request(denied.app).get(`/invoices/barcode/I-${id}`)).status).toBe(403);
    expect(denied.queries).toHaveLength(0);
  });
  it("scopes every header query to issued invoices and the authenticated distributor", async () => {
    const f = fixture();
    const res = await request(f.app).get("/invoices");
    expect(res.status).toBe(200); expect(res.body.data.items).toHaveLength(1);
    expect(f.queries[0]).toContain(`Distributor__c='${distributor}'`);
    expect(f.queries[0]).toContain("Status__c='Issued'");
  });
  it("validates order and invoice ids before querying", async () => {
    const f = fixture();
    expect((await request(f.app).get("/invoices?orderId='OR'" )).status).toBe(400);
    expect((await request(f.app).get("/invoices/not-an-id/pdf")).status).toBe(400);
    expect(f.queries).toHaveLength(0);
  });
  it("does not fetch invoice lines or PDF for an inaccessible invoice", async () => {
    const f = fixture({missing:true});
    expect((await request(f.app).get(`/invoices/${id}/pdf`)).status).toBe(404);
    expect(f.queries).toHaveLength(1);
    expect(f.queries[0]).toContain(`Distributor__c='${distributor}'`);
  });
  it("returns the saved line snapshot only after header authorization", async () => {
    const f = fixture();
    const res = await request(f.app).get(`/invoices/${id}`);
    expect(res.body.data.lines[0].Total_Amount__c).toBe(94.5);
    expect(f.queries[1]).toContain(`Invoice__c='${id}'`);
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });
  it("renders an authorized downloadable PDF", async () => {
    const res = await request(fixture().app).get(`/invoices/${id}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("INV-TEST.pdf");
    expect(res.body.subarray(0,4).toString()).toBe("%PDF");
  });
  it("rejects inactive access before any invoice read", async () => {
    const f = fixture({noScope:true});
    expect((await request(f.app).get("/invoices")).status).toBe(403);
    expect(f.queries).toHaveLength(0);
  });
  it("does not turn a Salesforce failure into an empty success", async () => {
    const res = await request(fixture({fail:true}).app).get("/invoices");
    expect(res.status).toBe(502); expect(res.text).not.toContain("private Salesforce diagnostic");
  });
  it("reports capped lists explicitly", async () => {
    const res = await request(fixture({count:201}).app).get("/invoices");
    expect(res.body.data.items).toHaveLength(200); expect(res.body.data.hasMore).toBe(true);
  });
  it("renders long product selections without failing", async () => {
    const pdf = await createInvoicePdf({...sample, lines:Array.from({length:50},(_,i)=>({Product_Name__c:`Product ${i}: ${"long name ".repeat(20)}`, Quantity_Pieces__c:10,Total_Amount__c:94.5,Bonus_Details__c:"Free promotional product"}))});
    expect(pdf.length).toBeGreaterThan(5000);
  });
});
