import React, { useState } from "react";
import {
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { post } from "../api/client";
import { Button } from "../components/ui";
import { colors } from "../constants/theme";
import type { RootStack } from "../types";
export default function LoginScreen({
  navigation,
}: NativeStackScreenProps<RootStack, "Login">) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  const login = async () => {
    try {
      setBusy(true);
      const data = await post<any>("/auth/login", { username, password });
      await AsyncStorage.setItem("token", data.token);
      await AsyncStorage.setItem("currentUser", JSON.stringify(data.user));
      navigation.replace("Main");
    } catch (e: any) {
      Alert.alert("Login failed", e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={s.root}>
      <View style={s.hero}>
        <Text style={s.logo}>SFA</Text>
        <Text style={s.title}>Field Sales, simplified.</Text>
        <Text style={s.copy}>
          Plan the beat. Visit the outlet. Close the day.
        </Text>
      </View>
      <View style={s.form}>
        <TextInput
          style={s.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          placeholder="Distributor username"
        />
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
        />
        <Button
          title={busy ? "Signing in…" : "SIGN IN"}
          onPress={login}
          disabled={busy || !username.trim() || !password}
        />
        <Text style={s.hint}>
          Your distributor determines which outlets and orders you can access.
        </Text>
      </View>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: {
    flex: 1,
    backgroundColor: colors.navy,
    padding: 32,
    justifyContent: "flex-end",
  },
  logo: { fontSize: 24, color: "#F6C85F", fontWeight: "900" },
  title: { fontSize: 34, color: "white", fontWeight: "900", marginTop: 12 },
  copy: { color: "#D8EEE8", fontSize: 16, marginVertical: 12 },
  form: { padding: 28 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#FFFDF7",
    padding: 14,
    marginBottom: 12,
  },
  hint: { textAlign: "center", color: colors.muted, marginTop: 10 },
});
