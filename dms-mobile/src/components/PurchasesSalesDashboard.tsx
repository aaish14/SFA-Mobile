import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors as c } from "../theme";

type Month = {
  label: string;
  year: number;
  month: number;
  purchased: number;
  sold: number;
};
export type Dashboard = {
  purchased: number;
  sold: number;
  months: Month[];
  basis: string;
};
/**
 * Format a purchase or sales amount for the dashboard.
 */
const money = (value: number) =>
  `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Accessible labels contain the values: colour and bar length are supplementary. */
export default function PurchasesSalesDashboard({ data }: { data?: Dashboard }) {
  const maximum = Math.max(1, ...(data?.months || []).flatMap((row) => [row.purchased, row.sold]));
  return (
    <View style={s.card}>
      <Text style={s.heading}>Purchased vs sold</Text>
      <Text style={s.copy}>All-time posted values</Text>
      <View style={s.totals}>
        <View style={s.total}>
          <Text style={s.label}>PURCHASED</Text>
          <Text style={s.value}>{data ? money(data.purchased) : "—"}</Text>
          <Text style={s.copy}>Received goods cost</Text>
        </View>
        <View style={s.total}>
          <Text style={s.label}>SOLD</Text>
          <Text style={[s.value, { color: c.accent }]}>{data ? money(data.sold) : "—"}</Text>
          <Text style={s.copy}>Issued sales invoices</Text>
        </View>
      </View>
      <Text style={s.label}>LAST 6 CALENDAR MONTHS</Text>
      {!data && (
        <Text style={s.copy}>Sync to download your dashboard. No estimated sales are shown.</Text>
      )}
      {data?.months.map((row) => (
        <View key={`${row.year}-${row.month}`} style={s.month}>
          <Text style={s.monthTitle}>{row.label}</Text>
          {(
            [
              ["Purchased", row.purchased, c.brand],
              ["Sold", row.sold, c.accent],
            ] as const
          ).map(([label, value, color]) => (
            <View key={label} accessibilityLabel={`${row.label} ${label}: ${money(value)}`}>
              <View style={s.line}>
                <Text style={s.copy}>{label}</Text>
                <Text style={s.money}>{money(value)}</Text>
              </View>
              <View style={s.track}>
                <View
                  style={[
                    s.bar,
                    {
                      width: `${(Math.max(0, value) / maximum) * 100}%`,
                      backgroundColor: color,
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      ))}
      <Text style={s.copy}>
        {data?.basis || "Approval is not a receipt or a sale."} Pending and rejected orders are
        excluded.
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    backgroundColor: c.white,
    borderRadius: 22,
    padding: 20,
    marginVertical: 12,
  },
  heading: { fontSize: 21, fontWeight: "900", color: c.ink, marginBottom: 6 },
  copy: { fontSize: 12, color: c.muted, lineHeight: 18 },
  totals: { flexDirection: "row", gap: 12, marginVertical: 20 },
  total: { flex: 1 },
  label: {
    fontSize: 10,
    fontWeight: "900",
    color: c.muted,
    letterSpacing: 0.5,
    marginBottom: 7,
  },
  value: { fontSize: 23, fontWeight: "900", color: c.brand, marginBottom: 4 },
  month: { marginBottom: 16 },
  monthTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: c.ink,
    marginBottom: 6,
  },
  line: { flexDirection: "row", justifyContent: "space-between" },
  money: { fontSize: 12, fontWeight: "700", color: c.ink },
  track: {
    height: 8,
    backgroundColor: c.surface,
    borderRadius: 4,
    marginTop: 3,
    marginBottom: 6,
    overflow: "hidden",
  },
  bar: { height: 8, borderRadius: 4 },
});
