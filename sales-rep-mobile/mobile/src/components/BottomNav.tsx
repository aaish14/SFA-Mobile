import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../constants/theme";

const items = [
  ["Main", "⌂", "Home"],
  ["Outlets", "◎", "Outlets"],
  ["Orders", "▤", "Orders"],
  ["Products", "▦", "Products"],
  ["More", "•••", "More"],
] as const;

export default function BottomNav({ active }: { active: string }) {
  const navigation = useNavigation<any>();
  return <View style={s.bar}>{items.map(([screen, icon, label]) => {
    const selected = active === screen;
    return <Pressable key={screen} style={s.item} onPress={() => navigation.navigate(screen)}>
      <Text style={[s.icon, selected && s.selected]}>{icon}</Text>
      <Text style={[s.label, selected && s.selected]}>{label}</Text>
    </Pressable>;
  })}</View>;
}

const s = StyleSheet.create({
  bar: { height: 70, maxWidth: 450, width: "94%", alignSelf: "center", flexDirection: "row", backgroundColor: "#FFFDF7", borderWidth: 1, borderColor: colors.border, borderRadius: 22, paddingTop: 7, paddingBottom: 5, marginBottom: 8, shadowColor: colors.navy, shadowOpacity: .14, shadowRadius: 12, elevation: 8 },
  item: { flex: 1, alignItems: "center", justifyContent: "center" },
  icon: { color: colors.muted, fontSize: 20, fontWeight: "900", lineHeight: 22 },
  label: { color: colors.muted, fontSize: 10, fontWeight: "700", marginTop: 2 },
  selected: { color: colors.blue },
});
