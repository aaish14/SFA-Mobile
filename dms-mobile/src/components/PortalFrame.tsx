import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { BrandHeader, BottomNavigation } from "./Workspace";
import BrandLogo from "./BrandLogo";

// Presentation only: every destination reuses an existing DMS screen/handler.
export const portalLinks = [
  ["Home", "Dashboard", "▦"],
  ["Primary", "Primary orders", "▤"],
  ["Secondary", "Secondary orders", "▤"],
  ["Invoices", "Invoices", "▤"],
  ["Outlets", "Outlets", "◎"],
  ["Inventory", "Stock & inventory", "▥"],
  ["Reports", "Dashboard & reports", "▧"],
  ["Returns", "Returns", "↩"],
  ["Tickets", "Support tickets", "☷"],
  ["Assets", "Outlet assets", "□"],
  ["Stock checks", "Stock checks", "▦"],
  ["Sync", "Sync centre", "↻"],
  ["More", "More", "•••"],
];

type Props = {
  children: React.ReactNode;
  signedIn: boolean;
  tab: string;
  name: string;
  pending: number;
  busy: boolean;
  loggingOut: boolean;
  onSelect: (tab: string) => void;
  onRefresh: () => void;
  onLogout: () => void;
};

/**
 * Render the responsive distributor portal shell, navigation and account controls using
 * callbacks supplied by DmsApp.
 */
export default function PortalFrame(p: Props) {
  const { width } = useWindowDimensions();
  const [collapsed, setCollapsed] = useState(width < 900);
  // The browser is always a desktop workspace, including Codex side panels.
  // Only the native Android/iOS builds use the phone navigation.
  const desktop = Platform.OS === "web";
  if (!desktop)
    return (
      <View style={s.mobile}>
        <BrandHeader />
        {p.children}
        {p.signedIn && <BottomNavigation tab={p.tab} onSelect={p.onSelect} />}
      </View>
    );
  const title = portalLinks.find(([key]) => key === p.tab)?.[1] || "Distributor portal";
  return (
    <View style={s.desktop}>
      {p.signedIn && (
        <View style={[s.sidebar, collapsed && s.sidebarCollapsed]}>
          <View style={[s.brand, collapsed && { paddingHorizontal: 8 }]}>
            <BrandLogo width={collapsed ? 60 : 82} />
            {!collapsed && (
              <View style={{ flex: 1 }}>
                <Text style={s.wordmark}>DMS</Text>
                <Text style={s.caption}>DISTRIBUTOR PORTAL</Text>
              </View>
            )}
          </View>
          <ScrollView contentContainerStyle={s.links}>
            {!collapsed && <Text style={s.group}>WORKSPACE</Text>}
            {portalLinks.map(([key, label, icon]) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: p.tab === key }}
                onPress={() => p.onSelect(key)}
                style={[s.link, p.tab === key && s.selected]}
              >
                <Text style={[s.icon, p.tab === key && s.selectedText]}>{icon}</Text>
                {!collapsed && (
                  <Text style={[s.linkText, p.tab === key && s.selectedText]}>{label}</Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
          {!collapsed && (
            <View style={s.account}>
              <Text style={s.accountName}>{p.name}</Text>
              <Text style={s.caption}>
                {p.pending} pending change{p.pending === 1 ? "" : "s"}
              </Text>
            </View>
          )}
        </View>
      )}
      <View style={s.main}>
        <View style={s.topbar}>
          {p.signedIn ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onPress={() => setCollapsed(!collapsed)}
              style={s.tool}
            >
              <Text style={s.toolText}>☰</Text>
            </Pressable>
          ) : (
            <BrandLogo />
          )}
          <Text style={s.pageTitle}>{p.signedIn ? title : "DMS Distributor Portal"}</Text>
          <Text style={s.date}>
            {new Date().toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </Text>
          {p.signedIn && (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh portal data"
                accessibilityState={{ disabled: p.busy }}
                disabled={p.busy}
                onPress={p.onRefresh}
                style={[s.tool, p.busy && s.dim]}
              >
                <Text style={s.toolText}>↻</Text>
              </Pressable>
              <View style={s.identity}>
                <Text style={s.avatar}>{p.name.trim().charAt(0).toUpperCase() || "D"}</Text>
                <View>
                  <Text style={s.accountName}>{p.name}</Text>
                  <Text style={s.caption}>Distributor</Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Log out of distributor"
                accessibilityState={{ disabled: p.loggingOut }}
                disabled={p.loggingOut}
                onPress={p.onLogout}
                style={s.tool}
              >
                <Text style={s.logout}>{p.loggingOut ? "Signing out…" : "Log out"}</Text>
              </Pressable>
            </>
          )}
        </View>
        <View style={[s.content, !p.signedIn && s.login]}>{p.children}</View>
        {p.signedIn && (
          <Text style={s.footer}>
            Salesforce records for the signed-in distributor · Review synchronization status in Sync
            centre
          </Text>
        )}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  desktop: {
    flex: 1,
    flexDirection: "row",
    width: "100%",
    height: "100%",
    alignSelf: "stretch",
    backgroundColor: "#F4F9F5",
  },
  mobile: {
    flex: 1,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    backgroundColor: "#F4F9F5",
  },
  sidebar: { width: 232, backgroundColor: "white", borderRightWidth: 1, borderColor: "#D8E7DC" },
  sidebarCollapsed: { width: 76 },
  brand: {
    height: 82,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 10,
    borderBottomWidth: 1,
    borderColor: "#EAF3ED",
  },
  logo: {
    width: 36,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#16734B",
    color: "white",
    fontSize: 23,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 38,
  },
  wordmark: { fontSize: 18, color: "#173D2D", fontWeight: "800" },
  caption: { fontSize: 10, color: "#547264", marginTop: 4 },
  links: { padding: 12, gap: 4 },
  group: { fontSize: 10, letterSpacing: 1.5, color: "#547264", fontWeight: "700", padding: 12 },
  link: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 12,
    borderRadius: 9,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  selected: { backgroundColor: "#E7F4EB", borderLeftColor: "#16734B" },
  selectedText: { color: "#12613F" },
  icon: { fontSize: 18, color: "#547264", width: 20, textAlign: "center" },
  linkText: { fontSize: 12, color: "#315D46", fontWeight: "600", flexShrink: 1 },
  account: { margin: 12, padding: 12, borderWidth: 1, borderColor: "#D8E7DC", borderRadius: 10 },
  accountName: { fontSize: 12, fontWeight: "700", color: "#173D2D" },
  main: { flex: 1, minWidth: 0 },
  topbar: {
    minHeight: 76,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderColor: "#D8E7DC",
  },
  pageTitle: { fontSize: 16, fontWeight: "700", color: "#173D2D", flex: 1 },
  date: { fontSize: 11, color: "#547264" },
  tool: {
    minHeight: 38,
    minWidth: 38,
    borderWidth: 1,
    borderColor: "#D8E7DC",
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 9,
  },
  toolText: { fontSize: 19, color: "#547264" },
  logout: { fontSize: 12, color: "#315D46", fontWeight: "600" },
  dim: { opacity: 0.45 },
  identity: { flexDirection: "row", alignItems: "center", gap: 9, maxWidth: 230 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    lineHeight: 34,
    textAlign: "center",
    backgroundColor: "#E7F4EB",
    color: "#16734B",
    fontWeight: "700",
  },
  content: { flex: 1, minHeight: 0, width: "100%", paddingHorizontal: 12, paddingTop: 10 },
  login: { alignSelf: "stretch", paddingTop: 30 },
  footer: { fontSize: 10, color: "#547264", textAlign: "center", padding: 10 },
});
