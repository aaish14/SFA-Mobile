import AsyncStorage from "@react-native-async-storage/async-storage";
import { post } from "../api/client";

export type PrimaryPending = {
  requestKey: string;
  action: "primaryOrder" | "primaryReturn";
  lines: any[];
  notes: string;
  error?: string;
  status?: number;
};
const prefix = "sfa-primary-pending:";
let syncing = false;
/**
 * Read the signed-in employee identity and fail if no usable employee session is stored.
 */
export async function employeeId() {
  const user = JSON.parse((await AsyncStorage.getItem("currentUser")) || "null");
  if (!user?.employeeId) throw new Error("Sign in as an employee first.");
  return user.employeeId as string;
}
/**
 * Read queued primary requests from storage scoped to the supplied employee ID.
 */
export const primaryPending = async (id: string): Promise<PrimaryPending[]> =>
  JSON.parse((await AsyncStorage.getItem(prefix + id)) || "[]");
/**
 * Persist a primary request before transmission, refusing concurrent writes while
 * synchronization owns the queue.
 */
export async function savePrimary(id: string, body: PrimaryPending) {
  if (syncing) throw new Error("Please wait for synchronization.");
  const rows = await primaryPending(id);
  rows.push(body);
  await AsyncStorage.setItem(prefix + id, JSON.stringify(rows));
}
/**
 * Remove only the matching rejected primary request when synchronization is idle.
 */
export async function discardRejectedPrimary(id: string, key: string) {
  if (syncing) return;
  const rows = await primaryPending(id);
  await AsyncStorage.setItem(
    prefix + id,
    JSON.stringify(rows.filter((row) => row.requestKey !== key || row.status !== 400)),
  );
}
/**
 * Count pending primary requests across saved employee queues on this device.
 */
export async function primaryPendingCount() {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
  if (!keys.length) return 0;
  return (await AsyncStorage.multiGet(keys)).reduce(
    (sum, [, value]) => sum + JSON.parse(value || "[]").length,
    0,
  );
}
/**
 * Replay this employee queue in order with stable keys, stop at a rejected request, and retain
 * failed requests for review or retry.
 */
export async function syncPrimary(id: string) {
  if (syncing) return;
  syncing = true;
  try {
    if ((await employeeId()) !== id)
      throw new Error("Sign in as the employee who saved these requests.");
    const rows = await primaryPending(id);
    while (rows.length) {
      const row = rows[0];
      if (row.status === 400) break;
      try {
        const { error, status, ...body } = row;
        await post("/primary/submit", body);
        rows.shift();
      } catch (error: any) {
        row.error = error.message;
        row.status = error.status;
        await AsyncStorage.setItem(prefix + id, JSON.stringify(rows));
        throw error;
      }
      await AsyncStorage.setItem(prefix + id, JSON.stringify(rows));
    }
  } finally {
    syncing = false;
  }
}
// Correlation key only, not an authentication secret.
/**
 * Create a UUID-shaped retry identifier for a primary request; this random identifier is not an
 * authentication credential.
 */
export const primaryRequestKey = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === "x" ? n : (n & 3) | 8).toString(16);
  });
