import React from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import BottomNav from "../components/BottomNav";
import { Card } from "../components/ui";
import { colors } from "../constants/theme";

const modules = [
  ["Sales Orders", "Orders", "▤"], ["Asset Surveys", "asset-surveys", "▣"],
  ["Competitor Activities", "competitor-activities", "◉"], ["Tickets", "tickets", "!"],
  ["Stock Checks", "stock-checks", "▦"], ["Returns", "returns", "↩"],
] as const;

export default function MoreScreen(){
  const navigation=useNavigation<any>();
  return <SafeAreaView style={s.safe}><View style={s.shell}><View style={s.header}><Text style={s.kicker}>SFA MOBILE</Text><Text style={s.title}>Salesforce Modules</Text><Text style={s.copy}>Live records belonging to your allocated outlets</Text></View><ScrollView style={s.body}>{modules.map(([title,moduleName,icon])=><Pressable key={title} onPress={()=>moduleName==="Orders"?navigation.navigate("Orders"):navigation.navigate("ModuleList",{moduleName,title})}><Card style={s.row}><Text style={s.icon}>{icon}</Text><Text style={s.name}>{title}</Text><Text style={s.arrow}>›</Text></Card></Pressable>)}</ScrollView><BottomNav active="More" /></View></SafeAreaView>
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:"#E8E1D3"},shell:{flex:1,width:"100%",maxWidth:480,alignSelf:"center",backgroundColor:colors.surface},header:{backgroundColor:colors.navy,padding:20,paddingBottom:24,borderBottomRightRadius:28},kicker:{color:"#9DD9C9",fontWeight:"900",fontSize:11,letterSpacing:1.4},title:{color:"white",fontSize:25,fontWeight:"900",marginTop:5},copy:{color:"#D8EEE8",fontSize:11,marginTop:5},body:{flex:1,padding:14},row:{flexDirection:"row",alignItems:"center",padding:16,marginBottom:9,borderLeftWidth:4,borderLeftColor:"#F6C85F"},icon:{width:32,color:colors.blue,fontSize:19,fontWeight:"900"},name:{flex:1,color:colors.ink,fontWeight:"800"},arrow:{color:colors.muted,fontSize:24}});
