import React, { useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import BottomNav from "../components/BottomNav";
import { Button, Card } from "../components/ui";
import { colors } from "../constants/theme";
import { logOut } from "../storage/session";
import { flushQueue } from "../storage/syncQueue";

const modules = [
  ["Primary orders / returns", "Primary", "▤"],
  ["Sales Orders", "Orders", "▤"],
  ["Asset Surveys", "asset-surveys", "▣"],
  ["Competitor Activities", "competitor-activities", "◉"],
  ["Tickets", "tickets", "!"],
  ["Stock Checks", "stock-checks", "▦"],
  ["Returns", "returns", "↩"],
  ["Expenses", "Expenses", "₹"],
] as const;

/**
 * Provide additional employee modules, manual synchronization and logout controls.
 */
export default function MoreScreen() {
  const navigation = useNavigation<any>();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  /**
   * Ask for confirmation before delegating session cleanup to the logout helper.
   */
  async function confirmLogOut() {
    setBusy(true);
    setMessage("");
    try {
      await logOut();
      // Back must not reopen the previous employee's screens.
      navigation.reset({ index: 0, routes: [{ name: "Login" }] });
    } catch (error: any) {
      setMessage(error.message || "Unable to log out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Send locally queued changes and refresh the displayed pending count and result message.
   */
  async function syncChanges() {
    setBusy(true);
    try {
      const result = await flushQueue();
      setMessage(
        result.failed
          ? `${result.failed} changes still need syncing. Your work is saved on this device; please retry when connected.`
          : "All queued changes are synced. You can now log out.",
      );
    } catch {
      setMessage("Unable to sync. Your work is still saved on this device.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.shell}>
        <View style={s.header}>
          <Text style={s.kicker}>SFA MOBILE</Text>
          <Text style={s.title}>Salesforce Modules</Text>
          <Text style={s.copy}>Live records belonging to your allocated outlets</Text>
        </View>
        <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 24 }}>
          {modules
            .filter(
              ([, name]) =>
                name !== "Primary" || process.env.EXPO_PUBLIC_ENABLE_DMS_PRIMARY === "true",
            )
            .map(([title, moduleName, icon]) => (
              <Pressable
                key={title}
                disabled={busy}
                onPress={() =>
                  moduleName === "Orders"
                    ? navigation.navigate("Orders")
                    : moduleName === "Expenses"
                      ? navigation.navigate("Expenses")
                      : moduleName === "Primary"
                        ? navigation.navigate("Primary")
                        : navigation.navigate("ModuleList", { moduleName, title })
                }
              >
                <Card style={s.row}>
                  <Text style={s.icon}>{icon}</Text>
                  <Text style={s.name}>{title}</Text>
                  <Text style={s.arrow}>›</Text>
                </Card>
              </Pressable>
            ))}
          <Card>
            <Text style={s.name}>Account</Text>
            {confirming ? (
              <>
                <Text style={{ color: colors.ink, lineHeight: 21, marginVertical: 12 }}>
                  Log out of this device? Save any unfinished work first. You will need a new email
                  code to sign in again.
                </Text>
                {!!message && (
                  <Text accessibilityRole="alert" style={{ color: colors.ink, marginVertical: 12 }}>
                    {message}
                  </Text>
                )}
                <Button
                  title={busy ? "Please wait…" : "Confirm log out"}
                  kind="danger"
                  onPress={confirmLogOut}
                  disabled={busy}
                />
                <Button
                  title="Sync changes"
                  kind="secondary"
                  onPress={syncChanges}
                  disabled={busy}
                />
                <Button
                  title="Cancel"
                  kind="secondary"
                  onPress={() => {
                    setConfirming(false);
                    setMessage("");
                  }}
                  disabled={busy}
                />
              </>
            ) : (
              <Button title="Log out" kind="danger" onPress={() => setConfirming(true)} />
            )}
          </Card>
        </ScrollView>
        {!busy && <BottomNav active="More" />}
      </View>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#E8E1D3" },
  shell: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    backgroundColor: colors.surface,
  },
  header: {
    backgroundColor: colors.navy,
    padding: 20,
    paddingBottom: 24,
    borderBottomRightRadius: 28,
  },
  kicker: { color: "#9DD9C9", fontWeight: "900", fontSize: 11, letterSpacing: 1.4 },
  title: { color: "white", fontSize: 25, fontWeight: "900", marginTop: 5 },
  copy: { color: "#D8EEE8", fontSize: 11, marginTop: 5 },
  body: { flex: 1, padding: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    marginBottom: 9,
    borderLeftWidth: 4,
    borderLeftColor: "#F6C85F",
  },
  icon: { width: 32, color: colors.blue, fontSize: 19, fontWeight: "900" },
  name: { flex: 1, color: colors.ink, fontWeight: "800" },
  arrow: { color: colors.muted, fontSize: 24 },
});
