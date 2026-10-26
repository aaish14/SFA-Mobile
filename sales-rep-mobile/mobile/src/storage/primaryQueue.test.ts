import { beforeEach, describe, it, expect, vi } from "vitest";
const memory = vi.hoisted(() => new Map<string, string>());
const post = vi.hoisted(() => vi.fn());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => memory.get(key) || null,
    setItem: async (key: string, value: string) => {
      memory.set(key, value);
    },
    getAllKeys: async () => [...memory.keys()],
    multiGet: async (keys: string[]) => keys.map((key) => [key, memory.get(key)]),
  },
}));
vi.mock("../api/client", () => ({ post }));
import {
  savePrimary,
  syncPrimary,
  primaryPending,
  primaryPendingCount,
  discardRejectedPrimary,
  primaryRequestKey,
} from "./primaryQueue";
describe("employee primary offline queue", () => {
  beforeEach(() => {
    memory.clear();
    post.mockReset();
    memory.set("currentUser", JSON.stringify({ employeeId: "employee-a" }));
  });
  /**
   * Construct a queued primary transaction payload for storage and retry tests.
   */
  const body = () => ({
    action: "primaryOrder" as const,
    requestKey: primaryRequestKey(),
    lines: [{ productId: "product", cases: 2 }],
    notes: "",
  });
  it("persists before transmission and retries with exactly the same key", async () => {
    const payload = body();
    await savePrimary("employee-a", payload);
    post.mockRejectedValueOnce(Object.assign(new Error("Network unavailable"), { status: 502 }));
    await expect(syncPrimary("employee-a")).rejects.toThrow("Network unavailable");
    expect(await primaryPendingCount()).toBe(1);
    post.mockResolvedValueOnce({ id: "saved", status: "Submitted" });
    await syncPrimary("employee-a");
    expect(post.mock.calls[0][1]).toEqual(payload);
    expect(post.mock.calls[1][1]).toEqual(payload);
    expect(await primaryPending("employee-a")).toHaveLength(0);
  });
  it("cannot submit another employee’s queued work", async () => {
    await savePrimary("employee-a", body());
    memory.set("currentUser", JSON.stringify({ employeeId: "employee-b" }));
    await expect(syncPrimary("employee-a")).rejects.toThrow("employee who saved");
    expect(post).not.toHaveBeenCalled();
  });
  it("retains ambiguous failures but permits removing confirmed rejected requests", async () => {
    const payload = body();
    await savePrimary("employee-a", payload);
    post.mockRejectedValueOnce(Object.assign(new Error("Invalid quantity"), { status: 400 }));
    await expect(syncPrimary("employee-a")).rejects.toThrow();
    await syncPrimary("employee-a");
    expect(post).toHaveBeenCalledTimes(1);
    await discardRejectedPrimary("employee-a", payload.requestKey);
    expect(await primaryPendingCount()).toBe(0);
    const other = body();
    await savePrimary("employee-a", other);
    await discardRejectedPrimary("employee-a", other.requestKey);
    expect(await primaryPendingCount()).toBe(1);
  });
});
