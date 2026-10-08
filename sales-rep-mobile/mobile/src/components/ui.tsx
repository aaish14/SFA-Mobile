import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors } from "../constants/theme";
export const Card = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) => <View style={[s.card, style]}>{children}</View>;
export const Button = ({
  title,
  onPress,
  kind = "brand",
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  kind?: "brand" | "secondary" | "danger";
  disabled?: boolean;
}) => (
  <Pressable
    disabled={disabled}
    onPress={onPress}
    style={[
      s.button,
      kind === "secondary" && s.secondary,
      kind === "danger" && s.danger,
      disabled && { opacity: 0.45 },
    ]}
  >
    <Text
      style={[s.buttonText, kind === "secondary" && { color: colors.brand }]}
    >
      {title}
    </Text>
  </Pressable>
);
export const Label = ({ children }: { children: React.ReactNode }) => (
  <Text style={s.label}>{children}</Text>
);
export const Money = ({ value }: { value: number }) => (
  <Text>₹{new Intl.NumberFormat("en-IN").format(value)}</Text>
);
const s = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#032D60",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  button: {
    backgroundColor: colors.brand,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: "center",
    marginVertical: 5,
  },
  secondary: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  danger: { backgroundColor: colors.danger },
  buttonText: { color: colors.white, fontWeight: "800" },
  label: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});
