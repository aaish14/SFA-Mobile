import { describe, it, expect } from "vitest";
import { distributorDashboard } from "./dashboard.js";
describe("purchased versus sold aggregates", () => {
  it("does not use capped detail lists and fills months without transactions with zero", async () => {
    const queries: string[] = [];
    const data = await distributorDashboard(
      "a0T000000000001AAA",
      async (query) => {
        queries.push(query);
        if (!query.includes("GROUP BY"))
          return [{ amount: query.includes("Receipt") ? 20000 : 15000 }];
        return [
          {
            year: 2026,
            month: 10,
            amount: query.includes("Receipt") ? 5000 : 3000,
          },
        ];
      },
      new Date("2026-10-21T10:00:00Z"),
    );
    expect(data.purchased).toBe(20000);
    expect(data.sold).toBe(15000);
    expect(data.months).toHaveLength(6);
    expect(data.months[0]).toMatchObject({ month: 5, purchased: 0, sold: 0 });
    expect(data.months[5]).toMatchObject({
      month: 10,
      purchased: 5000,
      sold: 3000,
    });
    queries.forEach((query) => {
      expect(query).toContain("Distributor__c='a0T000000000001AAA'");
      expect(query).not.toContain("LIMIT");
    });
    expect(queries[0]).toContain("Status__c='Received'");
    expect(queries[2]).toContain("Status__c='Issued'");
  });
  it("handles empty totals and year boundaries", async () => {
    const data = await distributorDashboard(
      "a0T000000000001AAA",
      async () => [{ amount: null }],
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(data.purchased).toBe(0);
    expect(data.sold).toBe(0);
    expect(data.months[0]).toMatchObject({ year: 2025, month: 8 });
    expect(data.months[5]).toMatchObject({ year: 2026, month: 1 });
  });
});
