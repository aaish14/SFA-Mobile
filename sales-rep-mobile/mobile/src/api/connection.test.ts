import { beforeEach, describe, expect, it, vi } from "vitest";
const values = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    multiRemove: vi.fn(async (keys: string[]) => keys.forEach(key => values.delete(key))),
  },
}));
import { getApiBaseUrl, normalizeServerUrl, saveApiBaseUrl } from "./connection";
import { api, post } from "./client";

const health = { success: true, data: { mockMode: false }, message: "SFA API is ready" };
describe("administrator-controlled connection recovery", () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); values.clear(); });
  it("normalizes HTTPS addresses without changing the standard API path", () => {
    expect(normalizeServerUrl(" https://sfa.example.com/ ")).toBe("https://sfa.example.com/api");
    expect(normalizeServerUrl("https://sfa.example.com/api/")).toBe("https://sfa.example.com/api");
  });
  it.each(["http://sfa.example.com", "https://user:password@sfa.example.com", "https://sfa.example.com/api?token=x", "https://sfa.example.com/#part", "https://sfa.example.com/admin", "not a url"])("rejects unsafe or malformed input: %s", async (input) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(saveApiBaseUrl(input)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(values.size).toBe(0);
  });
  it("checks without credentials and preserves the employee, queue and visit draft", async () => {
    values.set("token", "employee-session");
    values.set("currentUser", '{"employeeId":"existing"}');
    values.set("sfa-pending-sync", '[{"id":"pending"}]');
    values.set("sfa-visit-draft:existing:outlet", '{"dirty":true}');
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(health)));
    vi.stubGlobal("fetch", fetch);
    await saveApiBaseUrl("https://replacement.example.com");
    expect(fetch.mock.calls[0][0]).toBe("https://replacement.example.com/api/health");
    expect(fetch.mock.calls[0][1].headers).toEqual({ Accept: "application/json" });
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
    expect(values.get("token")).toBe("employee-session");
    expect(values.get("currentUser")).toBe('{"employeeId":"existing"}');
    expect(values.get("sfa-pending-sync")).toBe('[{"id":"pending"}]');
    expect(values.get("sfa-visit-draft:existing:outlet")).toBe('{"dirty":true}');
    expect(await getApiBaseUrl()).toBe("https://replacement.example.com/api");
  });
  it.each([
    () => Promise.reject(new Error("offline")),
    () => Promise.resolve(new Response("<html>530</html>", { status: 530 })),
    () => Promise.resolve(new Response(JSON.stringify({ ...health, data: { mockMode: true } }))),
    () => Promise.resolve(new Response(JSON.stringify({ success: true, data: {} }))),
  ])("leaves the previous address untouched when a probe fails", async (reply) => {
    values.set("sfa-server-url", "https://previous.example.com/api");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(reply));
    await expect(saveApiBaseUrl("https://replacement.example.com")).rejects.toThrow("existing connection");
    expect(await getApiBaseUrl()).toBe("https://previous.example.com/api");
  });
  it("times out a hanging health check without saving the new address", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")));
    })));
    const assertion = expect(saveApiBaseUrl("https://replacement.example.com")).rejects.toThrow("Cannot reach");
    await vi.advanceTimersByTimeAsync(10001);
    await assertion;
    expect(values.has("sfa-server-url")).toBe(false);
  });
  it("uses the replacement on the next request and never returns another server's cache", async () => {
    values.set("sfa-server-url", "https://first.example.com/api");
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { name: "first" } })));
    vi.stubGlobal("fetch", fetch);
    await api("/outlets");
    values.set("sfa-server-url", "https://replacement.example.com/api");
    fetch.mockRejectedValue(new Error("offline"));
    await expect(api("/outlets")).rejects.toThrow("Cannot reach");
    expect(fetch.mock.calls[1][0]).toBe("https://replacement.example.com/api/outlets");
  });
  it("does not mark a failed write as saved after a connection change", async () => {
    values.set("sfa-server-url", "https://replacement.example.com/api");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(post("/store/validate-location", { storeId: "outlet" })).rejects.toThrow("entries are unchanged");
  });
});
