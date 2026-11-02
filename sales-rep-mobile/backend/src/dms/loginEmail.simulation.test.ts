import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { salesforce } from "../salesforce/SalesforceService.js";
import { createDmsRouter } from "./router.js";

describe.skipIf(!process.env.DMS_SIMULATION_URL)("DMS Salesforce Send Email HTTP contract", () => {
  afterEach(() => vi.restoreAllMocks());
  function app(accessToken = "synthetic-session") {
    vi.spyOn(salesforce, "dmsSession").mockResolvedValue({
      instanceUrl: process.env.DMS_SIMULATION_URL!, accessToken,
      expiresAt: Date.now() + 600000,
    });
    const api = express(); api.use(express.json());
    api.use("/api/dms", createDmsRouter());
    return api;
  }
  it("sends the generated challenge through the original Salesforce action and verifies it once without re-emailing", async () => {
    const api = app(), email = "test@example.invalid";
    const sent = await request(api).post("/api/dms/auth/request-code").send({ email });
    expect(sent.status).toBe(200);
    const mailbox = async () => (await fetch(`${process.env.DMS_SIMULATION_URL}/test/mailbox`)).json();
    const messages = await mailbox();
    expect(messages.at(-1).via).toBe("emailSimple");
    const code = messages.at(-1).code;
    expect(JSON.stringify(sent.body)).not.toContain(code);
    const verify = () => request(api).post("/api/dms/auth/verify-code").send({ email, code });
    expect((await verify()).status).toBe(200);
    expect((await verify()).status).toBe(401);
    expect((await mailbox()).length).toBe(messages.length);
  });
  it("does not report success when Salesforce rejects the email", async () => {
    const sent = await request(app()).post("/api/dms/auth/request-code")
      .send({ email: "email-failure@example.invalid" });
    expect(sent.status).toBe(503);
    expect(sent.body.errorCode).toBe("EMAIL_FAILED");
  });
  it("shows the Salesforce daily limit instead of suggesting that an email was sent", async () => {
    const sent = await request(app()).post("/api/dms/auth/request-code")
      .send({ email: "limit@example.invalid" });
    expect(sent.status).toBe(503);
    expect(sent.body.errorCode).toBe("EMAIL_LIMIT_REACHED");
  });
  it("requires explicit Salesforce email acceptance before creating a challenge", async () => {
    const api = app(), email = "unconfirmed@example.invalid";
    expect((await request(api).post("/api/dms/auth/request-code").send({ email })).status).toBe(503);
    expect((await request(api).post("/api/dms/auth/verify-code").send({ email, code: "123456" })).status).toBe(401);
  });
  it.each([
    ["synthetic-session", "EMAIL_LIMIT_REACHED"],
    ["limits-available", "EMAIL_FAILED"],
    ["limits-unavailable", "EMAIL_FAILED"],
  ])("uses live limits to diagnose an ambiguous rejection (%s)", async (token, expectedError) => {
    const api = app(token), email = "ambiguous-limit@example.invalid";
    const sent = await request(api).post("/api/dms/auth/request-code").send({ email });
    expect(sent.status).toBe(503);
    expect(sent.body.errorCode).toBe(expectedError);
    expect((await request(api).post("/api/dms/auth/verify-code").send({ email, code: "123456" })).status).toBe(401);
  });
  it("renews an expired Salesforce session and sends only one email", async () => {
    const api = app();
    let refreshed = false;
    vi.mocked(salesforce.dmsSession).mockImplementation(async refresh => {
      if (refresh) refreshed = true;
      return {instanceUrl: process.env.DMS_SIMULATION_URL!, accessToken: refreshed ? "synthetic-session" : "expired-session", expiresAt: Date.now() + 600000};
    });
    const mailbox = async () => (await fetch(`${process.env.DMS_SIMULATION_URL}/test/mailbox`)).json();
    const before = (await mailbox()).length;
    expect((await request(api).post("/api/dms/auth/request-code").send({email:"test@example.invalid"})).status).toBe(200);
    expect(refreshed).toBe(true);
    expect((await mailbox()).length).toBe(before + 1);
  });
});
