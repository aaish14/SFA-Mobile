import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ getAllKeys: vi.fn(), multiRemove: vi.fn() }));
const pendingCount = vi.hoisted(() => vi.fn());
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
vi.mock("./syncQueue", () => ({ pendingCount }));
import { logOut } from "./session";

describe("log out", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    pendingCount.mockResolvedValue(0);
    storage.getAllKeys.mockResolvedValue(["token", "currentUser", "sfa-api-cache:old:/products", "sfa-pending-sync", "preference"]);
    storage.multiRemove.mockResolvedValue(undefined);
  });
  it("removes credentials and cached records, preserving unrelated settings", async () => {
    await logOut();
    expect(storage.multiRemove).toHaveBeenCalledWith(["token", "currentUser", "sfa-api-cache:old:/products"]);
  });
  it("keeps the session and offline work when changes are waiting to sync", async () => {
    pendingCount.mockResolvedValue(2);
    await expect(logOut()).rejects.toThrow("unsynced changes");
    expect(storage.multiRemove).not.toHaveBeenCalled();
  });
  it("does not claim success when storage fails", async () => {
    storage.multiRemove.mockRejectedValue(new Error("Storage unavailable"));
    await expect(logOut()).rejects.toThrow("Storage unavailable");
  });
  it("fails safely when the queue cannot be inspected", async () => {
    pendingCount.mockRejectedValue(new Error("Unreadable queue"));
    await expect(logOut()).rejects.toThrow("Unreadable queue");
    expect(storage.multiRemove).not.toHaveBeenCalled();
  });
});
