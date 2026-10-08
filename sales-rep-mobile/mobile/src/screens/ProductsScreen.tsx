import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api/client";
import BottomNav from "../components/BottomNav";
import { Card, Money } from "../components/ui";
import { colors } from "../constants/theme";
import type { Product } from "../types";

export default function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = () => {
    setLoading(true); setError("");
    api<Product[]>("/products").then(setProducts).catch((reason) => setError(reason.message || "Unable to load products")).finally(() => setLoading(false));
  };
  useEffect(load, []);
  const visible = useMemo(() => products.filter(p => `${p.name} ${p.code}`.toLowerCase().includes(search.toLowerCase())), [products, search]);
  return <SafeAreaView style={s.safe}><View style={s.shell}>
    <View style={s.header}><Text style={s.kicker}>SFA MOBILE</Text><Text style={s.title}>Product Catalog</Text><Text style={s.sub}>Live products available from Salesforce</Text></View>
    <TextInput style={s.search} placeholder="Search product or SKU" value={search} onChangeText={setSearch} />
    <ScrollView contentContainerStyle={s.content}>{loading && <ActivityIndicator color={colors.brand}/>} {!!error && <Pressable onPress={load}><Card style={s.error}><Text style={s.errorTitle}>Product data unavailable</Text><Text style={s.code}>{error}</Text><Text style={s.retry}>TAP TO RETRY</Text></Card></Pressable>}{!loading && !error && (visible.length ? visible.map(p => <Card key={p.id} style={s.card}><View style={s.productIcon}><Text style={s.productIconText}>▦</Text></View><View style={s.details}><Text style={s.name}>{p.name}</Text><Text style={s.code}>{p.code} {p.brand ? `• ${p.brand}` : ""}</Text><Text style={s.code}>{p.packSize || "Pack not specified"} • GST {p.gstPercent || 0}%</Text><View style={s.row}><Text style={s.price}><Money value={p.price} /></Text><Text style={s.stock}>{p.stock} in stock</Text></View></View></Card>) : <Card style={s.empty}><Text style={s.name}>No products found</Text><Text style={s.code}>Products synchronized from Salesforce will appear here.</Text></Card>)}</ScrollView>
    <BottomNav active="Products" />
  </View></SafeAreaView>;
}
const s = StyleSheet.create({ safe:{flex:1,backgroundColor:"#E8E1D3"},shell:{flex:1,width:"100%",maxWidth:480,alignSelf:"center",backgroundColor:colors.surface},header:{backgroundColor:colors.navy,padding:20,paddingBottom:24,borderBottomRightRadius:28},kicker:{color:"#9DD9C9",fontWeight:"900",fontSize:11,letterSpacing:1.4},title:{color:"white",fontSize:25,fontWeight:"900",marginTop:5},sub:{color:"#D8EEE8",fontSize:12,marginTop:4},search:{backgroundColor:"#FFFDF7",borderWidth:1,borderColor:colors.border,borderRadius:14,padding:13,margin:14},content:{paddingHorizontal:14,paddingBottom:18},card:{flexDirection:"row",alignItems:"center",padding:14,borderLeftWidth:4,borderLeftColor:"#F6C85F"},productIcon:{width:48,height:48,borderRadius:24,backgroundColor:"#DFF3ED",alignItems:"center",justifyContent:"center"},productIconText:{color:colors.brand,fontSize:22},details:{flex:1,marginLeft:12},name:{fontSize:16,fontWeight:"900",color:colors.ink},code:{fontSize:11,color:colors.muted,marginTop:3},row:{flexDirection:"row",justifyContent:"space-between",marginTop:9},price:{color:colors.blue,fontWeight:"900"},stock:{color:colors.success,fontSize:11,fontWeight:"700"},empty:{alignItems:"center",padding:24},error:{padding:16,borderLeftWidth:4,borderLeftColor:colors.danger},errorTitle:{color:colors.danger,fontWeight:"900"},retry:{color:colors.brand,fontWeight:"900",fontSize:10,marginTop:8} });
