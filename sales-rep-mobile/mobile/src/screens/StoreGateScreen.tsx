import React, { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, post } from "../api/client";
import { Button, Card, Label } from "../components/ui";
import { colors } from "../constants/theme";
import type { RootStack } from "../types";
export default function StoreGateScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStack, "StoreGate">) {
  const [result, setResult] = useState<any>(),
    [busy, setBusy] = useState(false),
    [store, setStore] = useState(route.params.store),
    [message, setMessage] = useState("");
  useEffect(() => {
    api<any>(`/stores/${route.params.store.id}`).then((details) => setStore({ ...route.params.store, ...details })).catch(() => undefined);
  }, [route.params.store.id]);
  const validate = async () => {
    try {
      setBusy(true);
      setMessage("");
      let latitude: number;
      let longitude: number;
      if (Platform.OS === "web") {
        if (store.latitude == null || store.longitude == null) {
          throw new Error("This outlet has no Salesforce location. Add its latitude and longitude before starting a visit.");
        }
        latitude = Number(store.latitude);
        longitude = Number(store.longitude);
        setMessage("Local web preview is using the outlet coordinates from Salesforce. The mobile build uses live device GPS.");
      } else {
        const p = await Location.requestForegroundPermissionsAsync();
        if (p.status !== "granted") throw new Error("GPS permission is required to validate this outlet.");
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        latitude = loc.coords.latitude;
        longitude = loc.coords.longitude;
      }
      const location = {
        latitude,
        longitude,
        timestamp: new Date().toISOString(),
        requestId: `gps-${Date.now()}`,
      };
      const r = await post<any>("/store/validate-location", {
        storeId: route.params.store.id,
        location,
      });
      setResult({ ...r, location });
      if (r.allowed) {
        navigation.replace("Visit", {
          store,
          location,
          distance: r.distance,
        });
      } else {
        setMessage("You are outside the allowed 100 metre radius. Move closer to the outlet and try again.");
      }
    } catch (e: any) {
      setMessage(e.message || "Location validation failed.");
      Alert.alert("Location unavailable", e.message);
    } finally {
      setBusy(false);
    }
  };
  const saveMissedStatus = async (status: "Not Visited" | "Not Available") => {
    try {
      setBusy(true);
      await post(`/outlets/${store.id}/visit-status`, { status });
      setMessage(`${status} saved in Salesforce`);
      Alert.alert("Saved", `${status} was recorded for ${store.name}.`);
    } catch (error: any) {
      Alert.alert("Unable to save", error.message);
    } finally { setBusy(false); }
  };
  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <Card>
        <View style={s.top}><Label>ACTIVE OUTLET</Label><Text style={s.status}>ACTIVE</Text></View>
        <Text style={s.name}>{store.name}</Text>
        <Text style={s.sub}>
          {store.code} · {store.contact || store.phone || "Phone unavailable"}
        </Text>
        <Text style={s.sub}>{store.address || "Address unavailable"}</Text>
        <Text style={s.sub}>Owner: {store.owner || "Not specified"} · {store.email || "Email unavailable"}</Text>
        <View style={s.line} />
        <View style={s.summary}><View><Label>OUTSTANDING</Label><Text style={s.value}>₹{Number(store.outstandingAmount || 0).toLocaleString("en-IN")}</Text></View><View><Label>VISITS</Label><Text style={s.value}>{store.visitCount || 0}</Text></View><View><Label>ORDERS</Label><Text style={s.value}>{store.orderCount || 0}</Text></View></View>
        <Text style={s.sub}>Last visit: {store.lastVisit ? new Date(store.lastVisit).toLocaleString("en-IN") : "Not visited"}</Text>
        <Text style={s.sub}>Last order: {store.lastOrderDate || "No orders"} · ₹{Number(store.lastOrderAmount || 0).toLocaleString("en-IN")}</Text>
      </Card>
      <Card><Label>OUTLET VISIT STATUS</Label><View style={s.statusButtons}><Button title="VISITED" onPress={validate} disabled={busy}/><Button title="NOT VISITED" kind="secondary" onPress={() => saveMissedStatus("Not Visited")} disabled={busy}/><Button title="NOT AVAILABLE" kind="secondary" onPress={() => saveMissedStatus("Not Available")} disabled={busy}/></View>{!!message && <Text style={s.saved}>{message}</Text>}</Card>
      <Card><Label>100 METRE LOCATION VALIDATION</Label><Text style={s.sub}>Capture your current GPS position before entering the outlet. This protects the accuracy of every visit.</Text></Card>
      {result && !result.allowed && (
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
        </Card>
      )}{" "}
      {!result && <Text style={s.hint}>Choose Visited to validate your location and open product selection.</Text>}
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
  statusButtons:{marginTop:10},saved:{color:colors.success,fontWeight:"800",marginTop:8},hint:{textAlign:"center",color:colors.muted,marginVertical:10},
});
