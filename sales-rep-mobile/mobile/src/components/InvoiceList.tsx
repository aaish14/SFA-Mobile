import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, StyleSheet } from "react-native";

type Props = {
  owner: string;
  load: (path: string) => Promise<any>;
  download: (id: string, name: string) => Promise<void>;
  channel?: "primary" | "secondary";
};
/**
 * Format an invoice amount with the rupee symbol and two decimal places.
 */
const money = (value: unknown) => `₹${Number(value || 0).toFixed(2)}`;

/** Both interfaces read the issued Salesforce snapshot; this view never creates invoices. */
export default function InvoiceList({ owner, load, download, channel }: Props) {
  const [rows, setRows] = useState<any[]>([]), [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [more, setMore] = useState(false);
  const version = useRef(0);
  /**
   * Refresh invoice summaries and ignore results belonging to an earlier owner generation.
   */
  async function refresh() {
    const current = version.current;
    try {
      const result = await load("/invoices");
      if (current !== version.current) return;
      setRows(result.items || []); setMore(!!result.hasMore); setError("");
    } catch (e: any) { if (current === version.current) setError(e.message || "Invoices could not be refreshed."); }
  }
  useEffect(() => {
    version.current++;
    setRows([]); setDetail(null); setError("");
    void refresh();
    const timer = setInterval(() => void refresh(), 20000);
    return () => { version.current++; clearInterval(timer); };
  }, [owner]);
  /**
   * Load one saved invoice detail while preventing an earlier owner response from replacing the
   * current view.
   */
  async function view(id: string) {
    const current = version.current;
    setBusy(true); setError("");
    try {
      const result = await load(`/invoices/${id}`);
      if (current === version.current) setDetail(result);
    } catch (e: any) { if (current === version.current) setError(e.message); }
    finally { if (current === version.current) setBusy(false); }
  }
  /**
   * Download the selected saved invoice and display a retryable user-facing error if the
   * download fails.
   */
  async function save() {
    setBusy(true); setError("");
    try { await download(detail.Id, detail.Name); }
    catch (e: any) { setError(e.message || "Invoice download failed. Please retry."); }
    finally { setBusy(false); }
  }
  const visible = rows.filter(row => !channel || (channel === "primary" ? !!row.Primary_Order__c : !row.Primary_Order__c));
  return <View style={s.container}>
    <Text style={s.heading}>Issued invoices</Text>
    <Text style={s.copy}>Generated automatically after confirmed order approval. Pending approval and offline orders do not have a final invoice yet.</Text>
    <Pressable accessibilityRole="button" onPress={() => void refresh()} style={s.outline}><Text style={s.link}>Refresh invoices</Text></Pressable>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error} Previously loaded data may be out of date.</Text>}
    {busy && <ActivityIndicator />}
    {!visible.length && !error && <Text style={s.copy}>No issued invoices in the latest download.</Text>}
    {more && <Text style={s.copy}>Showing the latest 200 invoices. Older invoices remain in Salesforce.</Text>}
    {visible.map(row => <Pressable accessibilityRole="button" key={row.Id} onPress={() => void view(row.Id)} disabled={busy} style={s.card}>
      <Text style={s.title}>{row.Name} · {row.Primary_Order__c ? "Primary" : "Secondary"}</Text>
      <Text style={s.copy}>{row.Bill_To_Name__c || row.Outlet__r?.Name || row.Distributor__r?.Name} · {row.Invoice_Date__c}</Text>
      <Text style={s.copy}>Order: {row.Primary_Order__r?.Name || row.Sales_Order__r?.Name} · {money(row.Total_Amount__c)}</Text>
      <Text style={s.link}>View products and download invoice</Text>
    </Pressable>)}
    {detail && <View style={s.card}>
      <Text style={s.heading}>{detail.Name}</Text>
      <Text style={s.copy}>Supplier: {detail.Supplier_Name__c || detail.Distributor__r?.Name}</Text>
      <Text style={s.copy}>Bill to: {detail.Bill_To_Name__c || detail.Outlet__r?.Name}</Text>
      {(detail.lines || []).map((line: any) => <View key={line.Id} style={s.line}>
        <Text style={s.title}>{line.Product_Name__c || line.Product__r?.Name}</Text>
        <Text style={s.copy}>{line.Cases__c != null ? `${line.Cases__c} cases × ${money(line.Case_Price__c)}` : `${line.Quantity_Pieces__c} pieces × ${money(line.Unit_Price__c)}`}</Text>
        <Text style={s.copy}>Discount {money(line.Discount_Amount__c)} · Tax {money(line.Tax_Amount__c)} · Total {money(line.Total_Amount__c)}</Text>
        {!!line.Scheme_Name__c && <Text style={s.copy}>Scheme: {line.Scheme_Name__c}</Text>}
        {!!line.Bonus_Details__c && <Text style={s.copy}>{line.Bonus_Details__c}</Text>}
      </View>)}
      <Text style={s.title}>Total {money(detail.Total_Amount__c)}</Text>
      <Text style={s.copy}>Paid {money(detail.Paid_Amount__c)} · Balance due {money(detail.Balance_Due__c)}</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={s.button}><Text style={s.buttonText}>Download / share invoice PDF</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => setDetail(null)} style={s.outline}><Text style={s.link}>Close invoice details</Text></Pressable>
    </View>}
  </View>;
}
const s = StyleSheet.create({
  container: { marginVertical: 14 }, heading: { fontSize: 20, fontWeight: "800", color: "#173e32", marginBottom: 8 },
  title: { fontSize: 15, fontWeight: "700", color: "#173e32" }, copy: { color: "#426155", marginVertical: 4 },
  card: { backgroundColor: "white", borderWidth: 1, borderColor: "#c6ddcf", padding: 16, borderRadius: 12, marginVertical: 7 },
  line: { borderBottomWidth: 1, borderColor: "#c6ddcf", paddingVertical: 12 }, link: { color: "#16744e", fontWeight: "700" },
  button: { backgroundColor: "#16744e", padding: 14, borderRadius: 8, marginTop: 10 }, buttonText: { color: "white", fontWeight: "700", textAlign: "center" },
  outline: { padding: 12, borderWidth: 1, borderColor: "#c6ddcf", borderRadius: 8, marginVertical: 8 },
  error: { color: "#9a2929", padding: 10 },
});
