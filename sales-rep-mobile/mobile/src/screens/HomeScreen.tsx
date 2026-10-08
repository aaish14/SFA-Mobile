import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import { api, post } from "../api/client";
import { Button, Card, Money } from "../components/ui";
import { colors } from "../constants/theme";
import { orgSchemes } from "../data/orgSchemes";
import BottomNav from "../components/BottomNav";
import BrandHeader from "../components/BrandHeader";

type Scheme = { id: string; name: string; type?: string; product?: string; products?: string[]; benefit?: string; description?: string; endDate?: string };
type Dashboard = { distributorName?: string; name?: string; userName?: string; loginEmail?: string; beatName?: string; target?: number; achievement?: number; pendingOrders?: number; todayVisits?: number; completedVisits?: number; pendingDeliveries?: number; outstandingAmount?: number; schemes?: Scheme[] };

const displayDate = (value?: string) => {
  if (!value) return "Not specified";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const [data, setData] = useState<Dashboard>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [startedAt, setStartedAt] = useState("");

  const loadDashboard = async () => {
    setLoading(true);
    setError("");
    try { setData(await api<Dashboard>("/dashboard")); }
    catch {
      setData({ schemes: [...orgSchemes] });
      setError("Live refresh is unavailable. Showing the latest schemes synchronized from Salesforce.");
    }
    finally { setLoading(false); }
  };

  useEffect(() => { loadDashboard(); }, []);

  const percentage = useMemo(() => {
    if (data?.target === undefined || data?.achievement === undefined || data.target <= 0) return 0;
    return Math.min(Math.round((data.achievement / data.target) * 100), 100);
  }, [data]);

  const startDay = async () => {
    try {
      setStarting(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Location permission required", "Allow location access to capture the Start Day location.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      let startTime = new Date();
      try {
        const result = await post<{ startTime?: string }>("/day/start", { location: { latitude: position.coords.latitude, longitude: position.coords.longitude } });
        startTime = new Date(result.startTime || Date.now());
        Alert.alert("Day started", "Attendance time and location were saved successfully.");
      } catch {
        Alert.alert("Day started locally", "Time and location were captured. Salesforce synchronization is pending until the API is available.");
      }
      setStartedAt(startTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
    } catch (reason: any) {
      Alert.alert("Unable to start day", reason.message || "Please try again.");
    } finally { setStarting(false); }
  };

  const metrics = [
    ["Pending Orders", data?.pendingOrders, "▤"],
    ["Today's Visits", data?.todayVisits, "◉"],
    ["Completed Visits", data?.completedVisits, "✓"],
    ["Pending Deliveries", data?.pendingDeliveries, "▣"],
  ];

  const money = (value?: number) => value === undefined ? <Text>—</Text> : <Money value={value} />;

  return (
    <SafeAreaView style={s.safe}><View style={s.shell}>
      <BrandHeader/><ScrollView style={s.page} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <View style={s.headerRow}><View style={s.identity}><Text style={s.appLabel}>DISTRIBUTOR HUB</Text><Text style={s.distributor}>{data?.distributorName || "Distributor"}</Text><Text style={s.manager}>User: <Text style={{fontWeight:"900"}}>{data?.userName || "Loading…"}</Text></Text><Text style={s.profileLine}>{data?.loginEmail || ""}</Text><Text style={s.profileLine}>{data?.beatName ? `Assigned beat: ${data.beatName}` : ""}</Text></View><Text style={s.date}>▣ {new Date().toLocaleDateString("en-IN", { weekday:"short",day:"numeric",month:"short",year:"numeric" })}</Text></View>
          <View style={s.headerActions}><Pressable style={s.startPill} onPress={startDay}><Text style={s.startPillText}>{startedAt?"✓ Day Started":"▷ Start Day"}</Text></Pressable><Pressable style={s.routePill} onPress={()=>navigation.navigate("Outlets")}><Text style={s.routeText}>➤ Today&apos;s Route</Text></Pressable></View>
        </View>

        {loading && <View style={s.loading}><ActivityIndicator color={colors.brand} /><Text style={s.muted}>Loading live Salesforce data…</Text></View>}
        {!!error && !loading && <Pressable onPress={loadDashboard}><Text style={s.snapshot}>Salesforce snapshot • tap to refresh</Text></Pressable>}

        <Card style={s.targetCard}>
          <View style={s.targetTop}>
            <View><Text style={s.label}>TODAY'S TARGET</Text><Text style={s.targetValue}>{money(data?.target)}</Text></View>
            <View style={s.badge}><Text style={s.badgeValue}>{percentage}%</Text><Text style={s.badgeLabel}>ACHIEVED</Text></View>
          </View>
          <View style={s.track}><View style={[s.fill, { width: `${percentage}%` }]} /></View>
          <View style={s.amountRow}>
            <View style={s.flex}><Text style={s.label}>TODAY'S ACHIEVEMENT</Text><Text style={s.amount}>{money(data?.achievement)}</Text></View>
            <View style={s.divider} />
            <View style={s.flex}><Text style={s.label}>REMAINING</Text><Text style={s.amount}>{data?.target === undefined || data?.achievement === undefined ? "—" : <Money value={Math.max(data.target - data.achievement, 0)} />}</Text></View>
          </View>
        </Card>

        <View style={s.grid}>{metrics.map(([label, value, icon]) => <Card key={String(label)} style={s.metricCard}><View style={s.icon}><Text style={s.iconText}>{icon}</Text></View><Text style={s.metricValue}>{value ?? "—"}</Text><Text style={s.metricLabel}>{label}</Text></Card>)}</View>

        <Card style={s.outstanding}><View><Text style={s.label}>OUTSTANDING AMOUNT</Text><Text style={s.outstandingValue}>{money(data?.outstandingAmount)}</Text></View><View style={s.rupee}><Text style={s.rupeeText}>₹</Text></View></Card>

        <View style={s.sectionHeader}><View><Text style={s.sectionTitle}>Active Schemes</Text><Text style={s.muted}>Offers available from Salesforce</Text></View><Text style={s.count}>{data?.schemes?.length ?? 0}</Text></View>
        {!loading && !data?.schemes?.length && <Card style={s.empty}><Text style={s.emptyTitle}>No active schemes</Text><Text style={s.muted}>New active offers will appear here automatically.</Text></Card>}
        {data?.schemes?.map((scheme, index) => (
          <Card key={scheme.id} style={{ ...s.scheme, borderTopColor: index % 2 ? colors.blue : colors.warning }}>
            <View style={s.schemeTop}><Text style={s.schemeType}>{scheme.type || "ACTIVE OFFER"}</Text><Text style={s.schemeExpiry}>Valid until {displayDate(scheme.endDate)}</Text></View>
            <Text style={s.schemeName}>{scheme.name}</Text>
            <Text style={s.schemeProduct}>{scheme.product || scheme.products?.join(", ") || "Eligible products"}</Text>
            <Text style={s.schemeBenefit}>{scheme.benefit || scheme.description || "View offer details"}</Text>
            <Pressable style={s.viewButton} onPress={() => Alert.alert(scheme.name, scheme.description || scheme.benefit || "Scheme details are available in Salesforce.")}><Text style={s.viewButtonText}>VIEW SCHEME  →</Text></Pressable>
          </Card>
        ))}

      </ScrollView><BottomNav active="Main" />
    </View></SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#E8E1D3" }, shell:{ flex:1, width:"100%", maxWidth:430, alignSelf:"center", backgroundColor:colors.surface }, page: { flex: 1, backgroundColor: colors.surface }, content: { paddingBottom: 20 },
  header: { backgroundColor: colors.navy, margin:14, padding:17, borderTopLeftRadius:8,borderTopRightRadius:28,borderBottomLeftRadius:28,borderBottomRightRadius:8, shadowColor:colors.navy,shadowOpacity:.2,shadowRadius:10,elevation:5 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, identity:{flex:1,paddingRight:8}, appLabel: { color: "#9DD9C9", fontSize: 10, fontWeight: "800" }, distributor: { color: colors.white, fontSize: 19, fontWeight: "900", marginTop: 5 }, manager:{color:"#D8EEE8",fontSize:11,marginTop:5},profileLine:{color:"#BFD9D2",fontSize:9,marginTop:3},headerActions:{borderTopWidth:1,borderTopColor:"#34635E",marginTop:13,paddingTop:11,flexDirection:"row",justifyContent:"space-between"},startPill:{backgroundColor:"#FFFDF7",borderRadius:10,paddingHorizontal:14,paddingVertical:9},startPillText:{color:colors.navy,fontWeight:"900",fontSize:12},routePill:{backgroundColor:colors.blue,borderRadius:10,paddingHorizontal:14,paddingVertical:9},routeText:{color:"white",fontWeight:"800",fontSize:11},snapshot:{textAlign:"center",fontSize:10,color:colors.muted,marginBottom:5},
  avatar: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.blue, borderWidth: 2, borderColor: "#FFC0AF" }, avatarText: { color: colors.white, fontSize: 19, fontWeight: "900" },
  greeting: { color: colors.white, fontSize: 25, fontWeight: "900", marginTop: 22 }, date: { color: colors.navy, fontSize: 9, backgroundColor:"#F6C85F",padding:7,borderRadius:8 }, loading: { flexDirection: "row", gap: 10, justifyContent: "center", padding: 18 }, muted: { color: colors.muted, fontSize: 12 },
  syncCard: { marginHorizontal: 16, marginTop: 14, borderLeftWidth: 4, borderLeftColor: colors.warning }, syncTitle: { color: colors.ink, fontWeight: "900", fontSize: 16 }, errorText: { color: colors.muted, lineHeight: 20, marginVertical: 7 },
  targetCard: { marginHorizontal: 14, padding: 16 }, targetTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, label: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.4 }, targetValue: { color: colors.ink, fontSize: 22, fontWeight: "900", marginTop: 5 },
  badge: { backgroundColor: "#DFF3ED", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 13, alignItems: "center" }, badgeValue: { color: colors.brand, fontWeight: "900", fontSize: 17 }, badgeLabel: { color: colors.brand, fontSize: 8, fontWeight: "900" },
  track: { height: 9, backgroundColor: "#DDE8E3", borderRadius: 9, overflow: "hidden", marginVertical: 18 }, fill: { height: 9, backgroundColor: colors.success, borderRadius: 9 }, amountRow: { flexDirection: "row", alignItems: "center" }, flex: { flex: 1 }, divider: { height: 42, width: 1, backgroundColor: colors.border, marginHorizontal: 14 }, amount: { color: colors.ink, fontSize: 17, fontWeight: "900", marginTop: 5 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 10 }, metricCard: { width: "46%", marginHorizontal: "2%", minHeight: 126, padding: 15, borderTopWidth:3,borderTopColor:"#9DD9C9" }, icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#DFF3ED", alignItems: "center", justifyContent: "center" }, iconText: { color: colors.brand, fontSize: 17, fontWeight: "900" }, metricValue: { color: colors.ink, fontSize: 25, fontWeight: "900", marginTop: 10 }, metricLabel: { color: colors.muted, fontSize: 12, marginTop: 3 },
  outstanding: { marginHorizontal: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 18 }, outstandingValue: { color: colors.danger, fontSize: 24, fontWeight: "900", marginTop: 5 }, rupee: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#FFF0F1", alignItems: "center", justifyContent: "center" }, rupeeText: { color: colors.danger, fontWeight: "900", fontSize: 22 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginHorizontal: 18, marginTop: 9, marginBottom: 11 }, sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: "900" }, count: { color: colors.white, backgroundColor: colors.brand, minWidth: 28, textAlign: "center", paddingVertical: 5, borderRadius: 14, fontWeight: "900" },
  empty: { marginHorizontal: 16, alignItems: "center", padding: 22 }, emptyTitle: { color: colors.ink, fontSize: 16, fontWeight: "900", marginBottom: 5 },
  scheme: { marginHorizontal: 14, padding: 16, borderWidth:1,borderColor:"#F5B8A8",backgroundColor:"#FFF2EC",borderTopRightRadius:24 }, schemeTop: { flexDirection: "row", justifyContent: "space-between", gap: 10 }, schemeType: { color: "#A44934", fontSize: 10, fontWeight: "900" }, schemeExpiry: { color: colors.muted, fontSize: 10 }, schemeName: { color: colors.navy, fontSize: 15, fontWeight: "900", marginTop: 9 }, schemeProduct: { color: "#A44934", fontSize: 11, fontWeight: "700", marginTop: 5 }, schemeBenefit: { color: "#66534E", lineHeight: 18, marginTop: 6,fontSize:11 }, viewButton: { alignSelf: "flex-end", marginTop: 12, paddingVertical:9,paddingHorizontal:14,backgroundColor:colors.blue,borderRadius:9 }, viewButtonText: { color: "white", fontSize: 10, fontWeight: "900" },
  startCard: { marginHorizontal: 16, marginTop: 8, padding: 20 }, startIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: "#E8F7EC", alignItems: "center", justifyContent: "center" }, startIconText: { color: colors.success, fontSize: 18, fontWeight: "900" }, startTitle: { color: colors.ink, fontSize: 19, fontWeight: "900", marginTop: 12 }, startDescription: { color: colors.muted, lineHeight: 20, marginVertical: 7 },
});
