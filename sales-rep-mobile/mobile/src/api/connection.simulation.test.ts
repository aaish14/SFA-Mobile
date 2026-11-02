import { describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
import { checkServerConnection } from "./connection";

const origin = process.env.SFA_CONNECTION_SIM_URL;
// Runs the real health-check fetch against the local Postman simulation. No Salesforce writes.
describe.skipIf(!origin)("connection recovery over real HTTP", () => {
  it("accepts the live-mode SFA response", async () => {
    await expect(checkServerConnection(`${origin}/api`)).resolves.toBeUndefined();
  });
  it("rejects an expired tunnel HTML response", async () => {
    await expect(checkServerConnection(`${origin}/html/api`)).rejects.toThrow("existing connection");
  });
  it("rejects a demo-data server", async () => {
    await expect(checkServerConnection(`${origin}/demo/api`)).rejects.toThrow("existing connection");
  });
});
