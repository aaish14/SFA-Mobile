import { describe, it, expect } from "vitest";
import { calculateReports, distributorReports, reportPeriod } from "./reports.js";
const now = new Date("2026-10-21T08:00:00Z");
const period = reportPeriod(now);
/**
 * Build the records and test dependencies needed to exercise this module without relying on
 * production data.
 */
function fixture() {
  return {
    outlets: [1, 2, 3].map((n) => ({
      Id: `r${n}`,
      Active__c: n !== 3,
      Beat__c: "b1",
      Beat__r: { Name: "Central beat" },
      Geography__c: "g1",
      Geography__r: { Name: "Area" },
    })),
    orders: [
      {
        Id: "o1",
        Retailer__c: "r1",
        Visit__c: "v1",
        Order_Date__c: "2026-10-10",
        Total_Amount__c: 100,
        Visit__r: { Employee__c: "e1", Employee__r: { Name: "Employee" } },
      },
      {
        Id: "o2",
        Retailer__c: "r1",
        Visit__c: "v1",
        Order_Date__c: "2026-10-10",
        Total_Amount__c: 50,
      },
      {
        Id: "o3",
        Retailer__c: "r2",
        Order_Date__c: "2026-09-10",
        Total_Amount__c: 80,
      },
    ],
    lines: [
      {
        Sales_Order__c: "o1",
        Product__c: "p1",
        Product__r: { Name: "Product" },
        Line_Amount__c: 90,
      },
    ],
    visits: [
      { Id: "v1", Retailer__c: "r1", Status__c: "Completed" },
      { Id: "v2", Retailer__c: "r2", Status__c: "Planned" },
    ],
    plans: [{ Beat__c: "b1" }, { Beat__c: "b1" }],
    inventory: [
      {
        Id: "i1",
        Product__c: "p1",
        On_Hand_Pieces__c: 10,
        Available_Pieces__c: 8,
        Expiry_Date__c: "2026-11-01",
      },
      {
        Id: "i2",
        Product__c: "p2",
        On_Hand_Pieces__c: 5,
        Available_Pieces__c: 5,
        Expiry_Date__c: "2026-10-20",
      },
      {
        Id: "i3",
        Product__c: "p3",
        On_Hand_Pieces__c: 0,
        Available_Pieces__c: 0,
        Expiry_Date__c: "2026-10-21",
      },
    ],
    movement: [{ Product__c: "p1", Stock_Out_Pieces__c: 2 }],
    targets: [
      { Month__c: "2026-10-01", Target_Amount__c: 300 },
      { Month__c: "2026-10-01", Product__c: "p1", Target_Amount__c: 200 },
    ],
  };
}
describe("DMS management reports", () => {
  it("uses India calendar month across year and UTC midnight boundaries", () => {
    const p = reportPeriod(new Date("2026-12-31T20:00:00Z"));
    expect(p.today).toBe("2027-01-01");
    expect(p.previous).toBe("2026-12-01");
    expect(p.priorDay).toBe("2026-12-31");
  });
  it("deduplicates buyers, planned shops and productive visits, excluding inactive coverage", () => {
    const r = calculateReports(fixture(), period, now);
    expect(r.sales.current).toBe(150);
    expect(r.sales.previous).toBe(80);
    expect(r.sales.achievement).toBe(50);
    expect(r.sales.byProduct[0].current).toBe(90);
    expect(r.sales.byProduct[0].target).toBe(200);
    expect(r.beats[0]).toMatchObject({
      assigned: 2,
      planned: 2,
      visited: 1,
      productive: 1,
      productivity: 100,
    });
    expect(r.coverage).toMatchObject({ outlets: 2, buyers: 1, percent: 50 });
    expect(r.stock).toMatchObject({
      onHand: 15,
      available: 13,
      nearExpiry: 1,
      expired: 1,
      noRecentSales: 1,
    });
  });
  it("does not fabricate targets, empty coverage or slow movement for empty stock", () => {
    const r = calculateReports(
      {
        outlets: [],
        orders: [],
        lines: [],
        visits: [],
        plans: [],
        inventory: [],
        movement: [],
        targets: [],
      },
      period,
      now,
    );
    expect(r.sales.target).toBeNull();
    expect(r.sales.achievement).toBeNull();
    expect(r.coverage.percent).toBeNull();
  });
  it("has no 200-record report cap and applies distributor and valid-order scopes to every query", async () => {
    const queries: string[] = [],
      id = "a0T000000000001AAA";
    await distributorReports(
      id,
      async (query) => {
        queries.push(query);
        return [];
      },
      now,
    );
    expect(queries).toHaveLength(8);
    for (const query of queries) {
      expect(query).toContain(id);
      expect(query).not.toContain("LIMIT 200");
    }
    expect(queries.find((q) => q.includes("FROM Sales_Order__c"))).toContain(
      "Status__c IN ('Submitted','Fulfilled')",
    );
    expect(queries.find((q) => q.includes("FROM Sales_Order__c"))).toContain(
      "DMS_Status__c!='Rejected'",
    );
    expect(queries.find((q) => q.includes("FROM DMS_Invoice_Line__c"))).toContain(
      "Invoice__r.Status__c='Issued'",
    );
    await expect(distributorReports("' forged", async () => [])).rejects.toThrow(
      "Invalid distributor",
    );
  });
});
