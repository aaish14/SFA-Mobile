import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./app.js";
async function token() {
  const r = await request(app)
    .post("/api/auth/login")
    .send({ username: "edge@sfa.demo", password: "demo123" });
  return r.body.data.token;
}
describe("SFA API", () => {
  it("rejects protected requests without an application session", async () => {
    const response = await request(app).get("/api/dashboard");
    expect(response.status).toBe(401);
    expect(response.body.errorCode).toBe("UNAUTHORIZED");
  });

  it("keeps distributor identity in the signed session", async () => {
    const t = await token();
    const response = await request(app)
      .get("/api/auth/session")
      .set("Authorization", `Bearer ${t}`);
    expect(response.body.data.user.distributorName).toBe("Edge Communications");
  });
  it("loads dashboard and beats", async () => {
    const t = await token();
    expect(
      (
        await request(app)
          .get("/api/dashboard")
          .set("Authorization", `Bearer ${t}`)
      ).body.success,
    ).toBe(true);
    expect(
      (await request(app).get("/api/beats").set("Authorization", `Bearer ${t}`))
        .body.data.length,
    ).toBeGreaterThan(0);
  });
  it("enforces 100 metre radius", async () => {
    const t = await token();
    const near = await request(app)
      .post("/api/store/validate-location")
      .set("Authorization", `Bearer ${t}`)
      .send({
        storeId: "store-1",
        location: { latitude: 12.9719, longitude: 77.5949 },
      });
    const far = await request(app)
      .post("/api/store/validate-location")
      .set("Authorization", `Bearer ${t}`)
      .send({
        storeId: "store-1",
        location: { latitude: 12.981, longitude: 77.61 },
      });
    expect(near.body.data.allowed).toBe(true);
    expect(far.body.data.allowed).toBe(false);
  });
});
