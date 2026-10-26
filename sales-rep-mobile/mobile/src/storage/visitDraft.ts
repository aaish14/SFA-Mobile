import AsyncStorage from "@react-native-async-storage/async-storage";
import type { OrderLine } from "../types";

export type VisitDraft = { items: OrderLine[]; dirty: boolean };
/**
 * Build the local draft-storage key for the outlet context.
 */
async function key(storeId: string) {
  const user = JSON.parse((await AsyncStorage.getItem("currentUser")) || "{}");
  if (!user.employeeId) throw new Error("Please sign in again before saving a visit.");
  return `sfa-visit-draft:${user.employeeId}:${storeId}`;
}
/**
 * Read the locally persisted outlet order draft for recovery.
 */
export async function readVisitDraft(storeId: string): Promise<VisitDraft | null> {
  return JSON.parse((await AsyncStorage.getItem(await key(storeId))) || "null");
}
/**
 * Persist the outlet order draft locally without treating it as a submitted Salesforce order.
 */
export async function writeVisitDraft(storeId: string, items: OrderLine[], dirty: boolean) {
  await AsyncStorage.setItem(await key(storeId), JSON.stringify({ items, dirty }));
}
/**
 * Remove the saved local outlet draft after it is no longer needed.
 */
export async function clearVisitDraft(storeId: string) {
  await AsyncStorage.removeItem(await key(storeId));
}
