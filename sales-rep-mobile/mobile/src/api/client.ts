import AsyncStorage from "@react-native-async-storage/async-storage";
const base = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api";
export async function api<T>(path: string, options: RequestInit = {}) {
  const token = await AsyncStorage.getItem("token");
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({
    success: false,
    message: `The API returned an unreadable response (${response.status})`,
  }));
  if (response.status === 401) {
    await AsyncStorage.multiRemove(["token", "currentUser"]);
  }
  if (!response.ok || !body.success)
    throw new Error(body.message || "Unable to complete operation");
  return body.data as T;
}
export const post = <T>(path: string, data: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(data) });
