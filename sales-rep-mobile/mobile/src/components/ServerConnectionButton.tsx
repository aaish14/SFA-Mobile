import React, { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "./ui";
import { colors } from "../constants/theme";
import { getApiBaseUrl, saveApiBaseUrl } from "../api/connection";

type Props = { disabled?: boolean; onSaved?: () => void };

/** Explicit, user-controlled recovery for an expired temporary server address. */
export default function ServerConnectionButton({ disabled, onSaved }: Props) {
  const [visible, setVisible] = useState(false);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function openConnection() {
    setMessage("");
    setVisible(true);
    try { setAddress(await getApiBaseUrl()); }
    catch { setAddress(""); }
  }

  async function saveConnection() {
    setBusy(true);
    setMessage("");
    try {
      await saveApiBaseUrl(address);
      setVisible(false);
      onSaved?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connection check failed. Your entries are unchanged.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <Button title="Server connection" kind="secondary" onPress={openConnection} disabled={disabled} />
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) setVisible(false); }}>
        <View style={styles.overlay}>
          <ScrollView style={styles.panel} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text accessibilityRole="header" style={styles.title}>Restore server connection</Text>
            <Text style={styles.copy}>Use this only to reconnect to the same company SFA backend when its temporary address changes.</Text>
            <Text style={styles.label}>HTTPS address from your SFA administrator</Text>
            <TextInput accessibilityLabel="SFA server HTTPS address" value={address} onChangeText={setAddress}
              placeholder="https://your-server.trycloudflare.com/api" placeholderTextColor={colors.muted}
              autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} style={styles.input} />
            <Text style={styles.warning}>Only use an address you trust. After you confirm, your login and saved entries will be sent to this server. Do not use links from unknown people.</Text>
            <Text style={styles.copy}>Your offline entries and visit drafts will not be deleted. The laptop and internet connection must stay on.</Text>
            {!!message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
            <Button title={busy ? "Checking connection…" : "Check & use this address"} onPress={saveConnection} disabled={busy || !address.trim()} />
            <Button title="Cancel" kind="secondary" onPress={() => setVisible(false)} disabled={busy} />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  panel: { flexGrow: 0, maxHeight: "90%", width: "100%", maxWidth: 620, alignSelf: "center", backgroundColor: "white", borderRadius: 18 },
  content: { padding: 22 },
  title: { fontSize: 23, fontWeight: "800", color: colors.ink, marginBottom: 10 },
  copy: { color: colors.muted, lineHeight: 21, marginBottom: 16 },
  label: { fontWeight: "700", color: colors.ink, marginBottom: 8 },
  input: { color: colors.ink, borderWidth: 1, borderColor: colors.muted, borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 15 },
  warning: { color: colors.ink, fontWeight: "600", lineHeight: 21, marginBottom: 16 },
  error: { color: "#9B2626", lineHeight: 21, marginBottom: 16 },
});
