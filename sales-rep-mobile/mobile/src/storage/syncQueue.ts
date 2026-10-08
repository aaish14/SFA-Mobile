import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { post } from "../api/client";
const KEY = "sfa-pending-sync";
export type Queued = {
  id: string;
  path: string;
  payload: any;
  attempts: number;
  operation: string;
  createdAt: string;
  dependsOn: string[];
  lastError?: string;
  status: "PENDING" | "FAILED";
};
const MAX_ATTEMPTS = 5;
export async function enqueue(
  path: string,
  payload: any,
  options: { operation?: string; dependsOn?: string[] } = {},
) {
  const rows: Queued[] = JSON.parse((await AsyncStorage.getItem(KEY)) || "[]");
  const id =
    payload.requestId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (rows.some((row) => row.id === id)) return id;
  rows.push({
    id,
    path,
    payload: { ...payload, requestId: id },
    attempts: 0,
    operation: options.operation || path,
    createdAt: new Date().toISOString(),
    dependsOn: options.dependsOn || [],
    status: "PENDING",
  });
  await AsyncStorage.setItem(KEY, JSON.stringify(rows));
  return id;
}
export async function pendingCount() {
  return JSON.parse((await AsyncStorage.getItem(KEY)) || "[]").length as number;
}
export async function flushQueue() {
  if (!(await NetInfo.fetch()).isConnected)
    return { synced: 0, failed: await pendingCount() };
  const rows: Queued[] = JSON.parse((await AsyncStorage.getItem(KEY)) || "[]"),
    failed: Queued[] = [],
    syncedIds = new Set<string>();
  let synced = 0;
  for (const row of rows) {
    if (row.dependsOn?.some((dependency) => !syncedIds.has(dependency))) {
      failed.push({ ...row, status: "PENDING", lastError: "Waiting for a dependent record to synchronize" });
      continue;
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      failed.push({ ...row, status: "FAILED", lastError: row.lastError || "Maximum retry count reached" });
      continue;
    }
    try {
      await post(row.path, row.payload);
      synced++;
      syncedIds.add(row.id);
    } catch (reason: any) {
      failed.push({
        ...row,
        attempts: row.attempts + 1,
        status: row.attempts + 1 >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
        lastError: reason?.message || "Synchronization failed",
      });
    }
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(failed));
  return { synced, failed: failed.length };
}
