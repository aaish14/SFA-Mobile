import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api } from "../api/client";
import { Button, Card, Label } from "../components/ui";
import { colors } from "../constants/theme";
import type { Beat } from "../types";
export default function BeatsScreen() {
  const [beats, setBeats] = useState<Beat[]>([]),
    [search, setSearch] = useState("");
  const nav: any = useNavigation();
  useEffect(() => {
    api<Beat[]>("/beats")
      .then(setBeats)
      .catch((e) => Alert.alert("Unable to load beats", e.message));
  }, []);
  return (
    <View style={s.root}>
      <Text style={s.heading}>My Beats</Text>
      <TextInput
        style={s.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Search assigned beats"
      />
      <FlatList
        data={beats.filter((b) =>
          b.name.toLowerCase().includes(search.toLowerCase()),
        )}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => (
          <Card>
            <Label>Assigned route</Label>
            <Text style={s.name}>{item.name}</Text>
            <View style={s.row}>
              <Text>{item.stores} Stores</Text>
              <Text style={s.done}>{item.completed} Completed</Text>
              <Text>{item.pending} Pending</Text>
            </View>
            <Button
              title="VIEW OUTLETS"
              onPress={() => nav.navigate("Stores", { beat: item })}
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
    fontSize: 26,
    fontWeight: "900",
    color: colors.ink,
    marginVertical: 12,
  },
  search: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  name: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.ink,
    marginVertical: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  done: { color: colors.success, fontWeight: "700" },
});
