import { describe, expect, it } from "vitest";
import { returnCatalogue } from "./returnCatalogue.js";

describe("ordered return catalogue", () => {
  it("includes paid and free received cases and subtracts pending returns", async () => {
    const result = await returnCatalogue("a0T000000000001AAA", "primary", async q => q.includes("GROUP BY")
      ? [{ source: "receipt1", quantity: 3 }]
      : [{ Id: "receipt1", Product__r: { Name: "Product" }, Received_Cases__c: 5, Free_Cases__c: 1,
        Goods_Receipt__r: { Name: "GRN-1", Primary_Order__r: { Name: "PO-1" } } }]);
    expect(result.items[0]).toMatchObject({ original: 6, reserved: 3, available: 3, order: "PO-1", receipt: "GRN-1" });
  });
  it("shows secondary order and outlet identity and never offers a negative balance", async () => {
    const result = await returnCatalogue("a0T000000000001AAA", "secondary", async q => q.includes("GROUP BY")
      ? [{ source: "line1", quantity: 12 }]
      : [{ Id: "line1", Piece_Quantity__c: 10, Sales_Order__r: { Name: "SO-1", Retailer__r: { Name: "Outlet" } } }]);
    expect(result.items[0]).toMatchObject({ original: 10, reserved: 12, available: 0, order: "SO-1", outlet: "Outlet" });
  });
  it("propagates a failed quantity read rather than offering already returned goods", async () => {
    await expect(returnCatalogue("a0T000000000001AAA", "primary", async q => {
      if (q.includes("GROUP BY")) throw new Error("Salesforce unavailable");
      return [{ Id: "receipt1", Received_Cases__c: 5 }];
    })).rejects.toThrow("Salesforce unavailable");
  });
  it("reloads all source lines for the selected order under the distributor scope", async () => {
    const queries: string[] = [];
    await returnCatalogue("a0T000000000001AAA", "primary", async q => { queries.push(q); return []; }, "a0V000000000001AAA");
    expect(queries[0]).toContain("Goods_Receipt__r.Primary_Order__c='a0V000000000001AAA'");
    expect(queries[0]).toContain("Goods_Receipt__r.Distributor__c='a0T000000000001AAA'");
    expect(queries[0]).toContain("Status__c='Received'");
  });
});
