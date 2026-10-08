import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api } from "../api/client";
import BrandHeader from "../components/BrandHeader";
import BottomNav from "../components/BottomNav";
import { colors } from "../constants/theme";
import type { Store } from "../types";

export default function OutletsScreen() {
  const navigation = useNavigation<any>();
  const [outlets, setOutlets] = useState<Store[]>([]);
  const [query, setQuery] = useState("");
  const [selectedBeat, setSelectedBeat] = useState("All Beats");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedOutlet, setExpandedOutlet] = useState("");

  const formatVisitTime = (value?: string) => {
    if (!value) return "Time not captured";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  };
  const formatLocation = (location?: { latitude: number; longitude: number } | null) =>
    location ? `${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}` : "Location not captured";

  const loadOutlets = async () => {
    setLoading(true);
    setError("");
    try { setOutlets(await api<Store[]>("/outlets")); }
    catch (reason: any) { setError(reason.message || "Unable to load outlets"); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadOutlets(); }, []);

  const beats = useMemo(() => ["All Beats", ...Array.from(new Set(outlets.map((row) => row.beatName).filter(Boolean)))], [outlets]);
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return outlets.filter((outlet) => {
      const matchesSearch = `${outlet.name} ${outlet.code} ${outlet.owner || ""} ${outlet.contact || outlet.phone || ""}`.toLowerCase().includes(text);
      return matchesSearch && (selectedBeat === "All Beats" || outlet.beatName === selectedBeat);
    });
  }, [outlets, query, selectedBeat]);

  return <SafeAreaView style={s.safe}><View style={s.shell}><BrandHeader />
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <View style={s.top}><View><Text style={s.title}>MY OUTLETS</Text><Text style={s.muted}>{outlets.length} Outlets Assigned to You</Text></View><Pressable style={s.map} onPress={() => navigation.navigate("OutletMap")}><Text style={s.mapText}>➤ Map View</Text></Pressable></View>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search outlet, code, owner, phone..." style={s.search} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{beats.map((beat) => <Pressable key={beat} onPress={() => setSelectedBeat(beat || "All Beats")} style={[s.chip, selectedBeat === beat && s.chipOn]}><Text style={[s.chipText, selectedBeat === beat && s.chipTextOn]}>{beat}</Text></Pressable>)}</ScrollView>
      {loading && <View style={s.state}><ActivityIndicator color={colors.brand} /><Text style={s.muted}>Loading Salesforce outlets…</Text></View>}
      {!!error && !loading && <Pressable style={s.error} onPress={loadOutlets}><Text style={s.errorTitle}>Outlet data unavailable</Text><Text style={s.muted}>{error}</Text><Text style={s.retry}>TAP TO RETRY</Text></Pressable>}
      {!loading && !error && !visible.length && <View style={s.state}><Text style={s.name}>No outlets found</Text><Text style={s.muted}>Try a different search or beat.</Text></View>}
      {visible.map((outlet) => <View key={outlet.id} style={s.card}>
        <Pressable onPress={() => setExpandedOutlet(expandedOutlet === outlet.id ? "" : outlet.id)}>
        <View style={s.row}><Text style={s.name}>{outlet.name}</Text><Text style={outlet.active === false ? s.inactive : s.active}>{outlet.active === false ? "Inactive" : "Active"}</Text><Text style={s.arrow}>›</Text></View>
        <Text style={s.meta}>Code: {outlet.code} | Type: {outlet.type || "Not specified"}</Text>
        <View style={s.row}><Text style={s.owner}>Owner: {outlet.owner || "Not specified"}</Text><Text style={s.phone}>☎ {outlet.contact || outlet.phone || "Not specified"}</Text></View>
        <View style={s.row}><Text style={s.location}>⌾ {outlet.address || outlet.geography || "Address unavailable"}</Text><Text style={s.beat}>{outlet.beatName || "Unassigned"}</Text></View>
        <View style={s.bottom}><Text>Outstanding: <Text style={Number(outlet.outstandingAmount) > 0 ? s.red : s.green}>₹{Number(outlet.outstandingAmount || 0).toLocaleString("en-IN")}</Text></Text><Text style={s.visitCount}>Orders: {outlet.orderCount || 0} · Visits: {outlet.visitCount || 0}</Text></View>
        <Text style={s.lastVisit}>Last visit: {outlet.lastVisit ? formatVisitTime(outlet.lastVisit) : "Not visited"}</Text>
        </Pressable>
        {expandedOutlet === outlet.id && <View style={s.historyPanel}>
          <Text style={s.historyTitle}>VISIT HISTORY</Text>
          {!outlet.recentVisits?.length && <Text style={s.muted}>No Salesforce visits recorded for this outlet.</Text>}
          {outlet.recentVisits?.map((visit) => <View key={visit.id} style={s.visitRow}>
            <View style={s.visitHeader}><Text style={s.visitNumber}>{visit.visitNumber || "Visit"}</Text><Text style={s.visitStatus}>{visit.status || "Recorded"}</Text></View>
            <Text style={s.visitDetail}>Check-in: {formatVisitTime(visit.checkInTime || visit.date)}</Text>
            <Text style={s.visitDetail}>Location: {formatLocation(visit.checkInLocation)}</Text>
            {visit.checkOutTime ? <Text style={s.visitDetail}>Check-out: {formatVisitTime(visit.checkOutTime)}</Text> : null}
          </View>)}
          <Pressable style={s.openButton} onPress={() => navigation.navigate("StoreGate", { store: outlet })}><Text style={s.openButtonText}>OPEN OUTLET</Text></Pressable>
        </View>}
      </View>)}
    </ScrollView><BottomNav active="Outlets" /></View></SafeAreaView>;
}

