import { describe, it, expect } from "vitest";
import { primaryCatalogue } from "./primaryCatalogue.js";
describe("distributor primary catalogue", () => {
  it("keeps only product-linked, matching-region Primary schemes without inventing prices", async () => {
    const queries: string[] = [];
    const result = await primaryCatalogue(
      { Id: "dist", Geography__r: { Name: "North" } },
      async (query) => {
        queries.push(query);
        return query.includes("FROM Product__c")
          ? [{ Id: "p", Name: "Product", DMS_Case_Price__c: null }]
          : [
              { Id: "direct", Product__c: "p", Region__c: "North" },
              { Id: "linked", Scheme_Products__r: { records: [{ Product__c: "p" }] } },
              { Id: "other-region", Product__c: "p", Region__c: "South" },
              { Id: "other-product", Product__c: "q" },
            ];
      },
    );
    expect(result.products[0].schemes.map((s: any) => s.Id)).toEqual(["direct", "linked"]);
    expect(result.products[0].DMS_Case_Price__c).toBeNull();
    expect(queries[1]).toContain("Sales_Channel__c='Primary'");
    expect(queries[1]).toContain("End_Date__c>=TODAY");
    expect(queries[1]).toContain("Start_Date__c<=TODAY");
    expect(queries[1]).toContain("Outlet_Type__c=null");
    expect(queries.every((q) => !q.includes("LIMIT"))).toBe(true);
  });
});
