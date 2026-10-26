import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Product } from "../types";
import { colors } from "../constants/theme";

/** Display the selected record's values, independently of catalogue filters. */
export default function ProductIdentityFields({
  product,
}: {
  product?: Pick<Product, "brand" | "subBrand" | "brandAlias">;
}) {
  const fields = [
    ["BRAND", product?.brand],
    ["SUB-BRAND", product?.subBrand],
    ["ALIAS", product?.brandAlias],
  ];
  return (
    <View style={styles.row}>
      {fields.map(([label, value]) => (
        <View key={label} style={styles.field}>
          <Text style={styles.label}>{label}</Text>
          <Text
            style={styles.value}
            accessibilityLabel={`${label}: ${value?.trim() || (product ? "Not set in Salesforce" : "No product selected")}`}
          >
            {value?.trim() || (product ? "Not set in Salesforce" : "No product selected")}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 10 },
  field: {
    flexGrow: 1,
    flexBasis: 90,
    minWidth: 0,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#F1F8F6",
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.muted, fontSize: 10, fontWeight: "800", marginBottom: 4 },
  value: { color: colors.ink, fontSize: 13, fontWeight: "700", flexShrink: 1 },
});