const s = StyleSheet.create({safe:{flex:1,backgroundColor:"#E8E1D3"},shell:{flex:1,maxWidth:430,width:"100%",alignSelf:"center",backgroundColor:colors.surface},page:{flex:1},content:{padding:16,paddingBottom:22},top:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},title:{fontSize:22,fontWeight:"900",color:colors.navy},muted:{fontSize:11,color:colors.muted,marginTop:3},map:{backgroundColor:colors.blue,padding:11,borderRadius:10},mapText:{color:"white",fontWeight:"800",fontSize:12},search:{marginTop:12,backgroundColor:"#FFFDF7",borderWidth:1,borderColor:colors.border,borderRadius:14,padding:12},chips:{gap:6,paddingVertical:10},chip:{borderWidth:1,borderColor:colors.border,borderRadius:9,paddingHorizontal:11,paddingVertical:7,backgroundColor:"#FFFDF7"},chipOn:{backgroundColor:colors.brand},chipText:{fontSize:10,fontWeight:"800",color:colors.muted},chipTextOn:{color:"white"},card:{backgroundColor:"#FFFDF7",borderRadius:16,padding:14,marginBottom:11,borderLeftWidth:4,borderLeftColor:"#F6C85F",shadowColor:colors.navy,shadowOpacity:.08,shadowRadius:7,elevation:2},row:{flexDirection:"row",alignItems:"center"},name:{fontSize:15,fontWeight:"900",color:colors.ink},active:{fontSize:10,color:colors.success,backgroundColor:"#DFF3E9",paddingHorizontal:7,paddingVertical:4,borderRadius:8,marginLeft:7},inactive:{fontSize:10,color:colors.danger,backgroundColor:"#FFF0F1",paddingHorizontal:7,paddingVertical:4,borderRadius:8,marginLeft:7},arrow:{marginLeft:"auto",fontSize:22,color:"#96AAA4"},meta:{fontSize:10,color:colors.muted,marginTop:3},owner:{fontSize:11,color:colors.muted,marginTop:8,flex:1},phone:{fontSize:11,color:colors.brand,marginTop:8},location:{fontSize:10,color:colors.success,marginTop:8,flex:1},beat:{fontSize:9,color:colors.navy,backgroundColor:"#DFF3ED",padding:4,borderRadius:5,marginTop:8},bottom:{borderTopWidth:1,borderTopColor:colors.border,marginTop:10,paddingTop:9,flexDirection:"row",justifyContent:"space-between"},red:{color:colors.danger,fontWeight:"900"},green:{color:colors.success,fontWeight:"900"},visitCount:{color:colors.blue,fontSize:11,fontWeight:"900"},lastVisit:{fontSize:10,color:colors.muted,marginTop:7},historyPanel:{borderTopWidth:1,borderTopColor:colors.border,marginTop:11,paddingTop:10},historyTitle:{fontSize:10,fontWeight:"900",color:colors.navy,letterSpacing:.6},visitRow:{backgroundColor:"#F2F7F5",padding:10,borderRadius:10,marginTop:8},visitHeader:{flexDirection:"row",justifyContent:"space-between"},visitNumber:{fontSize:11,fontWeight:"900",color:colors.ink},visitStatus:{fontSize:9,fontWeight:"800",color:colors.success},visitDetail:{fontSize:10,color:colors.muted,marginTop:4},openButton:{backgroundColor:colors.blue,borderRadius:9,padding:10,alignItems:"center",marginTop:10},openButtonText:{color:"white",fontSize:10,fontWeight:"900"},state:{padding:28,alignItems:"center",gap:8},error:{backgroundColor:"#FFF0F1",borderLeftWidth:4,borderLeftColor:colors.danger,padding:15,borderRadius:12,marginBottom:12},errorTitle:{fontWeight:"900",color:colors.danger},retry:{fontSize:10,fontWeight:"900",color:colors.brand,marginTop:9}});
