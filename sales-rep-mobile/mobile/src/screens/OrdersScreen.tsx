import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../api/client";
import BrandHeader from "../components/BrandHeader";
import BottomNav from "../components/BottomNav";
import { colors } from "../constants/theme";
import InvoiceList from "../components/InvoiceList";
import { downloadInvoice } from "../utils/invoiceDownload";
import { employeeId } from "../storage/primaryQueue";

type OrderItemSummary = {
  id: string;
  productName?: string;
  quantity: number;
  amount: number;
  schemeName?: string;
};
type OrderSummary = {
  id: string;
  orderNumber: string;
  outletName?: string;
  date?: string;
  status?: string;
  amount?: number;
  grossAmount?: number;
  taxAmount?: number;
  totalQuantity?: number;
  sku?: string;
  schemeApplied?: boolean;
  schemeDetails?: string;
  productName?: string;
  visitName?: string;
  items?: OrderItemSummary[];
};

/**
 * Display employee order records and their available order/invoice details.
 */
export default function OrdersScreen() {
  const [filter, setFilter] = useState("ALL");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invoiceOwner, setInvoiceOwner] = useState("");
  /**
   * Refresh the employee order list and expose any read failure in the screen state.
   */
  const load = () => {
    void employeeId().then(setInvoiceOwner).catch(() => setInvoiceOwner(""));
    setLoading(true);
    setError("");
    api<OrderSummary[]>("/orders")
      .then(setOrders)
      .catch((reason) => setError(reason.message || "Unable to load orders"))
      .finally(() => setLoading(false));
  };
  useFocusEffect(useCallback(load, []));
  const visibleOrders = orders.filter(
    (order) =>
      filter === "ALL" ||
      (filter === "COMPLETED"
        ? order.status === "Fulfilled"
        : ["Draft", "Submitted"].includes(order.status || "")),
  );
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.shell}>
        <BrandHeader />
        <ScrollView contentContainerStyle={s.body}>
          <Text style={s.title}>MY ORDERS</Text>
          <Text style={s.sub}>Orders synchronized with Salesforce</Text>
          <Pressable accessibilityRole="button" onPress={load}>
            <Text style={s.retry}>REFRESH SALESFORCE ORDERS</Text>
          </Pressable>
          <View style={s.tabs}>
            {["ALL", "PENDING", "COMPLETED"].map((value) => (
              <Pressable
                key={value}
                onPress={() => setFilter(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === value }}
              >
                <Text style={filter === value ? s.tabOn : s.tab}>{value}</Text>
              </Pressable>
            ))}
          </View>
          {loading && <ActivityIndicator color={colors.brand} />}{" "}
          {!!error && (
            <Pressable style={s.error} onPress={load}>
              <Text style={s.errorTitle}>Order data unavailable</Text>
              <Text style={s.sub}>{error}</Text>
              <Text style={s.retry}>TAP TO RETRY</Text>
            </Pressable>
          )}
          {!loading && !error && !visibleOrders.length && (
            <View style={s.empty}>
              <Text style={s.id}>No orders found</Text>
              <Text style={s.sub}>Orders created for your Employee account will appear here.</Text>
            </View>
          )}
          {!!invoiceOwner && <InvoiceList owner={invoiceOwner} channel="secondary" load={api} download={downloadInvoice} />}
          {visibleOrders.map((order) => (
            <View key={order.id} style={s.card}>
              <View style={s.row}>
                <Text style={s.id}>{order.orderNumber}</Text>
                <Text style={s.status}>{order.status || "Draft"}</Text>
              </View>
              <Text style={s.outlet}>{order.outletName || "Outlet unavailable"}</Text>
              <Text style={s.meta}>
                Order date: {order.date || "Unavailable"} · Quantity: {order.totalQuantity || 0}
              </Text>
              <Text style={s.meta}>Visit: {order.visitName || "—"}</Text>
              {order.items?.map((item) => (
                <View key={item.id} style={s.item}>
                  <Text style={s.itemProduct}>
                    {item.productName || "Product"} · Qty {item.quantity}
                  </Text>
                  <Text style={s.meta}>Applied scheme: {item.schemeName || "No scheme"}</Text>
                  <Text style={s.meta}>
                    Line amount: ₹{Number(item.amount || 0).toLocaleString("en-IN")}
                  </Text>
                </View>
              ))}
              {!order.items?.length && (
                <Text style={s.meta}>
                  Product: {order.productName || "See order items"} · Scheme:{" "}
                  {order.schemeDetails || "No scheme"}
                </Text>
              )}
              <View style={s.amounts}>
                <Text style={s.meta}>
                  Gross ₹{Number(order.grossAmount || 0).toLocaleString("en-IN")}
                </Text>
                <Text style={s.meta}>
                  Tax ₹{Number(order.taxAmount || 0).toLocaleString("en-IN")}
                </Text>
                <Text style={s.amount}>
                  Total ₹{Number(order.amount || 0).toLocaleString("en-IN")}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
        <BottomNav active="Orders" />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#E8E1D3" },
  shell: {
    flex: 1,
    maxWidth: 430,
    width: "100%",
    alignSelf: "center",
    backgroundColor: colors.surface,
  },
  body: { padding: 16 },
  title: { fontSize: 22, fontWeight: "900", color: colors.navy },
  sub: { fontSize: 11, color: colors.muted, marginTop: 3 },
  tabs: {
    flexDirection: "row",
    marginVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: { padding: 10, color: colors.muted, fontSize: 10, fontWeight: "800" },
  tabOn: {
    padding: 10,
    color: colors.blue,
    fontSize: 10,
    fontWeight: "900",
    borderBottomWidth: 3,
    borderBottomColor: colors.blue,
  },
  card: {
    backgroundColor: "#FFFDF7",
    borderRadius: 16,
    padding: 15,
    marginBottom: 11,
    borderLeftWidth: 4,
    borderLeftColor: "#9DD9C9",
    shadowColor: colors.navy,
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 2,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  id: { fontWeight: "900", color: colors.ink },
  status: {
    fontSize: 10,
    color: colors.success,
    backgroundColor: "#DFF3E9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  outlet: { fontSize: 15, fontWeight: "900", color: colors.ink, marginVertical: 10 },
  meta: { fontSize: 11, color: colors.muted, marginTop: 4 },
  item: { backgroundColor: "#F1F8F6", borderRadius: 10, padding: 10, marginTop: 8 },
  itemProduct: { fontSize: 12, fontWeight: "900", color: colors.ink },
  amounts: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 10,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amount: { fontSize: 13, fontWeight: "900", color: colors.success },
  error: {
    backgroundColor: "#FFF0F1",
    padding: 15,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
  },
  errorTitle: { color: colors.danger, fontWeight: "900" },
  retry: { color: colors.brand, fontWeight: "900", fontSize: 10, marginTop: 8 },
  empty: { padding: 24, alignItems: "center" },
});
