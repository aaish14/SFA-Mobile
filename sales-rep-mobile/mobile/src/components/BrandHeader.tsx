import React from "react";
import { StyleSheet, Text, View } from "react-native";
import BrandLogo from "./BrandLogo";
/**
 * Render the shared SFA branded header and its supplied screen context.
 */
export default function BrandHeader() {
  return (
    <View style={s.header}>
      <View style={{ marginRight: 10 }}>
        <BrandLogo width={70} />
      </View>
      <Text style={s.title}>SFA MOBILE</Text>
      <Text style={s.badge}>EMPLOYEE</Text>
    </View>
  );
}
const s = StyleSheet.create({
  header: {
    height: 66,
    backgroundColor: "#123F3B",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    borderBottomRightRadius: 26,
    shadowColor: "#173A36",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  truck: { color: "#F6C85F", fontSize: 20, marginRight: 9 },
  title: { color: "#FFFDF7", fontSize: 18, fontWeight: "900", letterSpacing: 0.5, flex: 1 },
  badge: {
    color: "#123F3B",
    fontSize: 10,
    fontWeight: "900",
    backgroundColor: "#F6C85F",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
});
