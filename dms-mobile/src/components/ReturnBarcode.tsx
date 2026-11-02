import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { request } from "../api";
import RecordBarcode, { BarcodeData } from "./RecordBarcode";

/** Open saved return information using the same signed-in scope as the order history. */
export default function ReturnBarcode({ id, kind, barcode, token, onSignIn }: {
  id: string; kind: "primary" | "secondary"; barcode?: BarcodeData;
  token: string; onSignIn: () => void;
}) {
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  async function load() {
    if (open) { setOpen(false); return; }
    setOpen(true); setLoading(true); setError(""); setDetails(null);
    try { setDetails(await request(`/returns/${kind}/${id}`, token)); }
    catch (failure: any) { setError(failure.message); if (failure.status === 401 || failure.status === 403) onSignIn(); }
    finally { setLoading(false); }
  }
  return <View>
    <RecordBarcode barcode={barcode} label="Return barcode — products and reasons" detailLabel="return products and reasons" disabled={loading} onPress={() => void load()} />
    {open && <View style={{ backgroundColor: "#edf7f0", padding: 18, borderRadius: 12, gap: 12 }}>
      {loading && <Text>Loading the saved return…</Text>}
      {!!error && <Text accessibilityRole="alert">{error}</Text>}
      {details && <>
        <Text style={{ fontWeight: "800", fontSize: 20 }}>{details.title} · {details.status}</Text>
        <Text>Approval: {details.approver}</Text>
        <Text style={{ fontWeight: "700" }}>Original ordered products</Text>
        {details.orderedLines.length ? details.orderedLines.map((line: any, index: number) => <Text key={index}>{line.order} · {line.product}: {line.quantity} {details.unit}{line.free ? ` + ${line.free} free` : ""}</Text>) : <Text>No original order is linked to this older record.</Text>}
        <Text style={{ fontWeight: "700" }}>Products requested for return</Text>
        {details.lines.map((line: any) => <View key={line.id} style={{ gap: 4 }}>
          <Text style={{ fontWeight: "700" }}>{line.product}: {line.quantity} {details.unit} · {line.reason}</Text>
          {!!line.batch && <Text>Batch: {line.batch}</Text>}
          {!!line.notes && <Text>{line.notes}</Text>}
        </View>)}
        {!!details.salesforceUrl && <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(details.salesforceUrl)}>
          <Text style={{ color: "#16744e", fontWeight: "700", textDecorationLine: "underline" }}>Open return products and reasons in Salesforce</Text>
        </Pressable>}
      </>}
    </View>}
  </View>;
}
