import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, post } from "../api/client";
import { Button, Card, Label, Money } from "../components/ui";
import { colors } from "../constants/theme";
import ClaimEditor, { ClaimForm } from "../components/ExpenseClaimEditor";

type ExpensePolicy = {
  id: string;
  name: string;
  expenseType: string;
  category: string;
  ownership?: string;
  travelClass?: string;
  rateType: string;
  rate: number;
  maximumAmount: number;
  receiptRequired: boolean;
  geography?: string;
};

/**
 * Load expense policies, collect policy-specific claim details and submit validated employee
 * claims.
 */
export default function ExpensesScreen() {
  const [policies, setPolicies] = useState<ExpensePolicy[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [forms, setForms] = useState<Record<string, ClaimForm>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");
  /**
   * Load expense policies from the API and update the loading/error state.
   */
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setPolicies(await api<ExpensePolicy[]>("/expense-policies"));
    } catch (e: any) {
      setError(e.message || "Unable to load expense policies.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  /**
   * Select or deselect an expense policy locally without submitting a claim.
   */
  const toggle = (policyId: string) =>
    setSelectedIds((current) =>
      current.includes(policyId) ? current.filter((id) => id !== policyId) : [...current, policyId],
    );
  /**
   * Update one field in the claim form associated with a policy.
   */
  const update = (policyId: string, key: keyof ClaimForm, value: string) =>
    setForms((current) => ({ ...current, [policyId]: { ...current[policyId], [key]: value } }));
  /**
   * Validate selected policies, amounts and evidence before submitting the expense claims and
   * displaying the result.
   */
  const submit = async () => {
    setValidationError("");
    if (!selectedIds.length) {
      setValidationError("Choose one or more applicable Salesforce expense policies.");
      return;
    }
    const selectedPolicies = policies.filter((policy) => selectedIds.includes(policy.id));
    for (const policy of selectedPolicies) {
      const form = forms[policy.id] || {};
      const amount = Number(form.amount || 0);
      if (amount <= 0) {
        setValidationError(`Enter a valid amount for ${policy.name}.`);
        return;
      }
      if (policy.maximumAmount > 0 && amount > policy.maximumAmount) {
        setValidationError(`${policy.name} allows a maximum of ₹${policy.maximumAmount}.`);
        return;
      }
      if (policy.receiptRequired && !form.receiptUrl?.trim()) {
        setValidationError(`Receipt / evidence URL is required for ${policy.name}.`);
        return;
      }
      if (form.receiptUrl && !/^https?:\/\//i.test(form.receiptUrl.trim())) {
        setValidationError(`${policy.name}: receipt URL must start with http:// or https://.`);
        return;
      }
      const start = Number(form.startOdometer || 0);
      const end = Number(form.endOdometer || 0);
      if (start > 0 && end > 0 && end < start) {
        setValidationError(`${policy.name}: end odometer cannot be lower than start odometer.`);
        return;
      }
    }
    const claims = selectedPolicies.map((policy) => {
      const form = forms[policy.id] || {};
      return {
        policyId: policy.id,
        amount: Number(form.amount || 0),
        distanceKm: Number(form.distanceKm || 0),
        startOdometer: Number(form.startOdometer || 0),
        endOdometer: Number(form.endOdometer || 0),
        transportMode: policy.category,
        ownership: policy.ownership,
        travelClass: policy.travelClass,
        receiptUrl: form.receiptUrl,
        remarks: form.remarks,
      };
    });
    try {
      setSaving(true);
      await post("/expenses", { claims });
      setSelectedIds([]);
      setForms({});
      setValidationError("");
      Alert.alert(
        "Expenses submitted",
        `${claims.length} expense claim${claims.length === 1 ? "" : "s"} saved in Salesforce with your Employee details.`,
      );
    } catch (e: any) {
      setValidationError(e.message || "Unable to submit expenses. Please try again.");
      Alert.alert("Unable to submit expenses", e.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.header}>
          <Text style={s.kicker}>EXPENSE MANAGEMENT</Text>
          <Text style={s.title}>Add Expenses</Text>
          <Text style={s.copy}>
            Select one or more policies. Each selection creates a separate Salesforce Expense Claim
            linked to your Employee record.
          </Text>
        </View>
        {loading ? <ActivityIndicator color={colors.brand} /> : null}
        {error ? (
          <Pressable onPress={load}>
            <Text style={s.error}>{error} · Tap to retry</Text>
          </Pressable>
        ) : null}
        <View style={s.selectionHeading}>
          <Label>APPLICABLE POLICIES</Label>
          <Text style={s.count}>{selectedIds.length} selected</Text>
        </View>
        {policies.map((policy) => {
          const selected = selectedIds.includes(policy.id);
          return (
            <View key={policy.id}>
              <Pressable onPress={() => toggle(policy.id)}>
                <Card style={{ ...s.policy, ...(selected ? s.selected : {}) }}>
                  <View style={s.row}>
                    <Text style={s.policyName}>
                      {selected ? "☑ " : "☐ "}
                      {policy.name}
                    </Text>
                    <Text style={s.type}>{policy.expenseType}</Text>
                  </View>
                  <Text style={s.detail}>
                    {policy.category}
                    {policy.ownership && policy.ownership !== "Not Applicable"
                      ? ` · ${policy.ownership}`
                      : ""}
                    {policy.travelClass ? ` · ${policy.travelClass}` : ""}
                  </Text>
                  <Text style={s.detail}>
                    {policy.rateType}: <Money value={policy.rate} />
                    {policy.maximumAmount ? ` · Maximum ₹${policy.maximumAmount}` : ""}
                    {policy.receiptRequired ? " · Receipt required" : ""}
                  </Text>
                  {policy.geography ? (
                    <Text style={s.scope}>Geography: {policy.geography}</Text>
                  ) : null}
                </Card>
              </Pressable>
              {selected ? (
                <ClaimEditor
                  policy={policy}
                  form={forms[policy.id] || {}}
                  update={(key, value) => update(policy.id, key, value)}
                />
              ) : null}
            </View>
          );
        })}
        {!loading && !policies.length ? (
          <Card>
            <Text>No active expense policies are available for your geography.</Text>
          </Card>
        ) : null}
        {validationError ? (
          <Card style={s.validationCard}>
            <Text style={s.validationTitle}>Please complete the claim</Text>
            <Text style={s.validationText}>{validationError}</Text>
          </Card>
        ) : null}
        {selectedIds.length ? (
          <Button
            title={
              saving
                ? "SUBMITTING…"
                : `SUBMIT ${selectedIds.length} CLAIM${selectedIds.length === 1 ? "" : "S"} FOR APPROVAL`
            }
            onPress={submit}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  page: { padding: 14, paddingBottom: 40, maxWidth: 700, width: "100%", alignSelf: "center" },
  header: { backgroundColor: colors.navy, padding: 20, borderRadius: 20, marginBottom: 16 },
  kicker: { color: "#9DD9C9", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  title: { color: "white", fontSize: 26, fontWeight: "900", marginTop: 6 },
  copy: { color: "#D8EEE8", marginTop: 6, lineHeight: 19 },
  error: { color: colors.danger, textAlign: "center", marginBottom: 12 },
  selectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  count: { color: colors.brand, fontWeight: "900" },
  policy: { marginBottom: 9, borderWidth: 1, borderColor: colors.border },
  selected: { borderColor: colors.brand, backgroundColor: "#E7F5F3" },
  claim: { marginTop: -4, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: colors.brand },
  validationCard: { borderWidth: 1, borderColor: colors.danger, backgroundColor: "#FFF1F0" },
  validationTitle: { color: colors.danger, fontWeight: "900", fontSize: 15 },
  validationText: { color: colors.danger, marginTop: 5 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  policyName: { flex: 1, color: colors.ink, fontWeight: "900", fontSize: 15 },
  type: { color: colors.brand, fontWeight: "800", fontSize: 10 },
  detail: { color: colors.muted, marginTop: 6, fontSize: 12 },
  scope: { color: colors.blue, fontWeight: "700", marginTop: 5, fontSize: 11 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 13,
    marginTop: 10,
    color: colors.ink,
    backgroundColor: "white",
  },
  flex: { flex: 1 },
  notes: { minHeight: 80, textAlignVertical: "top" },
});
