import { describe, expect, it } from "vitest";
import { groupSecondaryReturns, returnReview, salesforceReturnUrl } from "./returnReview.js";
import { barcodeValue, invoiceIdFromBarcode } from "../services/barcode.js";

const distributor = "a0T000000000001AAA", order = "a0S000000000001AAA";
const first = "a0R000000000001AAA", second = "a0R000000000002AAA";
const saved = (id: string, reason: string) => ({ Id: id, Name: id, DMS_Distributor__c: distributor,
  Mobile_Request_Key__c: `${distributor}:return-request-123456:${id}`, DMS_Status__c: "Pending",
  Order_Item__r: { Sales_Order__c: order, Sales_Order__r: { Name: "SO-1" } },
  Product__c: "a0P000000000001AAA", Product__r: { Name: "Product" }, Quantity__c: 2, Return_Reason__c: reason });

describe("saved return review", () => {
  it("keeps a request together but does not combine different orders or legacy keys", () => {
    const other = { ...saved("other", "Damaged"), Order_Item__r: { Sales_Order__c: "another" } };
    const groups = groupSecondaryReturns([saved(first, "Damaged"), saved(second, "Expired"), other, { ...saved("legacy", "Other"), Mobile_Request_Key__c: null }]);
    expect(groups.map(group => group.lines.length)).toEqual([2, 1, 1]);
  });
  it("returns the original order, saved reasons and an identifier-only return barcode", async () => {
    const queries: string[] = [];
    const result = await returnReview("secondary", first, distributor, async q => {
      queries.push(q);
      if (q.includes("FROM Order_Item__c")) return [{ Product__r: { Name: "Product" }, Piece_Quantity__c: 10, Sales_Order__r: { Name: "SO-1" } }];
      return q.includes(" LIKE ") ? [saved(first, "Damaged"), saved(second, "Expired")] : [saved(first, "Damaged")];
    }, "https://example.my.salesforce.com");
    expect(result.lines.map(line => line.reason)).toEqual(["Damaged", "Expired"]);
    expect(result.orderedLines[0].quantity).toBe(10);
    expect(result.barcode?.value).toBe(`R-${first}`);
    expect(result.salesforceUrl).toBe(`https://example.my.salesforce.com/apex/DmsReturnReview?id=${first}`);
    expect(queries.every(q => q.includes(distributor))).toBe(true);
    expect(queries.find(q => q.includes(" LIKE "))).toContain(order);
  });
  it("does not read products when the return does not belong to the session", async () => {
    let reads = 0;
    await expect(returnReview("primary", first, distributor, async () => { reads++; return []; })).rejects.toMatchObject({ status: 404 });
    expect(reads).toBe(1);
  });
  it("fails instead of presenting an oversized group as complete", async () => {
    await expect(returnReview("secondary", first, distributor, async q => q.includes(" LIKE ") ? Array(51).fill(saved(first, "Damaged")) : [saved(first, "Damaged")])).rejects.toMatchObject({ status: 409 });
  });
  it("uses separate invoice and return references and refuses external review URLs", () => {
    expect(barcodeValue("return", first)).toBe(`R-${first}`);
    expect(invoiceIdFromBarcode(`R-${first}`)).toBeNull();
    expect(salesforceReturnUrl("https://attacker.example", first)).toBeUndefined();
    expect(salesforceReturnUrl("https://user:password@example.my.salesforce.com", first)).toBeUndefined();
  });
});
