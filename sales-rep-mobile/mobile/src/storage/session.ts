import AsyncStorage from "@react-native-async-storage/async-storage";
import { pendingCount } from "./syncQueue";
import { primaryPendingCount } from "./primaryQueue";

/** Keep offline work with its current employee until it reaches Salesforce. */
export async function logOut() {
  if (await primaryPendingCount())
    throw new Error(
      "Open Primary orders / returns and sync or review pending primary requests before logging out.",
    );
  if (await pendingCount()) {
    throw new Error(
      "You have unsynced changes. Connect to the internet and tap Sync changes before logging out.",
    );
  }
  const keys = await AsyncStorage.getAllKeys();
  const cachedRecords = keys.filter((key) => key.startsWith("sfa-api-cache:"));
  await AsyncStorage.multiRemove(["token", "currentUser", ...cachedRecords]);
}
