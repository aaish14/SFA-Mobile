import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

export type BarcodeData = {
  format: "CODE128"; value: string; image: string; width: number; height: number;
};
type Props = {
  barcode?: BarcodeData | null;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
};

/** Display the server-generated Code 128 image; tapping reveals details, not a new transaction. */
export default function RecordBarcode({ barcode, label, onPress, disabled, children }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(300);
  if (!barcode || !/^data:image\/png;base64,/.test(barcode.image)) return null;
  // Show the complete code and quiet zones on phones, scaling both dimensions together.
  const width = Math.min(barcode.width, availableWidth);
  const height = width * barcode.height / barcode.width;
  return <View style={s.root}>
    <Text style={s.label}>{label}</Text>
    <View style={s.scroller} onLayout={event => setAvailableWidth(Math.max(1, event.nativeEvent.layout.width - 2))}>
      <Pressable accessibilityRole="button" accessibilityLabel={label}
        accessibilityHint={onPress ? "Open the saved invoice" : "Show or hide product details"}
        accessibilityState={{ disabled: !!disabled, ...(!onPress ? { expanded } : {}) }}
        disabled={disabled} onPress={onPress || (() => setExpanded(value => !value))}>
        <Image source={{ uri: barcode.image }} style={{ width, height }} resizeMode="contain"
          accessibilityLabel={`Code 128: ${barcode.value}`} />
      </Pressable>
    </View>
    <Pressable accessibilityRole="button" disabled={disabled}
      onPress={onPress || (() => setExpanded(value => !value))}>
      <Text selectable style={s.code}>{barcode.value}</Text>
      <Text style={s.hint}>{onPress ? "Tap to open invoice details" : expanded ? "Hide product details" : "Tap to view product details"}</Text>
    </Pressable>
    {expanded && !onPress && <View style={s.details}>{children}</View>}
  </View>;
}
const s = StyleSheet.create({
  root: { marginVertical: 12, minWidth: 0, maxWidth: "100%" },
  label: { fontWeight: "700", color: "#173e32", marginBottom: 6 },
  scroller: { backgroundColor: "white", borderWidth: 1, borderColor: "#c6ddcf", borderRadius: 6 },
  code: { color: "#173e32", marginTop: 6, fontSize: 12 },
  hint: { color: "#16744e", fontWeight: "700", marginVertical: 6 },
  details: { padding: 12, backgroundColor: "#edf7f0", borderRadius: 8 },
});
