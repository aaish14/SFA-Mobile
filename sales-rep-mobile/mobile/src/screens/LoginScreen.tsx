import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { post } from "../api/client";
import { Button } from "../components/ui";
import { colors } from "../constants/theme";
import type { RootStack } from "../types";

type CodeDelivery = { maskedEmail: string; expiresInMinutes: number; testCode?: string };
type LoginResult = {
  token: string;
  user: { displayName: string; distributorName: string; distributorId: string };
};

export default function LoginScreen({ navigation }: NativeStackScreenProps<RootStack, "Login">) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [delivery, setDelivery] = useState<CodeDelivery>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const requestCode = async () => {
    try {
      setBusy(true);
      setError("");
      const result = await post<CodeDelivery>("/auth/request-code", { email: email.trim() });
      setDelivery(result);
      setCode(result.testCode || "");
    } catch (error: any) {
      setError(error.message || "Unable to send the code. Please try again.");
      Alert.alert("Unable to send code", error.message);
    } finally {
      setBusy(false);
    }
  };

  const showCodeEntry = () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      Alert.alert("Email required", "Enter the distributor email address first.");
      return;
    }
    setDelivery({
      maskedEmail: normalizedEmail.replace(/^(.{2}).*(@.*)$/, "$1***$2"),
      expiresInMinutes: 10,
    });
  };

  const verifyCode = async () => {
    try {
      setBusy(true);
      setError("");
      const result = await post<LoginResult>("/auth/verify-code", {
        email: email.trim(),
        code: code.trim(),
      });
      await AsyncStorage.multiSet([
        ["token", result.token],
        ["currentUser", JSON.stringify(result.user)],
      ]);
      navigation.replace("Main");
    } catch (error: any) {
      setError(error.message || "The code could not be verified.");
      Alert.alert("Sign-in failed", error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.brandPanel}>
          <View style={styles.logoBadge}><Text style={styles.logoText}>SFA</Text></View>
          <Text style={styles.eyebrow}>DISTRIBUTOR PORTAL</Text>
          <Text style={styles.title}>Your field-sales workspace</Text>
          <Text style={styles.subtitle}>View assigned outlets, follow the beat and manage every visit from one secure mobile application.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{delivery ? "Enter verification code" : "Distributor sign in"}</Text>
          <Text style={styles.cardCopy}>
            {delivery
              ? `We sent a 6-digit code to ${delivery.maskedEmail}. It is valid for ${delivery.expiresInMinutes} minutes.`
              : "Use the email linked to your active distributor record in Salesforce."}
          </Text>
          <Text style={styles.label}>Email address</Text>
          <TextInput
            style={[styles.input, delivery && styles.readOnlyInput]}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="distributor@company.com"
            editable={!delivery && !busy}
          />

          {delivery ? (
            <>
              <Text style={styles.label}>6-digit code</Text>
              <TextInput
                style={styles.codeInput}
                value={code}
                onChangeText={(value: string) => setCode(value.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="000000"
                textContentType="oneTimeCode"
              />
              {delivery.testCode ? <Text style={styles.testNote}>Local preview code: {delivery.testCode}</Text> : null}
              {!!error && <Text style={styles.errorText}>{error}</Text>}
              <Button title={busy ? "VERIFYING…" : "VERIFY & SIGN IN"} onPress={verifyCode} disabled={busy || code.length !== 6} />
              <Text onPress={requestCode} style={styles.link}>Send a fresh code</Text>
              <Text onPress={() => setDelivery(undefined)} style={styles.link}>Use a different email</Text>
            </>
          ) : (
            <>
              <Button title={busy ? "SENDING…" : "EMAIL MY SIGN-IN CODE"} onPress={requestCode} disabled={busy || !email.trim().includes("@")} />
              {!!error && <Text style={styles.errorText}>{error}</Text>}
              <Text onPress={showCodeEntry} style={styles.link}>I already received a code</Text>
            </>
          )}
          <Text style={styles.securityNote}>🔒 Your login determines exactly which beat and outlets you can access. Passwords are never stored in this application.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F3F6FA" },
  content: { flex: 1, justifyContent: "center", padding: 20 },
  brandPanel: { backgroundColor: colors.navy, borderRadius: 24, padding: 26, paddingBottom: 48 },
  logoBadge: { width: 56, height: 56, borderRadius: 18, backgroundColor: "#2478DD", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  logoText: { color: "white", fontSize: 18, fontWeight: "900" },
  eyebrow: { color: "#8DC9FF", fontSize: 12, fontWeight: "800", letterSpacing: 1.3 },
  title: { color: "white", fontSize: 30, fontWeight: "900", marginTop: 8 },
  subtitle: { color: "#D6E6F7", fontSize: 15, lineHeight: 22, marginTop: 10 },
  card: { backgroundColor: "white", borderRadius: 20, padding: 22, marginHorizontal: 10, marginTop: -24, shadowColor: "#0B2345", shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  cardTitle: { color: "#102A4D", fontSize: 22, fontWeight: "900" },
  cardCopy: { color: "#607087", lineHeight: 20, marginTop: 7, marginBottom: 18 },
  label: { color: "#2B405F", fontSize: 13, fontWeight: "800", marginBottom: 7 },
  input: { borderWidth: 1, borderColor: "#CED8E5", borderRadius: 12, backgroundColor: "#FBFCFE", padding: 14, marginBottom: 16, fontSize: 16 },
  readOnlyInput: { color: "#607087", backgroundColor: "#F2F5F8" },
  codeInput: { borderWidth: 1.5, borderColor: "#2478DD", borderRadius: 12, padding: 14, marginBottom: 14, textAlign: "center", fontSize: 24, fontWeight: "800", letterSpacing: 8 },
  link: { textAlign: "center", color: "#1769C2", fontWeight: "700", marginTop: 16 },
  testNote: { color: "#805900", backgroundColor: "#FFF6D8", padding: 10, borderRadius: 8, marginBottom: 12 },
  errorText: { color: "#B42318", backgroundColor: "#FFF1F0", padding: 10, borderRadius: 8, marginBottom: 12, textAlign: "center", fontWeight: "700" },
  securityNote: { color: "#607087", textAlign: "center", fontSize: 12, lineHeight: 18, marginTop: 18 },
});
