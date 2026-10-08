import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { Card } from "../components/ui";
import { colors } from "../constants/theme";
import type { Store } from "../types";

export default function OutletMapScreen() {
  const [outlets, setOutlets] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Store[]>("/outlets")
      .then((rows) => setOutlets(rows.filter((row) => row.latitude != null && row.longitude != null)))
      .catch((reason) => setError(reason.message || "Unable to load outlet locations"))
      .finally(() => setLoading(false));
  }, []);
  const navigate = (outlet: Store) => Linking.openURL(`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=;${outlet.latitude},${outlet.longitude}`);
  return <SafeAreaView style={s.root}><ScrollView contentContainerStyle={s.content}>
    <Text style={s.title}>OUTLET MAP</Text><Text style={s.subtitle}>Salesforce outlet locations assigned to your distributor</Text>
    {loading && <ActivityIndicator color={colors.brand} />}
    {!!error && <Card style={s.error}><Text style={s.errorTitle}>Map data unavailable</Text><Text style={s.subtitle}>{error}</Text></Card>}
    {!loading && !error && !outlets.length && <Card><Text style={s.name}>No mapped outlets</Text><Text style={s.subtitle}>Ask the administrator to maintain outlet geolocation in Salesforce.</Text></Card>}
    {outlets.map((outlet) => <Card key={outlet.id} style={s.card}><View style={s.row}><Text style={s.pin}>⌾</Text><View style={s.details}><Text style={s.name}>{outlet.name}</Text><Text style={s.subtitle}>{outlet.code} • {outlet.beatName || "Unassigned beat"}</Text><Text style={s.subtitle}>{outlet.owner || "Owner not specified"} • {outlet.contact || outlet.phone || "Phone unavailable"}</Text></View></View><Pressable style={s.button} onPress={() => navigate(outlet)}><Text style={s.buttonText}>NAVIGATE</Text></Pressable></Card>)}
  </ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({root:{flex:1,backgroundColor:colors.surface},content:{padding:16,gap:12},title:{fontSize:24,fontWeight:"900",color:colors.navy},subtitle:{fontSize:12,color:colors.muted,marginTop:3},card:{padding:16,borderLeftWidth:4,borderLeftColor:"#F6C85F"},row:{flexDirection:"row",alignItems:"center"},pin:{fontSize:28,color:colors.blue,marginRight:12},details:{flex:1},name:{fontSize:15,fontWeight:"900",color:colors.ink},button:{alignSelf:"flex-end",backgroundColor:colors.blue,paddingHorizontal:14,paddingVertical:9,borderRadius:9,marginTop:12},buttonText:{color:"white",fontSize:10,fontWeight:"900"},error:{padding:16,borderLeftWidth:4,borderLeftColor:colors.danger},errorTitle:{color:colors.danger,fontWeight:"900"}});
