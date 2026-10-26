import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors as c } from "../theme";
import BrandLogo from "./BrandLogo";

/**
 * Render the DMS brand and signed-in workspace heading.
 */
export function BrandHeader() {
  return (
    <View style={s.brand}>
      <View style={{ marginRight: 10 }}>
        <BrandLogo width={70} />
      </View>
      <Text style={s.brandTitle}>DMS PORTAL</Text>
      <Text style={s.badge}>DISTRIBUTOR</Text>
    </View>
  );
}

/**
 * Render the compact workspace navigation and notify the parent when a tab is selected.
 */
export function BottomNavigation({
  tab,
  onSelect,
}: {
  tab: string;
  onSelect: (tab: string) => void;
}) {
  const active = ["Primary", "Secondary"].includes(tab)
    ? "Primary"
    : ["Home", "Inventory", "Outlets"].includes(tab)
      ? tab
      : "More";
  return (
    <View style={s.navigation}>
      {[
        ["Home", "⌂", "Home"],
        ["Primary", "▤", "Orders"],
        ["Inventory", "▦", "Stock"],
        ["Outlets", "◎", "Outlets"],
        ["More", "•••", "More"],
      ].map(([key, icon, label]) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ selected: active === key }}
          onPress={() => onSelect(key)}
          style={s.navItem}
        >
          <Text style={[s.navIcon, active === key && s.active]}>{icon}</Text>
          <Text style={[s.navLabel, active === key && s.active]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Display one dashboard metric with its explanatory label.
 */
export function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: string;
}) {
  return (
    <View style={s.metric}>
      <Text style={s.metricIcon}>{icon}</Text>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}

/**
 * Render a workspace menu row with its icon, description and navigation callback.
 */
export function MenuItem({
  title,
  description,
  icon,
  onPress,
}: {
  title: string;
  description: string;
  icon: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={s.menu}>
      <Text style={s.menuIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.menuTitle}>{title}</Text>
        <Text style={s.muted}>{description}</Text>
      </View>
      <Text style={s.chevron}>›</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  brand: {
    minHeight: 66,
    backgroundColor: c.navy,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    borderBottomRightRadius: 26,
    gap: 8,
  },
  brandIcon: { color: c.gold, fontSize: 22 },
  brandTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    flex: 1,
    letterSpacing: 0.5,
  },
  badge: {
    color: c.navy,
    backgroundColor: c.gold,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 8,
    fontSize: 9,
    fontWeight: "900",
  },
  navigation: {
    minHeight: 70,
    flexDirection: "row",
    width: "94%",
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 22,
    paddingVertical: 7,
    marginBottom: 8,
    shadowColor: c.navy,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  navIcon: { color: c.muted, fontSize: 21, fontWeight: "900" },
  navLabel: { color: c.muted, fontSize: 10, fontWeight: "700", marginTop: 3 },
  active: { color: c.accent },
  metric: {
    width: "48%",
    backgroundColor: c.white,
    padding: 15,
    borderRadius: 22,
    borderTopWidth: 3,
    borderTopColor: "#9DD9C9",
    minHeight: 142,
    shadowColor: c.navy,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  metricIcon: {
    color: c.brand,
    backgroundColor: c.mint,
    width: 34,
    height: 34,
    borderRadius: 17,
    textAlign: "center",
    lineHeight: 34,
    fontSize: 18,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: "900",
    color: c.ink,
    marginTop: 10,
    marginBottom: 4,
  },
  muted: { color: c.muted, fontSize: 12, lineHeight: 18 },
  menu: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.white,
    borderRadius: 18,
    padding: 16,
    marginVertical: 6,
    minHeight: 76,
    borderWidth: 1,
    borderColor: c.border,
  },
  menuIcon: {
    fontSize: 22,
    color: c.brand,
    backgroundColor: c.mint,
    width: 40,
    height: 40,
    lineHeight: 40,
    textAlign: "center",
    borderRadius: 12,
  },
  menuTitle: { color: c.ink, fontSize: 15, fontWeight: "800", marginBottom: 3 },
  chevron: { color: c.muted, fontSize: 25 },
});
