import { Platform } from "react-native";
const configured = process.env.EXPO_PUBLIC_API_URL;
const base = configured || (Platform.OS === "web" ? "http://localhost:4000/api" : "");
/**
 * Fetch the issued invoice PDF using the distributor token and trigger the platform
 * download/share flow.
 */
export async function downloadInvoice(id: string, name: string, token: string) {
  if (Platform.OS !== "web") throw new Error("Open the DMS desktop portal to download the PDF.");
  const response = await fetch(`${base}/dms/invoices/${encodeURIComponent(id)}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Invoice download failed. Refresh your session and retry.");
  const blob = await response.blob();
  if (!blob.type.includes("pdf")) throw new Error("The server did not return a PDF.");
  const file = new File([blob], `${name.replace(/[^a-z0-9_-]/gi, "-")}.pdf`, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export class ApiError extends Error {
  /**
   * Attach the HTTP status to a distributor API error so callers can distinguish authentication,
   * validation and connection failures.
   */
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
/**
 * Call the DMS API with the supplied session token and optional JSON command, decoding success
 * and failure envelopes consistently.
 */
export async function request(path: string, token = "", body?: unknown) {
  if (!base)
    throw new ApiError(
      "This APK needs a reachable HTTPS backend URL. Localhost on a phone points to the phone, not your computer.",
      503,
    );
  if (Platform.OS !== "web" && !base.startsWith("https://"))
    throw new ApiError("Use an HTTPS API URL for the mobile build.", 503);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${base}/dms${path}`, {
      method: body ? "POST" : "GET",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success)
      throw new ApiError(
        json?.message ||
          "The server returned an unreadable response. Your pending work is retained.",
        response.status,
      );
    return json.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "Cannot reach the server. Showing saved data; pending changes remain on this device.",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}
