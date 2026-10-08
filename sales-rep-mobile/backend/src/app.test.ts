import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";

let app: Express;

beforeAll(async () => {
  process.env.USE_MOCK_DATA = "true";
  process.env.AUTH_ALLOW_TEST_CODE = "true";
  ({ app } = await import("./app.js"));
});

async function token() {
  const requested = await request(app)
    .post("/api/auth/request-code")
    .send({ email: "edge@sfa.demo" });
  const verified = await request(app)
    .post("/api/auth/verify-code")
    .send({ email: "edge@sfa.demo", code: requested.body.data.testCode });
  return verified.body.data.token;
}

describe("SFA API", () => {
  it("rejects protected requests without an application session", async () => {
    const response = await request(app).get("/api/dashboard");
    expect(response.status).toBe(401);
    expect(response.body.errorCode).toBe("UNAUTHORIZED");
  });

  it("emails a short-lived sign-in code and keeps distributor identity in the session", async () => {
    const t = await token();
    const response = await request(app)
      .get("/api/auth/session")
      .set("Authorization", `Bearer ${t}`);
    expect(response.body.data.user.distributorName).toBe("Edge Communications");
  });

  it("rejects an incorrect sign-in code", async () => {
    await request(app).post("/api/auth/request-code").send({ email: "edge@sfa.demo" });
    const response = await request(app)
      .post("/api/auth/verify-code")
      .send({ email: "edge@sfa.demo", code: "000000" });
    expect(response.status).toBe(401);
    expect(response.body.errorCode).toBe("INVALID_CODE");
  });

  it("loads dashboard and beats", async () => {
    const t = await token();
    expect((await request(app).get("/api/dashboard").set("Authorization", `Bearer ${t}`)).body.success).toBe(true);
    expect((await request(app).get("/api/beats").set("Authorization", `Bearer ${t}`)).body.data.length).toBeGreaterThan(0);
  });

  it("enforces the 100 metre visit radius", async () => {
    const t = await token();
    const near = await request(app)
      .post("/api/store/validate-location")
      .set("Authorization", `Bearer ${t}`)
      .send({ storeId: "store-1", location: { latitude: 12.9719, longitude: 77.5949 } });
    const far = await request(app)
      .post("/api/store/validate-location")
      .set("Authorization", `Bearer ${t}`)
      .send({ storeId: "store-1", location: { latitude: 12.981, longitude: 77.61 } });
    expect(near.body.data.allowed).toBe(true);
    expect(far.body.data.allowed).toBe(false);
  });
});
