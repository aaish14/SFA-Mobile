import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { colors as c } from "../theme";
/**
 * Format a management-report currency value for display.
 */
const money = (value: number) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
/**
 * Format a report percentage while distinguishing missing measurements.
 */
const rate = (value: number | null) => (value === null ? "—" : `${value}%`);
/**
 * Render a bounded progress indicator from the supplied report percentage.
 */
function Progress({ value }: { value: number | null }) {
  return (
    <View style={s.track}>
      <View style={[s.fill, { width: `${Math.min(100, Math.max(0, value || 0))}%` }]} />
    </View>
  );
}
/**
 * Render the supplied distributor report snapshot and detailed breakdowns without writing source
 * records.
 */
export default function ManagementReports({
  data,
  detailed = false,
  onOpen,
}: {
  data?: any;
  detailed?: boolean;
  onOpen?: () => void;
}) {
  if (!data)
    return (
      <View style={s.card}>
        <Text style={s.title}>Dashboard and reports</Text>
        <Text style={s.muted}>
          Reports have not loaded. Connect and sync to read Salesforce data.
        </Text>
      </View>
    );
  const { sales, beats, coverage, stock, period } = data;
  // Sales vs target belongs in mobile, not the distributor web portal.
  const showSalesTarget = Platform.OS !== "web";
  const desktopSummary = Platform.OS === "web" && !detailed;
  const reportCardStyle = [s.card, desktopSummary && s.desktopCard];
  const visited = beats.reduce((sum: number, row: any) => sum + row.visited, 0);
  const planned = beats.reduce((sum: number, row: any) => sum + row.planned, 0);
  const productive = beats.reduce((sum: number, row: any) => sum + row.productive, 0);
  return (
    <View>
      <Text style={s.title}>Dashboard and reports</Text>
      <Text style={s.muted}>
        {period.start} to {period.today} · India time
      </Text>
      <Text style={s.small}>Calculated: {new Date(data.calculatedAt).toLocaleString()}</Text>
      <View style={desktopSummary && s.desktopGrid}>
        {showSalesTarget && (
          <View style={reportCardStyle}>
            <Text style={s.label}>SALES VS TARGET</Text>
            <Text style={s.value}>{money(sales.current)}</Text>
            <Text style={s.muted}>Booked secondary sales this month</Text>
            <Progress value={sales.achievement} />
            <Text style={s.line}>
              {sales.target === null
                ? "Target not configured in Salesforce"
                : `${money(sales.target)} target · ${rate(sales.achievement)} achieved`}
            </Text>
            <Text style={s.small}>
              Last month: {money(sales.previous)}
              {sales.previousTarget !== null
                ? ` / ${money(sales.previousTarget)} target`
                : " · Target not configured"}
            </Text>
            {detailed && (
              <>
                <Text style={s.small}>{sales.basis}</Text>
                {[
                  ["byEmployee", "By employee"],
                  ["byArea", "By area"],
                  ["byProduct", "By product"],
                ].map(([key, label]) => (
                  <View key={key}>
                    <Text style={s.subtitle}>{label}</Text>
                    {!sales[key].length && (
                      <Text style={s.muted}>No booked sales or configured targets.</Text>
                    )}
                    {sales[key].map((row: any) => (
                      <View style={s.row} key={row.id}>
                        <Text style={s.name}>{row.name}</Text>
                        <Text style={s.line}>
                          This month {money(row.current)} · Last month {money(row.previous)}
                        </Text>
                        <Text style={s.small}>
                          {row.target === null
                            ? "Target not configured"
                            : `Target ${money(row.target)} · ${rate(row.achievement)}`}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </>
            )}
          </View>
        )}
        <View style={reportCardStyle}>
          <Text style={s.label}>BEAT PRODUCTIVITY</Text>
          <Text style={s.value}>
            {visited} visited / {planned} planned
          </Text>
          <Text style={s.line}>{productive} visited outlets placed an order</Text>
          {detailed && (
            <>
              <Text style={s.small}>{data.definitions.beats}</Text>
              {beats.map((row: any) => (
                <View style={s.row} key={row.id}>
                  <Text style={s.name}>{row.name}</Text>
                  <Text style={s.line}>
                    {row.assigned} assigned · {row.planned} planned · {row.visited} visited
                  </Text>
                  <Text style={s.small}>
                    {row.productive} productive · {rate(row.productivity)} of visited outlets
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>
        <View style={reportCardStyle}>
          <Text style={s.label}>OUTLET COVERAGE</Text>
          <Text style={s.value}>{rate(coverage.percent)}</Text>
          <Text style={s.line}>
            {coverage.buyers} active buyers / {coverage.outlets} active assigned outlets
          </Text>
          <Progress value={coverage.percent} />
          {detailed && (
            <>
              <Text style={s.small}>{data.definitions.coverage}</Text>
              {coverage.areas.map((row: any) => (
                <View style={s.row} key={row.id}>
                  <Text style={s.name}>{row.name}</Text>
                  <Text style={s.line}>
                    {row.buyers} buyers / {row.outlets} outlets · {rate(row.percent)}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>
        <View style={reportCardStyle}>
          <Text style={s.label}>DISTRIBUTOR STOCK</Text>
          <Text style={s.value}>{stock.onHand} pieces</Text>
          <Text style={s.line}>
            {stock.available} available · {stock.nearExpiry} near-expiry batches
          </Text>
          <Text style={s.small}>
            {stock.expired} expired · {stock.noRecentSales} batches with no invoice movement in 30
            days
          </Text>
          {detailed && (
            <>
              <Text style={s.small}>{data.definitions.stock}</Text>
              {!stock.batches.length && (
                <Text style={s.muted}>No distributor inventory recorded.</Text>
              )}
              {stock.batches.map((row: any) => (
                <View style={s.row} key={row.Id}>
                  <Text style={s.name}>{row.Product__r?.Name}</Text>
                  <Text style={s.line}>
                    Batch {row.Batch_Number__c || "Not recorded"} · {row.On_Hand_Pieces__c} on hand
                    / {row.Available_Pieces__c} available
                  </Text>
                  <Text style={s.small}>
                    Expiry {row.Expiry_Date__c || "Not recorded"}
                    {row.expired ? " · EXPIRED" : row.nearExpiry ? " · Near expiry" : ""}
                    {row.noRecentSales ? " · Review movement" : ""}
                    {row.Low_Stock__c ? " · Low stock" : ""}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>
      </View>
      {!detailed && (
        <Pressable accessibilityRole="button" onPress={onOpen} style={s.button}>
          <Text style={s.buttonText}>View detailed reports</Text>
        </Pressable>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  desktopGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "stretch" },
  desktopCard: { flexGrow: 1, flexBasis: 240, minWidth: 220 },
  title: { fontSize: 23, fontWeight: "900", color: c.ink, marginVertical: 10 },
  card: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 18,
    marginVertical: 9,
    borderWidth: 1,
    borderColor: c.border,
  },
  label: {
    fontSize: 11,
    color: c.brand,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  value: { fontSize: 24, color: c.ink, fontWeight: "900", marginVertical: 12 },
  muted: { color: c.muted, fontSize: 13, lineHeight: 20 },
  small: { color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  line: { color: c.ink, fontSize: 13, lineHeight: 20 },
  track: {
    backgroundColor: "#E1EBE7",
    height: 8,
    borderRadius: 5,
    overflow: "hidden",
    marginVertical: 12,
  },
  fill: { backgroundColor: c.brand, height: 8 },
  subtitle: { color: c.ink, fontSize: 17, fontWeight: "800", marginTop: 22 },
  row: {
    borderTopWidth: 1,
    borderColor: c.border,
    paddingTop: 12,
    marginTop: 12,
  },
  name: { color: c.ink, fontSize: 14, fontWeight: "700", marginBottom: 5 },
  button: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: c.brand,
    alignItems: "center",
    marginVertical: 10,
  },
  buttonText: { color: "white", fontWeight: "800" },
});
