import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { post } from "../api/client";
import { Button, Card, Label } from "../components/ui";
import { colors } from "../constants/theme";
import type { RootStack } from "../types";
export default function StoreGateScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStack, "StoreGate">) {
  const [result, setResult] = useState<any>(),
    [busy, setBusy] = useState(false);
  const validate = async () => {
    try {
      setBusy(true);
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== "granted")
        throw new Error("GPS permission is required to validate this outlet.");
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const location = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        timestamp: new Date().toISOString(),
        requestId: `gps-${Date.now()}`,
      };
      const r = await post<any>("/store/validate-location", {
        storeId: route.params.store.id,
        location,
      });
      setResult({ ...r, location });
    } catch (e: any) {
      Alert.alert("Location unavailable", e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <Card>
        <View style={s.top}><Label>ACTIVE OUTLET</Label><Text style={s.status}>ACTIVE</Text></View>
        <Text style={s.name}>{route.params.store.name}</Text>
        <Text style={s.sub}>
          {route.params.store.code} · {route.params.store.contact}
        </Text>
        <Text style={s.sub}>{route.params.store.address}</Text>
        <View style={s.line} />
        <View style={s.summary}><View><Label>OUTSTANDING</Label><Text style={s.value}>₹{route.params.store.lastOrder.toLocaleString("en-IN")}</Text></View><View><Label>LAST VISIT</Label><Text style={s.value}>{route.params.store.lastVisit}</Text></View><View><Label>LAST ORDER</Label><Text style={s.value}>₹{route.params.store.lastOrder.toLocaleString("en-IN")}</Text></View></View>
      </Card>
      <Card><Label>100 METRE LOCATION VALIDATION</Label><Text style={s.sub}>Capture your current GPS position before entering the outlet. This protects the accuracy of every visit.</Text></Card>
      {result && (
        <Card
          style={{
            borderLeftWidth: 5,
            borderLeftColor: result.allowed ? colors.success : colors.danger,
          }}
        >
          <Label>GPS validation</Label>
          <Text style={s.distance}>{result.distance} metres</Text>
          <Text style={s.sub}>
            {result.allowed
              ? "You are within the permitted outlet radius."
              : "You are outside the allowed 100 metre outlet radius. Move closer and try again."}
          </Text>
          {result.allowed ? (
            <Button
              title="ENTER OUTLET"
              onPress={() =>
                navigation.replace("Visit", {
                  store: route.params.store,
                  location: result.location,
                  distance: result.distance,
                })
              }
            />
          ) : (
            <>
              <Button title="TRY AGAIN" onPress={validate} />
              <Button
                title="MOVE TO NEXT OUTLET"
                kind="secondary"
                onPress={() =>
                  Alert.alert(
                    "Reason required",
                    "Choose Store closed, Owner unavailable, Wrong location, GPS issue, or Other from the missed-visit form.",
                  )
                }
              />
            </>
          )}
        </Card>
      )}{" "}
      {!result && (
        <Button
          title={busy ? "CHECKING LOCATION…" : "CAPTURE LOCATION"}
          onPress={validate}
          disabled={busy}
        />
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
    width:"100%", maxWidth:480, alignSelf:"center",
  },
  content:{ padding:16, paddingTop:24 },
  top:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},status:{fontSize:10,fontWeight:"900",color:colors.success,backgroundColor:"#E8F7EC",paddingHorizontal:10,paddingVertical:5,borderRadius:12},summary:{flexDirection:"row",justifyContent:"space-between"},value:{color:colors.ink,fontSize:12,fontWeight:"900",marginTop:5},
  name: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.ink,
    marginVertical: 8,
  },
  sub: { color: colors.muted, marginTop: 5 },
  line: { height: 1, backgroundColor: colors.border, marginVertical: 14 },
  distance: {
    fontSize: 34,
    fontWeight: "900",
    color: colors.brand,
    marginVertical: 8,
  },
});
