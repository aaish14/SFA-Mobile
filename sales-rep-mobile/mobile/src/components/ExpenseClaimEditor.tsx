import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { Card, Label } from "./ui";
import { colors } from "../constants/theme";

export type ClaimForm = {
  amount?: string;
  distanceKm?: string;
  startOdometer?: string;
  endOdometer?: string;
  receiptUrl?: string;
  remarks?: string;
};

type ExpenseFieldProps = TextInputProps & { label: string; hint?: string };

/** Keep field names visible after typing; do not rely on Android's default hint color. */
export function ExpenseField({ label, hint, multiline, ...input }: ExpenseFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor="#627873"
        selectionColor={colors.brand}
        multiline={multiline}
        style={[styles.input, multiline && styles.notes]}
      />
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

export default function ExpenseClaimEditor({ policy, form, update }: {
  policy: { name: string; category: string; receiptRequired: boolean };
  form: ClaimForm;
  update: (key: keyof ClaimForm, value: string) => void;
}) {
  const usesOdometer = ["Two Wheeler", "Four Wheeler"].includes(policy.category);
  return (
    <Card style={styles.card}>
      <Label>{policy.name.toUpperCase()} CLAIM DETAILS</Label>
      <ExpenseField label="Claim amount (₹) — required" placeholder="e.g. 200.00"
        keyboardType="decimal-pad" value={form.amount || ""} onChangeText={(value) => update("amount", value)} />
      <ExpenseField label="Distance travelled (km) — optional" placeholder="e.g. 10.5"
        hint="For travel claims only. Leave blank if this expense is not for travel."
        keyboardType="decimal-pad" value={form.distanceKm || ""} onChangeText={(value) => update("distanceKm", value)} />
      {usesOdometer && (
        <>
          <ExpenseField label="Start odometer (km) — optional" placeholder="e.g. 12450"
            keyboardType="decimal-pad" value={form.startOdometer || ""} onChangeText={(value) => update("startOdometer", value)} />
          <ExpenseField label="End odometer (km) — optional" placeholder="e.g. 12475"
            keyboardType="decimal-pad" value={form.endOdometer || ""} onChangeText={(value) => update("endOdometer", value)} />
        </>
      )}
      <ExpenseField label={`Receipt / evidence URL — ${policy.receiptRequired ? "required" : "optional"}`}
        placeholder="https://example.com/receipt.jpg"
        hint="Paste a link to your receipt or supporting evidence."
        keyboardType="url" autoCapitalize="none" autoCorrect={false}
        value={form.receiptUrl || ""} onChangeText={(value) => update("receiptUrl", value)} />
      <ExpenseField label="Purpose and remarks — optional" placeholder="Explain what this expense was for"
        multiline value={form.remarks || ""} onChangeText={(value) => update("remarks", value)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: -4, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: colors.brand },
  field: { marginTop: 16 },
  label: { color: colors.ink, fontSize: 14, fontWeight: "700", marginBottom: 7 },
  input: { color: colors.ink, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 13, minHeight: 50, fontSize: 16 },
  hint: { color: "#627873", fontSize: 12, lineHeight: 18, marginTop: 5 },
  notes: { minHeight: 100, textAlignVertical: "top" },
});
