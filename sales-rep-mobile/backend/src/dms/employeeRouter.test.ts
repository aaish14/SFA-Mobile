import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createEmployeeDmsRouter } from "./employeeRouter.js";
const employeeId = "a0E000000000001AAA",
  distributorId = "a0T000000000001AAA";
/**
 * Build the records and test dependencies needed to exercise this module without relying on
 * production data.
 */
function fixture(assigned = true) {
  const commands: any[] = [],
    queries: string[] = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).auth = { employeeId };
    next();
  });
  app.use(
    "/primary",
    createEmployeeDmsRouter({
      records: async (query) => {
        queries.push(query);
        return query.includes("FROM Employee__c") && assigned
          ? [{ Id: employeeId, DMS_Distributor__c: distributorId }]
          : [];
      },
      command: async (body) => {
        commands.push(body);
        return { id: "saved", status: "Submitted" };
      },
    }),
  );
  return { app, commands, queries };
}
describe("SFA primary entry boundary", () => {
  it("passes a selected scheme ID but rejects client-owned prices", async () => {
    const f = fixture();
    const body = {
      action: "primaryOrder",
      requestKey: randomUUID(),
      lines: [{ productId: distributorId, schemeId: employeeId, cases: 3 }],
    };
    expect((await request(f.app).post("/primary/submit").send(body)).status).toBe(200);
    expect(f.commands[0].lines[0]).toMatchObject({ schemeId: employeeId, cases: 3 });
    expect(
      (
        await request(f.app)
          .post("/primary/submit")
          .send({ ...body, lines: [{ ...body.lines[0], casePrice: 1 }] })
      ).status,
    ).toBe(400);
    expect(f.commands).toHaveLength(1);
  });
  it("derives distributor and employee from the verified session", async () => {
    const f = fixture(),
      body = {
        action: "primaryOrder",
        requestKey: randomUUID(),
        lines: [{ productId: distributorId, cases: 2 }],
      };
    expect((await request(f.app).post("/primary/submit").send(body)).status).toBe(200);
    expect(f.commands[0]).toMatchObject({ employeeId, distributorId });
    expect(
      (
        await request(f.app)
          .post("/primary/submit")
          .send({ ...body, employeeId: "forged" })
      ).status,
    ).toBe(400);
    expect(f.commands).toHaveLength(1);
  });
  it("blocks unassigned employees and invalid returns", async () => {
    expect((await request(fixture(false).app).get("/primary/catalogue")).status).toBe(403);
    const f = fixture();
    expect(
      (
        await request(f.app)
          .post("/primary/submit")
          .send({
            action: "primaryReturn",
            requestKey: randomUUID(),
            lines: [{ receiptLineId: distributorId, cases: 1, reason: "Other" }],
          })
      ).status,
    ).toBe(400);
    expect(f.commands).toHaveLength(0);
  });
  it("scopes order history to employee and receipts to distributor", async () => {
    const f = fixture();
    expect((await request(f.app).get("/primary/catalogue")).status).toBe(200);
    expect(f.queries.find((q) => q.includes("FROM DMS_Primary_Order__c"))).toContain(
      `Employee__c='${employeeId}'`,
    );
    expect(f.queries.find((q) => q.includes("FROM DMS_Goods_Receipt_Line__c"))).toContain(
      `Distributor__c='${distributorId}'`,
    );
  });
});
