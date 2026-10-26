import React, { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { api } from "../api/client";
import { Button, Card } from "../components/ui";
import InvoiceList from "../components/InvoiceList";
import { downloadInvoice } from "../utils/invoiceDownload";
import {
  employeeId,
  primaryPending,
  savePrimary,
  syncPrimary,
  primaryRequestKey,
  discardRejectedPrimary,
  PrimaryPending,
} from "../storage/primaryQueue";

/**
 * Manage employee-entered primary orders and receipt-based returns in whole cases, including
 * queued submission and issued invoices.
 */
export default function PrimaryScreen() {
  const [data, setData] = useState<any>(null),
    [owner, setOwner] = useState(""),
    [pending, setPending] = useState<PrimaryPending[]>([]);
  const [mode, setMode] = useState<"primaryOrder" | "primaryReturn">("primaryOrder"),
    [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("Damaged"),
    [notes, setNotes] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false);
  const [selectedSchemes, setSelectedSchemes] = useState<Record<string, string>>({});
  /**
   * Load the employee primary catalogue, transaction history and receipt context for the
   * assigned distributor.
   */
  async function load() {
    setBusy(true);
    try {
      const id = await employeeId();
      setOwner(id);
      setPending(await primaryPending(id));
      setData(await api("/primary/catalogue"));
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  /**
   * Send queued employee primary requests and reload the server-backed primary workspace.
   */
  async function synchronize() {
    setBusy(true);
    try {
      await syncPrimary(owner);
      setMessage("Synchronization finished. Check the Salesforce status below.");
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setPending(await primaryPending(owner));
      setBusy(false);
    }
    await load();
  }
  /**
   * Validate the primary transaction form, persist a request with a replay key, and synchronize
   * when possible.
   */
  async function save() {
    setBusy(true);
    try {
      const lines = Object.entries(quantities)
        .filter(([, value]) => Number(value) > 0)
        .map(([id, value]) =>
          mode === "primaryOrder"
            ? {
                productId: id,
                cases: Number(value),
                ...(selectedSchemes[id] ? { schemeId: selectedSchemes[id] } : {}),
              }
            : { receiptLineId: id, cases: Number(value), reason, notes },
        );
      if (
        !lines.length ||
        lines.some((line) => !Number.isInteger(line.cases) || line.cases > 100000)
      )
        throw new Error("Enter positive whole cases for at least one line.");
      if (mode === "primaryReturn" && reason === "Other" && !notes.trim())
        throw new Error("Explain the Other return reason.");
      await savePrimary(owner, {
        action: mode,
        requestKey: primaryRequestKey(),
        lines,
        notes,
      });
      setQuantities({});
      setSelectedSchemes({});
      setNotes("");
      setReview(false);
      setMessage("Saved on this device, awaiting Salesforce approval submission.");
      await syncPrimary(owner);
      setMessage("Submitted to the company Distributor Officer.");
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setPending(await primaryPending(owner));
      setBusy(false);
    }
    await load();
  }
  const products = mode === "primaryOrder" ? data?.products || [] : data?.receipts || [];
  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={styles.heading}>Distributor primary transactions</Text>
        <Text>Employee: {data?.employee?.Name || "Loading"}</Text>
        <Text>Distributor: {data?.employee?.DMS_Distributor__r?.Name || "Not loaded"}</Text>
        <Text>
          Company officer: {data?.employee?.DMS_Distributor__r?.Officer__r?.Name || "Not assigned"}
        </Text>
        <Text>
          Catalogue snapshot:{" "}
          {data?.retrievedAt ? new Date(data.retrievedAt).toLocaleString() : "Not downloaded"}.
          Refresh online before ordering; Salesforce validates final prices.
        </Text>
        <Text>
          Primary orders are placed in whole cases. Select an eligible Primary scheme below.
          Salesforce calculates discounts and free cases, then submits the order to the company
          officer. Secondary outlet orders remain in the existing outlet workflow.
        </Text>
      </Card>
      {!!message && (
        <Text accessibilityRole="alert" style={styles.message}>
          {message}
        </Text>
      )}
      <Button
        title="Refresh catalogue"
        kind="secondary"
        disabled={busy}
        onPress={() => void load()}
      />
      <Button
        title="Primary order — cases"
        disabled={busy}
        kind={mode === "primaryOrder" ? "brand" : "secondary"}
        onPress={() => {
          setMode("primaryOrder");
          setQuantities({});
          setReview(false);
        }}
      />
      <Button
        title="Primary return — original receipts"
        disabled={busy}
        kind={mode === "primaryReturn" ? "brand" : "secondary"}
        onPress={() => {
          setMode("primaryReturn");
          setQuantities({});
          setReview(false);
        }}
      />
      {!products.length && (
        <Text style={styles.message}>
          No eligible {mode === "primaryOrder" ? "products" : "received purchase lines"} found. Ask
          the administrator to complete the catalogue or goods receipts.
        </Text>
      )}
      {products.map((row: any) => {
        const eligible =
          mode === "primaryReturn" ||
          (Number(row.DMS_Case_Price__c) > 0 &&
            Number(row.Units_Per_Case__c) > 0 &&
            Number.isInteger(Number(row.Units_Per_Case__c)));
        return (
          <Card key={row.Id}>
            <Text style={styles.heading}>{row.Name || row.Product__r?.Name}</Text>
            <Text>
              {mode === "primaryOrder"
                ? `₹${row.DMS_Case_Price__c || 0} per case · ${row.Units_Per_Case__c || 0} pieces/case`
                : `Batch ${row.Batch_Number__c || "Not recorded"} · ${Number(row.Received_Cases__c || 0) + Number(row.Free_Cases__c || 0)} received cases`}
            </Text>
            {!eligible ? (
              <Text style={styles.message}>
                Salesforce case price / conversion needs configuration.
              </Text>
            ) : (
              <>
                <Text style={styles.label}>Cases — whole number</Text>
                <TextInput
                  accessibilityLabel={`Cases for ${row.Name || row.Product__r?.Name}`}
                  editable={!busy && !review}
                  style={styles.input}
                  placeholder="Enter number of cases"
                  placeholderTextColor="#607970"
                  keyboardType="numeric"
                  value={quantities[row.Id] || ""}
                  onChangeText={(value) => setQuantities((old) => ({ ...old, [row.Id]: value }))}
                />
                {mode === "primaryOrder" && (
                  <>
                    <Text style={styles.label}>Primary scheme (optional)</Text>
                    <Button
                      title="No scheme"
                      kind={!selectedSchemes[row.Id] ? "brand" : "secondary"}
                      disabled={busy || review}
                      onPress={() => setSelectedSchemes((old) => ({ ...old, [row.Id]: "" }))}
                    />
                    {(data?.schemes || [])
                      .filter(
                        (scheme: any) =>
                          scheme.Product__c === row.Id ||
                          scheme.Scheme_Products__r?.records?.some(
                            (link: any) => link.Product__c === row.Id,
                          ),
                      )
                      .map((scheme: any) => (
                        <View key={scheme.Id}>
                          <Button
                            title={`${selectedSchemes[row.Id] === scheme.Id ? "✓ " : ""}${scheme.Name}`}
                            kind={selectedSchemes[row.Id] === scheme.Id ? "brand" : "secondary"}
                            disabled={busy || review}
                            onPress={() =>
                              setSelectedSchemes((old) => ({
                                ...old,
                                [row.Id]: scheme.Id,
                              }))
                            }
                          />
                          <Text>
                            Buy {scheme.Minimum_Cases__c || "not configured"} cases ·{" "}
                            {scheme.Free_Cases__c || 0} free cases of{" "}
                            {scheme.Free_Product__r?.Name || row.Name} per complete buy block ·{" "}
                            {scheme.Discount_Percent__c || 0}% discount · ₹
                            {scheme.Discount_Amount__c || 0} off per block
                          </Text>
                          {!!scheme.Free_Gift__c && (
                            <Text>
                              Gift: {scheme.Free_Gift__c} × {scheme.Gift_Quantity__c || 0} per block
                            </Text>
                          )}
                        </View>
                      ))}
                  </>
                )}
              </>
            )}
          </Card>
        );
      })}
      {mode === "primaryReturn" && (
        <Card>
          <Text style={styles.heading}>Return reason (all selected lines)</Text>
          {["Damaged", "Expired", "Delayed Delivery", "No Demand", "Other"].map((value) => (
            <Button
              key={value}
              title={value}
              disabled={busy || review}
              kind={reason === value ? "brand" : "secondary"}
              onPress={() => setReason(value)}
            />
          ))}
        </Card>
      )}
      <Text style={styles.label}>Notes — explain Other returns</Text>
      <TextInput
        accessibilityLabel="Primary transaction notes"
        editable={!busy && !review}
        style={styles.input}
        multiline
        maxLength={1000}
        placeholder="Enter notes"
        placeholderTextColor="#607970"
        value={notes}
        onChangeText={setNotes}
      />
      {review ? (
        <Card>
          <Text style={styles.heading}>Confirm submission</Text>
          {Object.entries(quantities)
            .filter(([, quantity]) => Number(quantity) > 0)
            .map(([id, quantity]) => (
              <Text key={id}>
                {products.find((row: any) => row.Id === id)?.Name ||
                  products.find((row: any) => row.Id === id)?.Product__r?.Name}
                : {quantity} cases
                {selectedSchemes[id] && mode === "primaryOrder"
                  ? ` · Scheme: ${data?.schemes?.find((scheme: any) => scheme.Id === selectedSchemes[id])?.Name || "Selected"}`
                  : ""}
              </Text>
            ))}
          <Text>
            Prices are validated in Salesforce and the company officer must approve. This is not an
            invoice or stock movement.
          </Text>
          <Button
            title="Confirm and submit for approval"
            disabled={busy}
            onPress={() => void save()}
          />
          <Button
            title="Back to editing"
            kind="secondary"
            disabled={busy}
            onPress={() => setReview(false)}
          />
        </Card>
      ) : (
        <Button
          title="Review selected cases"
          disabled={busy || !data}
          onPress={() => setReview(true)}
        />
      )}
      <Card>
        <Text style={styles.heading}>Pending requests: {pending.length}</Text>
        {pending.map((row) => (
          <View key={row.requestKey}>
            <Text>
              {row.action === "primaryOrder" ? "Primary order" : "Primary return"} ·{" "}
              {row.error || "Waiting to sync"}
            </Text>
            {row.status === 400 && (
              <Button
                title="Remove rejected request, then correct and resubmit"
                disabled={busy}
                kind="secondary"
                onPress={() => void discardRejectedPrimary(owner, row.requestKey).then(load)}
              />
            )}
          </View>
        ))}
        <Button
          title="Sync saved primary requests"
          disabled={busy || !owner}
          onPress={() => void synchronize()}
        />
      </Card>
      <Card>
        <Text style={styles.heading}>My latest primary orders</Text>
        {(data?.orders || []).map((row: any) => (
          <Text key={row.Id}>
            {row.Name} · {row.Status__c} · ₹{row.Total_Amount__c || 0}
          </Text>
        ))}
        <Text style={styles.heading}>My latest primary returns</Text>
        {(data?.returns || []).map((row: any) => (
          <Text key={row.Id}>
            {row.Name} · {row.Status__c} · ₹{row.Total_Amount__c || 0}
          </Text>
        ))}
      </Card>
      {owner && <InvoiceList owner={owner} channel="primary" load={api} download={downloadInvoice} />}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: {
    padding: 18,
    backgroundColor: "#f6f3ea",
    maxWidth: 900,
    width: "100%",
    alignSelf: "center",
  },
  heading: {
    fontSize: 18,
    fontWeight: "700",
    color: "#173f37",
    marginVertical: 10,
  },
  label: { color: "#23483d", marginVertical: 8 },
  input: {
    padding: 14,
    borderWidth: 1,
    borderColor: "#aabeb5",
    backgroundColor: "white",
    color: "#173f37",
    borderRadius: 10,
    marginBottom: 12,
  },
  message: {
    padding: 12,
    backgroundColor: "#fff0c8",
    color: "#483e22",
    marginVertical: 10,
  },
});
