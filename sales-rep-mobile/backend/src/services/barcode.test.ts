import { describe, it, expect } from "vitest";
import { barcodeValue, recordBarcode, invoiceIdFromBarcode, decorateInvoice } from "./barcode.js";

describe("stable Code 128 references", () => {
  const id = "a0P000000000001AAA";
  it("separates product and invoice identifiers and rejects untrusted arbitrary payloads", () => {
    expect(barcodeValue("product", id)).toBe(`P-${id}`);
    expect(barcodeValue("invoice", id)).toBe(`I-${id}`);
    expect(barcodeValue("product", "name with spaces")).toBeNull();
    expect(invoiceIdFromBarcode(` I-${id} `)).toBe(id);
    expect(invoiceIdFromBarcode(`P-${id}`)).toBeNull();
    expect(invoiceIdFromBarcode([`I-${id}`])).toBeNull();
  });
  it("generates repeatable PNG images locally with readable dimensions", async () => {
    const first = await recordBarcode("product", id);
    const again = await recordBarcode("product", id);
    expect(first).toEqual(again);
    const png = Buffer.from(first!.image.split(",")[1], "base64");
    expect(png.subarray(1,4).toString()).toBe("PNG");
    expect(first!.width).toBeGreaterThan(300);
    expect(first!.height).toBeGreaterThan(60);
    expect(first!.format).toBe("CODE128");
  });
  it("preserves historical totals and handles a missing linked product without inventing a code", async () => {
    const saved = { Id:id, Gross_Amount__c:100, Discount_Amount__c:10, Tax_Amount__c:4.5, Total_Amount__c:94.5,
      lines:[{ Product_Name__c:"Deleted catalogue product", Discount_Amount__c:10 }] };
    const result = await decorateInvoice(saved);
    expect(result.lines[0].barcode).toBeNull();
    expect(result.Total_Amount__c).toBe(94.5);
    expect(result.Discount_Amount__c).toBe(10);
    expect(saved).not.toHaveProperty("barcode");
  });
});
