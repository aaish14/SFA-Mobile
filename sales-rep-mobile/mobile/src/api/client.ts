import AsyncStorage from "@react-native-async-storage/async-storage";
const base = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api";

const CACHE_PREFIX = "sfa-api-cache:";

function isReadRequest(options: RequestInit) {
  return !options.method || options.method.toUpperCase() === "GET";
}

export async function api<T>(path: string, options: RequestInit = {}) {
  const token = await AsyncStorage.getItem("token");
  const cacheKey = `${CACHE_PREFIX}${token || "public"}:${path}`;
  let response: Response;

  try {
    response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if (isReadRequest(options)) {
      const cachedValue = await AsyncStorage.getItem(cacheKey);
      if (cachedValue !== null) return JSON.parse(cachedValue) as T;
    }
    throw error;
  }

  const body = await response.json().catch(() => ({
    success: false,
    message: `The API returned an unreadable response (${response.status})`,
  }));
  if (response.status === 401) {
    await AsyncStorage.multiRemove(["token", "currentUser"]);
  }
  if (!response.ok || !body.success)
    throw new Error(body.message || "Unable to complete operation");

  // An in-flight request must not restore a signed-out employee's cached data.
  if (isReadRequest(options) && (await AsyncStorage.getItem("token")) === token) {
    await AsyncStorage.setItem(cacheKey, JSON.stringify(body.data));
  }
  return body.data as T;
}
export const post = <T>(path: string, data: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(data) });
