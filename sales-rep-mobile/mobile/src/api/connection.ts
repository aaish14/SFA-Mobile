import AsyncStorage from "@react-native-async-storage/async-storage";

const CONNECTION_KEY = "sfa-server-url";
const DEFAULT_BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api";

/** Accept only an administrator-supplied HTTPS origin, with the standard /api path. */
export function normalizeServerUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); }
  catch { throw new Error("Enter the complete HTTPS server address supplied by your administrator."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !url.hostname.includes(".") || !["", "/", "/api", "/api/"].includes(url.pathname)) {
    throw new Error("Use an HTTPS server address with no password, query, or extra path (for example https://your-server/api).");
  }
  return `${url.origin}/api`;
}

/** Resolve each request independently so connection repairs do not require reinstalling. */
export async function getApiBaseUrl(): Promise<string> {
  const saved = await AsyncStorage.getItem(CONNECTION_KEY);
  return saved ? normalizeServerUrl(saved) : DEFAULT_BASE.replace(/\/$/, "");
}

/**
 * Test the public health endpoint without sending a token or employee data.
 * This is a service-shape check, not proof of ownership: the user must trust the administrator
 * who supplied the address. Only an explicit confirmation in the UI saves it.
 */
export async function checkServerConnection(base: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${base}/health`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true || body?.data?.mockMode !== false ||
        body?.message !== "SFA API is ready") {
      throw new Error("This address is not a reachable live SFA server. Your existing connection has not changed.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("existing connection")) throw error;
    throw new Error("Cannot reach this SFA server. Keep the laptop and connection running, then try again. Your existing connection has not changed.");
  } finally { clearTimeout(timeout); }
}

/** Retain the employee session, unsynced entries and visit drafts when repairing the same server. */
export async function saveApiBaseUrl(input: string): Promise<string> {
  const base = normalizeServerUrl(input);
  await checkServerConnection(base);
  await AsyncStorage.setItem(CONNECTION_KEY, base);
  return base;
}
