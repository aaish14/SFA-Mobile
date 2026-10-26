import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { DmsTransport } from "./transport.js";
import { distributorReports } from "./reports.js";
import express from "express";
import request from "supertest";
import { createDmsRouter } from "./router.js";

// Opt-in integration test: start the documented local Postman simulation first.
describe.skipIf(!process.env.DMS_SIMULATION_URL)("DMS actual HTTP dependency simulation", () => {
  const simulationSession = randomUUID();
  const transport = new DmsTransport(
    async () => ({
      instanceUrl: process.env.DMS_SIMULATION_URL!,
      accessToken: "simulation-only-not-a-credential",
    }),
    (url, options) =>
      fetch(url, {
        ...options,
        headers: { ...options?.headers, "x-mock-session": simulationSession },
      }),
  );
  /**
   * Build a ticket request fixture for the command lifecycle/replay scenario.
   */
  const ticket = () => ({
    action: "ticket",
    distributorId: "a0T000000000001AAA",
    requestKey: randomUUID(),
    subject: "Delivery",
    category: "Delivery",
    description: "Missing shipment",
  });
  it("runs distributor catalogue and submission routes through the real Salesforce HTTP transport", async () => {
    let code = "";
    const app = express();
    app.use(express.json());
    app.use(
      "/dms",
      createDmsRouter({
        records: (q) => transport.records(q),
        command: (b) => transport.command(b),
        sendCode: async (_, value) => {
          code = value;
        },
      }),
    );
    await request(app).post("/dms/auth/request-code").send({ email: "test@example.invalid" });
    const login = await request(app)
      .post("/dms/auth/verify-code")
      .send({ email: "test@example.invalid", code });
    const token = login.body.data.token;
    const invoices = await request(app).get("/dms/invoices").auth(token, { type: "bearer" });
    expect(invoices.status).toBe(200);
    expect(invoices.body.data.items[0].Total_Amount__c).toBe(210);
    const detail = await request(app).get("/dms/invoices/a0I000000000001AAA").auth(token, { type: "bearer" });
    expect(detail.status).toBe(200);
    expect(detail.body.data.lines[0].Cases__c).toBe(2);
    const pdf = await request(app).get("/dms/invoices/a0I000000000001AAA/pdf").auth(token, { type: "bearer" });
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 4).toString()).toBe("%PDF");
    expect((await request(app).get("/dms/invoices/a0I000000000002AAA/pdf").auth(token, { type: "bearer" })).status).toBe(404);
    expect((await request(app).get("/dms/invoices")).status).toBe(401);
    const catalogue = await request(app)
      .get("/dms/primary/catalogue")
      .auth(token, { type: "bearer" });
    expect(catalogue.status).toBe(200);
    expect(catalogue.body.data.products[0].schemes).toHaveLength(1);
    const body = {
      requestKey: randomUUID(),
      lines: [{ productId: "a01000000000001AAA", cases: 2, schemeId: "a02000000000001AAA" }],
    };
    /**
     * Submit the test transaction through the workflow under test and return its result where
     * applicable.
     */
    const submit = (payload: any) =>
      request(app).post("/dms/primary/orders").auth(token, { type: "bearer" }).send(payload);
    const saved = await submit(body);
    expect(saved.status).toBe(200);
    expect(saved.body.data.status).toBe("Submitted");
    expect((await submit(body)).body.data).toEqual(saved.body.data);
    expect((await submit({ ...body, notes: "changed" })).status).toBe(400);
    expect(
      (await submit({ ...body, requestKey: randomUUID(), lines: [{ ...body.lines[0], cases: 1 }] }))
        .status,
    ).toBe(400);
  });
  it("calculates management reports through real HTTP reads", async () => {
    const reports = await distributorReports(
      "a0T000000000001AAA",
      (query) => transport.records(query),
      new Date("2026-10-21T08:00:00Z"),
    );
    expect(reports.sales.current).toBe(200);
    expect(reports.sales.target).toBeNull();
    expect(reports.coverage.percent).toBe(100);
    expect(reports.beats[0]).toMatchObject({
      planned: 1,
      visited: 1,
      productive: 1,
    });
  });
  it("posts a goods receipt through the authenticated route and reads it back", async () => {
    let code = "";
    const app = express();
    app.use(express.json());
    app.use(
      "/dms",
      createDmsRouter({
        records: (q) => transport.records(q),
        command: (b) => transport.command(b),
        sendCode: async (_, value) => {
          code = value;
        },
      }),
    );
    await request(app).post("/dms/auth/request-code").send({ email: "test@example.invalid" });
    const login = await request(app)
      .post("/dms/auth/verify-code")
      .send({ email: "test@example.invalid", code });
    const token = login.body.data.token;
    const body = {
      action: "receiveGoods",
      receiptKind: "Paid",
      recordId: "a0U000000000001AAA",
      requestKey: randomUUID(),
      cases: 1,
      batch: "01",
      expiry: "2026-12-14",
    };
    /**
     * Submit the test transaction through the workflow under test and return its result where
     * applicable.
     */
    const submit = (payload: any) =>
      request(app).post("/dms/transactions").auth(token, { type: "bearer" }).send(payload);
    const saved = await submit(body);
    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual({ id: "a0Z000000000001AAA", status: "Received" });
    expect((await submit(body)).body.data).toEqual(saved.body.data);
    expect((await submit({ ...body, expiry: "14-12-2026" })).status).toBe(400);
    const rows = await transport.records(
      "SELECT Id,Name FROM DMS_Goods_Receipt__c WHERE Distributor__c='a0T000000000001AAA'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      Id: saved.body.data.id,
      Status__c: "Received",
      Total_Pieces__c: 72,
    });
  });
  it("follows query pages and does not turn an upstream failure into empty reports", async () => {
    expect(await transport.records("SIMULATE_PAGE")).toEqual([{ Id: "first" }, { Id: "second" }]);
    await expect(transport.records("SIMULATE_READ_HTML")).rejects.toMatchObject({ status: 502 });
  });
  it("writes over HTTP and replays the same stable request", async () => {
    const body = ticket(),
      saved = await transport.command(body);
    expect(saved.status).toBe("Open");
    expect(await transport.command(body)).toEqual(saved);
    await expect(
      transport.command({ ...body, description: "Changed payload" }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("preserves validation errors without claiming success", async () => {
    await expect(transport.command({ ...ticket(), category: "Invalid" })).rejects.toMatchObject({
      status: 400,
    });
  });
  it("handles HTML 530 as an unconfirmed operation", async () => {
    await expect(
      transport.command({ ...ticket(), subject: "SIMULATE_HTML_530" }),
    ).rejects.toMatchObject({ status: 502 });
  });
  it("rejects malformed 200 responses", async () => {
    await expect(
      transport.command({ ...ticket(), subject: "SIMULATE_INVALID_SUCCESS" }),
    ).rejects.toMatchObject({ status: 502 });
  });
});
