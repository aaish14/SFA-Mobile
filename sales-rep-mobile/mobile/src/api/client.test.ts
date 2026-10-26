import { beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn(), multiRemove: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
import { api, post, postRecoverable } from "./client";

describe("network failure handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    storage.getItem.mockResolvedValue(null);
  });
  it("shows a useful message for the HTML 530 tunnel error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>530</html>", { status: 530 })),
    );
    await expect(post("/store/checkout", {})).rejects.toThrow("temporarily unavailable (530)");
  });
  it("does not retry a validation failure", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: false, message: "Quantity required" }), {
          status: 400,
        }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(postRecoverable("/orders", {})).rejects.toThrow("Quantity required");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retries the same idempotent payload after a tunnel failure", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Unavailable", { status: 530 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { id: "order" } })),
      );
    vi.stubGlobal("fetch", fetch);
    const result = postRecoverable("/orders", { visitId: "v", requestId: "same" });
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ id: "order" });
    expect(fetch.mock.calls[0][1].body).toEqual(fetch.mock.calls[1][1].body);
    vi.useRealTimers();
  });
  it("never treats a failed write as a cached success", async () => {
    storage.getItem.mockResolvedValue('{"id":"cached"}');
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(post("/tickets", {})).rejects.toThrow("Cannot reach the server");
  });
});
