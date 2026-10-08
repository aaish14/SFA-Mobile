import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card, Label } from "../components/ui";
import { colors } from "../constants/theme";
import { flushQueue, pendingCount } from "../storage/syncQueue";
export function VisitsScreen() {
  return (
    <View style={s.root}>
      <Text style={s.title}>Today's Visits</Text>
      <Card>
        <Label>Route progress</Label>
        <Text style={s.big}>1 completed · 3 pending</Text>
        <Text style={s.muted}>
          Open Beats to continue the Lakeside Market route.
        </Text>
      </Card>
    </View>
  );
}
export function OrdersScreen() {
  return (
    <View style={s.root}>
      <Text style={s.title}>Orders</Text>
      <Card>
        <Label>Today</Label>
        <Text style={s.big}>Orders appear here after checkout</Text>
        <Text style={s.muted}>
          PDF and Excel sharing is available from the completed visit.
        </Text>
      </Card>
    </View>
  );
}
export function ProfileScreen() {
  const [pending, setPending] = useState(0),
    [message, setMessage] = useState("Ready");
  useEffect(() => {
    pendingCount().then(setPending);
  }, []);
  const sync = async () => {
    const r = await flushQueue();
    setPending(r.failed);
    setMessage(`${r.synced} synced · ${r.failed} failed`);
  };
  return (
    <View style={s.root}>
      <Text style={s.title}>Aishwarya</Text>
      <Text style={s.muted}>Sales Representative</Text>
      <Card>
        <Label>Offline synchronization</Label>
        <Text style={s.big}>{pending} pending</Text>
        <Text onPress={sync} style={s.link}>
          Retry synchronization
        </Text>
        <Text style={s.muted}>{message}</Text>
      </Card>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, padding: 18 },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: colors.ink,
    marginVertical: 12,
  },
  big: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink,
    marginVertical: 8,
  },
  muted: { color: colors.muted },
  link: { color: colors.brand, fontWeight: "800", marginVertical: 10 },
});
