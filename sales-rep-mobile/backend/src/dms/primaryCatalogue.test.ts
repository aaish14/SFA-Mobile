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
    expect(queries[2]).toContain("WHERE Active__c=true) FROM Scheme__c");
    expect(queries.every((q) => !q.includes("LIMIT"))).toBe(true);
  });
  it("shows linked legacy and expired offers as information without making them selectable", async () => {
    const available = {
      Id: "primary",
      Name: "Case offer",
      Product__c: "p",
      Active__c: true,
      Sales_Channel__c: "Primary",
    };
    const legacy = {
      Id: "legacy",
      Name: "Piece offer",
      Product__c: "p",
      Active__c: true,
      Sales_Channel__c: null,
      Outlet_Type__c: "General Store",
    };
    const expired = { ...available, Id: "expired", End_Date__c: "2020-01-01" };
    const result = await primaryCatalogue({ Geography__r: { Name: "North" } }, async (query) =>
      query.includes("FROM Product__c")
        ? [{ Id: "p" }]
        : query.includes("Sales_Channel__c='Primary'")
          ? [available]
          : [available, legacy, expired],
    );
    expect(result.products[0].schemes.map((row: any) => row.Id)).toEqual(["primary"]);
    expect(result.products[0].linkedSchemes).toEqual([
      { ...available, applicableToPrimary: true, unavailableReasons: [] },
      {
        ...legacy,
        applicableToPrimary: false,
        unavailableReasons: [
          "Primary / Secondary is not set in Salesforce.",
          "Restricted to General Store outlets.",
        ],
      },
      {
        ...expired,
        applicableToPrimary: false,
        unavailableReasons: ["Outside the scheme's active dates."],
      },
    ]);
  });
  it("matches direct and active junction links once, never a free-product reference or a name guess", async () => {
    const offers = [
      { Id: "both", Product__c: "p", Scheme_Products__r: { records: [{ Product__c: "p" }] } },
      { Id: "junction", Scheme_Products__r: { records: [{ Product__c: "p" }] } },
      { Id: "bonus", Product__c: "other", Free_Product__c: "p" },
      { Id: "unlinked", Name: "p special offer" },
    ];
    const result = await primaryCatalogue({}, async (query) =>
      query.includes("FROM Product__c")
        ? [{ Id: "p" }, { Id: "without-offers" }]
        : query.includes("Sales_Channel__c='Primary'")
          ? []
          : offers,
    );
    expect(result.products[0].linkedSchemes.map((row: any) => row.Id)).toEqual([
      "both",
      "junction",
    ]);
    expect(result.products[0].schemes).toEqual([]);
    expect(result.products[1].linkedSchemes).toEqual([]);
  });
});
