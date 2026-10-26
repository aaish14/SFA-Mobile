import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { colors } from "../constants/theme";

type VisitFieldProps = TextInputProps & { label?: string };

/** Persistent field names and explicit colors keep Android form inputs readable. */
export default function VisitField({
  label,
  placeholder,
  style,
  multiline,
  ...input
}: VisitFieldProps) {
  const fieldName = label || placeholder;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{fieldName}</Text>
      <TextInput
        {...input}
        accessibilityLabel={input.accessibilityLabel || fieldName}
        placeholder={placeholder}
        placeholderTextColor="#627873"
        selectionColor={colors.brand}
        multiline={multiline}
        style={[style, styles.input, multiline && styles.notes]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: 12 },
  label: { color: colors.ink, fontSize: 14, fontWeight: "700", marginBottom: 4 },
  input: { color: colors.ink, backgroundColor: "#FFFFFF", fontSize: 16, minHeight: 50 },
  notes: { minHeight: 100, textAlignVertical: "top" },
});
