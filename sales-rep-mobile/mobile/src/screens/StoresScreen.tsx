import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api } from "../api/client";
import { Button, Card, Label, Money } from "../components/ui";
import { colors } from "../constants/theme";
import type { RootStack, Store } from "../types";
export default function StoresScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStack, "Stores">) {
  const [stores, setStores] = useState<Store[]>([]),
    [filter, setFilter] = useState("All"),
    [search, setSearch] = useState("");
  useEffect(() => {
    api<Store[]>(`/beats/${route.params.beat.id}/stores`)
      .then(setStores)
      .catch((e) => Alert.alert("Unable to load outlets", e.message));
  }, []);
  const visible = stores.filter(
    (x) =>
      (filter === "All" || x.status === filter) &&
      x.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <View style={s.root}>
      <Label>{route.params.beat.name}</Label>
      <Text style={s.heading}>Choose an outlet</Text>
      <TextInput
        style={s.search}
        placeholder="Search outlet"
        value={search}
        onChangeText={setSearch}
      />
      <View style={s.filters}>
        {["All", "Pending", "Completed", "Not Visited"].map((x) => (
          <Pressable
            key={x}
            onPress={() => setFilter(x)}
            style={[s.chip, filter === x && s.active]}
          >
            <Text style={filter === x && { color: "white" }}>{x}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={visible}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => (
          <Card>
            <View style={s.between}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.badge}>{item.status}</Text>
            </View>
            <Text style={s.sub}>
              {item.code} · {item.contact}
            </Text>
            <Text style={s.sub}>{item.address}</Text>
            <View style={s.history}>
              <View>
                <Label>Last Visit</Label>
                <Text>{item.lastVisit}</Text>
              </View>
              <View>
                <Label>Last Order</Label>
                <Money value={item.lastOrder} />
              </View>
            </View>
            <Button
              title="VISIT OUTLET"
              onPress={() => navigation.navigate("StoreGate", { store: item })}
            />
          </Card>
        )}
      />
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, padding: 16 },
  heading: {
    fontSize: 25,
    fontWeight: "900",
    color: colors.ink,
    marginVertical: 7,
  },
  search: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 13,
  },
  filters: {
    flexDirection: "row",
    gap: 7,
    marginVertical: 12,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "white",
  },
  active: { backgroundColor: colors.brand },
  between: { flexDirection: "row", justifyContent: "space-between" },
  name: { fontSize: 18, fontWeight: "900", color: colors.ink },
  badge: {
    fontSize: 11,
    color: colors.brand,
    backgroundColor: "#EAF5FE",
    padding: 6,
    borderRadius: 12,
  },
  sub: { color: colors.muted, marginTop: 4 },
  history: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 14,
  },
});
