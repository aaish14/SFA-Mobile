import AsyncStorage from "@react-native-async-storage/async-storage";
const base = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api";

const CACHE_PREFIX = "sfa-api-cache:";
export class ApiError extends Error {
  /**
   * Attach HTTP status and retryability information to a mobile API error.
   */
  constructor(
    message: string,
    public status: number,
    public retryable = false,
  ) {
    super(message);
  }
}

/**
 * Identify GET/default requests eligible for the read-cache fallback.
 */
function isReadRequest(options: RequestInit) {
  return !options.method || options.method.toUpperCase() === "GET";
}

/**
 * Send the stored bearer token, decode the API envelope and manage read-cache fallback and
 * expired-session handling. Failed writes are not reported as saved.
 */
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
    throw new ApiError(
      "Cannot reach the server. Your entries are unchanged. Check your connection and try again.",
      0,
      true,
    );
  }

  const body = await response.json().catch(() => ({
    success: false,
    message:
      response.status >= 500
        ? `The connection to the server is temporarily unavailable (${response.status}). Your entries are unchanged; please try again.`
        : `The server returned an unexpected response (${response.status}). Please try again.`,
  }));
  if (response.status === 401) {
    await AsyncStorage.multiRemove(["token", "currentUser"]);
  }
  if (!response.ok || !body.success)
    throw new ApiError(
      body.message || "Unable to complete operation",
      response.status,
      response.status >= 502,
    );

  // An in-flight request must not restore a signed-out employee's cached data.
  if (isReadRequest(options) && (await AsyncStorage.getItem("token")) === token) {
    await AsyncStorage.setItem(cacheKey, JSON.stringify(body.data));
  }
  return body.data as T;
}
/**
 * Serialize the supplied payload as JSON and delegate a POST request to the shared API client.
 */
export const post = <T>(path: string, data: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(data) });

/** Only use for server operations that explicitly support idempotent retries. */
export async function postRecoverable<T>(path: string, data: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await post<T>(path, data);
    } catch (error) {
      if (!(error instanceof ApiError) || !error.retryable || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}
