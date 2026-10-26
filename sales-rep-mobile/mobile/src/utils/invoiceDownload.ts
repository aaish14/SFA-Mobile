import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

/**
 * Download an issued invoice through the authenticated API and hand the PDF to the appropriate
 * browser or device sharing path.
 */
export async function downloadInvoice(id: string, name: string) {
  const token = await AsyncStorage.getItem("token");
  if (!token) throw new Error("Please sign in again.");
  const base = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api";
  const url = `${base}/invoices/${encodeURIComponent(id)}/pdf`;
  const filename = `${name.replace(/[^a-z0-9_-]/gi, "-")}.pdf`;
  if (Platform.OS === "web") {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error("Invoice download failed. Please retry.");
    const blob = await response.blob();
    if (!blob.type.includes("pdf")) throw new Error("The server did not return a PDF.");
    const file = new File([blob], filename, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    const objectUrl = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = objectUrl; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    return;
  }
  if (!base.startsWith("https://")) throw new Error("Mobile invoice downloads require the secure HTTPS backend.");
  if (!await Sharing.isAvailableAsync()) throw new Error("Sharing is not available on this device.");
  const result = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}${filename}`, { headers: { Authorization: `Bearer ${token}` } });
  if (result.status !== 200 || !String(result.headers["content-type"] || result.headers["Content-Type"]).includes("pdf")) throw new Error("Invoice download failed. Please retry.");
  await Sharing.shareAsync(result.uri, { mimeType: "application/pdf", dialogTitle: name });
}
