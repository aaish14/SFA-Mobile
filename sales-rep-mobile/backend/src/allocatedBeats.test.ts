import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";
import { allocatedBeats } from "./services/allocatedBeats.js";

const records = vi.hoisted(() => vi.fn());
vi.mock("./salesforce/SalesforceService.js", () => ({ salesforce: { records } }));
let app: Express;
let token: string;
const allocation = (beat: string, outlet: string) => ({ Beat__c: beat, Beat__r: { Name: beat }, Outlet__c: outlet, Outlet__r: { Name: outlet } });

beforeAll(async () => {
  process.env.USE_MOCK_DATA = "false";
  process.env.JWT_SECRET = "allocation-test-secret-only";
  ({ app } = await import("./app.js"));
  token = jwt.sign({ employeeId: "employee-test", beatId: "old-primary-beat" }, process.env.JWT_SECRET);
});
beforeEach(() => records.mockReset());

describe("approved allocation routes", () => {
  it("deduplicates outlets and calculates completed/pending counts", () => {
    const result = allocatedBeats([allocation("B", "one"), allocation("B", "one"), allocation("B", "two"), allocation("A", "three")], new Set(["one"]));
    expect(result.map((beat) => beat.id)).toEqual(["A", "B"]);
    expect(result[1]).toMatchObject({ stores: 2, storeCount: 2, completed: 1, pending: 1 });
  });
  it("returns all allocated beats rather than the token's single primary beat", async () => {
    records.mockResolvedValueOnce([allocation("First", "one"), allocation("Second", "two")]).mockResolvedValueOnce([]);
    const response = await request(app).get("/api/beats").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.map((beat: any) => beat.id)).toEqual(["First", "Second"]);
    expect(records.mock.calls[0][0]).toContain("Employee__c = 'employee-test'");
    expect(records.mock.calls[0][0]).toContain("Allocation_Status__c = 'Active'");
    expect(records.mock.calls[0][0]).not.toContain("old-primary-beat");
  });
  it("returns no routes when the employee has no allocations", async () => {
    records.mockResolvedValue([]);
    const response = await request(app).get("/api/beats").set("Authorization", `Bearer ${token}`);
    expect(response.body.data).toEqual([]);
  });
  it("does not query Salesforce for unauthenticated requests", async () => {
    expect((await request(app).get("/api/beats")).status).toBe(401);
    expect(records).not.toHaveBeenCalled();
  });
});
