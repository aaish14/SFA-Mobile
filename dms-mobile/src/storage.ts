import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type Session = {
  token: string;
  id: string;
  name: string;
  expiresAt: number;
};
export type Pending = {
  key: string;
  path: string;
  body: Record<string, unknown>;
  label: string;
  error?: string;
  status?: number;
};
const sessionKey = "dms-session-v2";
/**
 * Namespace cached snapshots and pending commands by distributor ID so different accounts do not
 * share local data.
 */
const key = (id: string, kind: string) => `dms-v2:${id}:${kind}`;
/**
 * Read the saved distributor session from web storage or native SecureStore; return null for
 * missing or malformed session JSON.
 */
export async function readSession(): Promise<Session | null> {
  const raw =
    Platform.OS === "web"
      ? await AsyncStorage.getItem(sessionKey)
      : await SecureStore.getItemAsync(sessionKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
/**
 * Persist or remove the distributor session using web storage or native SecureStore as
 * appropriate.
 */
export async function saveSession(session: Session | null) {
  if (Platform.OS === "web") {
    if (session) await AsyncStorage.setItem(sessionKey, JSON.stringify(session));
    else await AsyncStorage.removeItem(sessionKey);
  } else if (session) await SecureStore.setItemAsync(sessionKey, JSON.stringify(session));
  else await SecureStore.deleteItemAsync(sessionKey);
}
/**
 * Read the last saved Salesforce snapshot for this distributor, or null when none exists.
 */
export async function readSnapshot(id: string) {
  const raw = await AsyncStorage.getItem(key(id, "snapshot"));
  return raw ? JSON.parse(raw) : null;
}
/**
 * Persist the fetched Salesforce snapshot under this distributor key for later display.
 */
export async function saveSnapshot(id: string, data: unknown) {
  await AsyncStorage.setItem(key(id, "snapshot"), JSON.stringify(data));
}
/**
 * Read this distributor persistent outbox, returning an empty queue when no work is saved.
 */
export async function readPending(id: string): Promise<Pending[]> {
  const raw = await AsyncStorage.getItem(key(id, "pending"));
  return raw ? JSON.parse(raw) : [];
}
/**
 * Persist this distributor outbox after enqueueing, successful transmission or a recorded
 * failure.
 */
export async function savePending(id: string, rows: Pending[]) {
  await AsyncStorage.setItem(key(id, "pending"), JSON.stringify(rows));
}
/**
 * Remove only this distributor cached snapshot; leave pending commands and other account data
 * intact.
 */
export async function clearSnapshot(id: string) {
  await AsyncStorage.removeItem(key(id, "snapshot"));
}
