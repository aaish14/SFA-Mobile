import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { createDmsRouter } from "./router.js";
import { env } from "../config/env.js";

const distributorId = "a0T000000000001AAA";
/**
 * Build the records and test dependencies needed to exercise this module without relying on
 * production data.
 */
function fixture() {
  let code = "",
    active = true,
    duplicate = false,
    emailFails = false;
  const queries: string[] = [],
    commands: any[] = [];
  const app = express();
  app.use(express.json());
  app.use(
    "/api/dms",
    createDmsRouter({
      records: async (query) => {
        queries.push(query);
        if (query.includes("FROM DMS_Distributor__c"))
          return !active
            ? []
            : duplicate
              ? [{ Id: distributorId }, { Id: "other" }]
              : [
                  {
                    Id: distributorId,
                    Name: "Test distributor",
                    Login_Email__c: "test@example.invalid",
                  },
                ];
        return [];
      },
      sendCode: async (_email, value) => {
        if (emailFails) throw new Error("Synthetic email failure");
        code = value;
      },
      command: async (body) => {
        commands.push(body);
        return { id: "a0T000000000002AAA", status: "Open" };
      },
    }),
  );
  /**
   * Exercise the test sign-in flow and return the session needed by subsequent test requests.
   */
  const login = async () => {
    const sent = await request(app)
      .post("/api/dms/auth/request-code")
      .send({ email: "test@example.invalid" });
    expect(sent.body.data.testCode).toBeUndefined();
    return request(app)
      .post("/api/dms/auth/verify-code")
      .send({ email: "test@example.invalid", code });
  };
  return {
    app,
    login,
    commands,
    queries,
    getCode: () => code,
    disable: () => (active = false),
    duplicate: () => (duplicate = true),
    failEmail: () => (emailFails = true),
  };
}
describe("isolated DMS distributor API", () => {
  it("sends a different code on resend and rejects the old code", async () => {
    const clock = vi.spyOn(Date, "now");
    const start = Date.now();
    try {
      clock.mockReturnValue(start);
      const f = fixture();
      /**
       * Send an HTTP request to the test router and decode the result for assertions.
       */
      const send = () =>
        request(f.app).post("/api/dms/auth/request-code").send({ email: "test@example.invalid" });
      expect((await send()).status).toBe(200);
      const oldCode = f.getCode();
      expect((await send()).status).toBe(429);
      clock.mockReturnValue(start + 61000);
      const resent = await send();
      expect(resent.status).toBe(200);
      expect(JSON.stringify(resent.body)).not.toContain(f.getCode());
      expect(f.getCode()).not.toBe(oldCode);
      expect(
        (
          await request(f.app)
            .post("/api/dms/auth/verify-code")
            .send({ email: "test@example.invalid", code: oldCode })
        ).status,
      ).toBe(401);
      expect(
        (
          await request(f.app)
            .post("/api/dms/auth/verify-code")
            .send({ email: "test@example.invalid", code: f.getCode() })
        ).status,
      ).toBe(200);
    } finally {
      clock.mockRestore();
    }
  });
  it("does not invalidate an existing code when resend email fails", async () => {
    const clock = vi.spyOn(Date, "now");
    const start = Date.now();
    try {
      clock.mockReturnValue(start);
      const f = fixture();
      await request(f.app)
        .post("/api/dms/auth/request-code")
        .send({ email: "test@example.invalid" });
      const original = f.getCode();
      f.failEmail();
      clock.mockReturnValue(start + 61000);
      expect(
        (
          await request(f.app)
            .post("/api/dms/auth/request-code")
            .send({ email: "test@example.invalid" })
        ).status,
      ).toBe(503);
      expect(
        (
          await request(f.app)
            .post("/api/dms/auth/verify-code")
            .send({ email: "test@example.invalid", code: original })
        ).status,
      ).toBe(200);
    } finally {
      clock.mockRestore();
    }
  });
  it("submits distributor primary orders with session identity only and rejects client pricing", async () => {
    const f = fixture(),
      token = (await f.login()).body.data.token;
    const body = {
      requestKey: randomUUID(),
      lines: [{ productId: "a01000000000001AAA", cases: 2, schemeId: "a02000000000001AAA" }],
    };
    /**
     * Submit the test transaction through the workflow under test and return its result where
     * applicable.
     */
    const submit = (payload: any) =>
      request(f.app).post("/api/dms/primary/orders").auth(token, { type: "bearer" }).send(payload);
    expect((await submit(body)).status).toBe(200);
    expect(f.commands[0]).toEqual({ ...body, action: "distributorPrimaryOrder", distributorId });
    expect((await submit({ ...body, employeeId: distributorId })).status).toBe(400);
    expect((await submit({ ...body, distributorId: "another" })).status).toBe(400);
    expect((await submit({ ...body, lines: [{ ...body.lines[0], price: 1 }] })).status).toBe(400);
    expect((await submit({ ...body, lines: [body.lines[0], body.lines[0]] })).status).toBe(400);
    expect((await submit({ ...body, lines: [{ ...body.lines[0], cases: 0.5 }] })).status).toBe(400);
    expect(f.commands).toHaveLength(1);
    expect((await request(f.app).post("/api/dms/primary/orders").send(body)).status).toBe(401);
    expect(
      (await request(f.app).get("/api/dms/primary/catalogue").auth(token, { type: "bearer" }))
        .status,
    ).toBe(200);
    f.disable();
    expect((await submit(body)).status).toBe(403);
  });
  it("rejects anonymous and existing SFA tokens", async () => {
    const f = fixture();
    expect((await request(f.app).get("/api/dms/overview")).status).toBe(401);
    const token = jwt.sign({ employeeId: "employee", distributorId }, env.JWT_SECRET);
    expect(
      (await request(f.app).get("/api/dms/overview").auth(token, { type: "bearer" })).status,
    ).toBe(401);
  });
  it("uses one-use codes, throttles requests and never returns codes", async () => {
    const f = fixture();
    expect((await f.login()).status).toBe(200);
    expect(
      (
        await request(f.app)
          .post("/api/dms/auth/verify-code")
          .send({ email: "test@example.invalid", code: f.getCode() })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(f.app)
          .post("/api/dms/auth/request-code")
          .send({ email: "test@example.invalid" })
      ).status,
    ).toBe(429);
  });
  it("does not send a code for ambiguous logins", async () => {
    const f = fixture();
    f.duplicate();
    await request(f.app).post("/api/dms/auth/request-code").send({ email: "test@example.invalid" });
    expect(f.getCode()).toBe("");
  });
  it("queries only session distributor data and revokes a disabled account", async () => {
    const f = fixture(),
      token = (await f.login()).body.data.token;
    expect(
      (await request(f.app).get("/api/dms/overview").auth(token, { type: "bearer" })).status,
    ).toBe(200);
    const scoped = f.queries.filter((query) => !query.includes("FROM DMS_Distributor__c"));
    expect(scoped).toHaveLength(17);
    for (const query of scoped) {
      expect(query).toContain(distributorId);
      if (!query.includes("SUM(")) expect(query).toContain("LIMIT 200");
      else expect(query).not.toContain("LIMIT 200");
    }
    expect(scoped.some((query) => query.includes("FROM Asset_Survey__c"))).toBe(true);
    const report = await request(f.app).get("/api/dms/reports").auth(token, { type: "bearer" });
    expect(report.status).toBe(200);
    expect(report.body.data.sales.target).toBeNull();
    expect(report.body.data.coverage.percent).toBeNull();
    f.disable();
    expect(
      (await request(f.app).get("/api/dms/overview").auth(token, { type: "bearer" })).status,
    ).toBe(403);
  });
  it("ignores forged distributor identity and validates before writing", async () => {
    const f = fixture(),
      token = (await f.login()).body.data.token;
    const ticket = {
      requestKey: randomUUID(),
      subject: "Delivery",
      category: "Delivery",
      description: "Missing shipment",
      distributorId: "forged",
    };
    expect(
      (await request(f.app).post("/api/dms/tickets").auth(token, { type: "bearer" }).send(ticket))
        .status,
    ).toBe(200);
    expect(f.commands[0].distributorId).toBe(distributorId);
    expect(
      (
        await request(f.app).post("/api/dms/transactions").auth(token, { type: "bearer" }).send({
          action: "returnDecision",
          recordId: distributorId,
          decision: "Rejected",
        })
      ).status,
    ).toBe(400);
    expect(f.commands).toHaveLength(1);
  });
});
