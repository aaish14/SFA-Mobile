import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, post } from "../api/client";
import { Button, Card, Label, Money } from "../components/ui";
import { colors } from "../constants/theme";
import { enqueue } from "../storage/syncQueue";
import type { OrderLine, Product, RootStack } from "../types";
type Action = "order" | "return" | "competitor" | "ticket" | "stock" | "asset" | "revisit" | null;
export default function VisitScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStack, "Visit">) {
  const [visit, setVisit] = useState<any>(),
    [products, setProducts] = useState<Product[]>([]),
    [action, setAction] = useState<Action>(null),
    [form, setForm] = useState<Record<string, string>>({}),
    [lines, setLines] = useState<OrderLine[]>([]),
    [returns, setReturns] = useState<any[]>([]),
    [competitors, setCompetitors] = useState<any[]>([]),
    [tickets, setTickets] = useState<any[]>([]),
    [startError, setStartError] = useState(""),
    [completed, setCompleted] = useState(false);
  const startVisit = () => {
    setStartError("");
    Promise.all([
      post<any>("/store/visit/start", {
        storeId: route.params.store.id,
        location: route.params.location,
        requestId: `visit-${Date.now()}`,
      }),
      api<Product[]>("/products"),
    ])
      .then(([v, p]) => {
        setVisit(v);
        setProducts(p);
        setAction("order");
      })
      .catch((e) => {
        setStartError(e.message || "Visit could not start.");
        Alert.alert("Visit could not start", e.message);
      });
  };
  useEffect(() => {
    startVisit();
  }, []);
  const total = useMemo(() => lines.reduce((s, l) => s + l.amount, 0), [lines]);
  const selectedProduct = products.find((product) => product.id === (form.productId || products[0]?.id));
  const selectedScheme = selectedProduct?.schemes?.find((scheme) => scheme.id === form.schemeId);
  const update = (k: string, v: string) => setForm((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!visit) return;
    try {
      if (action === "order") {
        const product = products.find(
          (p) => p.id === (form.productId || products[0]?.id),
        );
        const quantity = Number(form.quantity || 0);
        if (!product || quantity <= 0)
          throw new Error("Select a product and enter a valid quantity.");
        if (selectedScheme && quantity < selectedScheme.minimumQuantity)
          throw new Error(`${selectedScheme.name} requires at least ${selectedScheme.minimumQuantity} units.`);
        const automaticDiscount = selectedScheme
          ? quantity * product.price * selectedScheme.discountPercent / 100
          : 0;
        const discount = automaticDiscount + Number(form.discount || 0);
        const line = {
          productId: product.id,
          productName: product.name,
          quantity,
          unitPrice: product.price,
          discount,
          amount: quantity * product.price - discount,
          schemeId: selectedScheme?.id,
          schemeName: selectedScheme?.name,
        };
        const next = [...lines, line];
        setLines(next);
      } else {
        const payload = {
          visitId: visit.id,
          ...form,
          ...(action === "return" && !form.productId
            ? { productId: products[0]?.id }
            : {}),
          requestId: `${action}-${Date.now()}`,
        };
        const path =
          action === "return"
            ? "/returns"
            : action === "stock"
              ? "/stock-checks"
              : action === "asset"
                ? "/asset-surveys"
            : action === "competitor"
              ? "/competitor-activities"
              : action === "ticket"
                ? "/tickets"
                : "/store/revisit";
        await post(path, payload);
        if (action === "return") setReturns((x) => [...x, payload]);
        if (action === "competitor") setCompetitors((x) => [...x, payload]);
        if (action === "ticket") setTickets((x) => [...x, payload]);
      }
      setAction(null);
      setForm({});
      Alert.alert("Saved", "The visit action was saved.");
    } catch (e: any) {
      await enqueue(
        action === "order"
          ? "/orders"
          : action === "return"
            ? "/returns"
            : action === "stock"
              ? "/stock-checks"
              : action === "asset"
                ? "/asset-surveys"
            : action === "competitor"
              ? "/competitor-activities"
              : action === "ticket"
                ? "/tickets"
                : "/store/revisit",
        { visitId: visit?.id, ...form },
      );
      Alert.alert(
        "Saved offline",
        `${e.message} The action is pending synchronization.`,
      );
      setAction(null);
    }
  };
  const checkout = async () => {
    try {
      if (lines.length) {
        await post("/orders", {
          visitId: visit.id,
          items: lines,
          requestId: `order-final-${visit.id}`,
        });
      }
      const loc = Platform.OS === "web"
        ? { coords: { latitude: route.params.location.latitude, longitude: route.params.location.longitude } }
        : await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await post("/store/checkout", {
        visitId: visit.id,
        location: {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        },
        remarks: form.remarks,
        retailerEmail: route.params.store.email,
        outletName: route.params.store.name,
        items: lines,
        totalAmount: total,
      });
      setCompleted(true);
      Alert.alert(
        "Visit completed successfully",
        route.params.store.email
          ? "Checkout was saved in Salesforce and the retailer order email was sent."
          : "Checkout was saved in Salesforce. Add an email to the outlet record to send order confirmation.",
      );
    } catch (e: any) {
      Alert.alert("Checkout failed", e.message);
    }
  };
  const share = async (kind: "pdf" | "excel") => {
    const token = await import(
      "@react-native-async-storage/async-storage"
    ).then((m) => m.default.getItem("token"));
    const apiBase = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api";
    const url = `${apiBase}/documents/${kind}/${visit.id}`;
    const extension = kind === "pdf" ? "pdf" : "xlsx";
    const fileName = `${route.params.store.code}-visit-${Date.now()}.${extension}`;
    try {
      if (Platform.OS === "web") {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || "Document generation failed");
        const objectUrl = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(objectUrl);
      } else {
        const uri = `${FileSystem.cacheDirectory}${fileName}`;
        const result = await FileSystem.downloadAsync(url, uri, {
          headers: { Authorization: `Bearer ${token}` },
          sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
          md5: false,
        });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri);
      }
    } catch (error: any) {
      Alert.alert("Document unavailable", error.message);
    }
  };
  if (!visit)
    return (
      <View style={s.center}>
        <Text>{startError || "Starting secure visit…"}</Text>
        {!!startError && <Button title="TRY AGAIN" onPress={startVisit} />}
      </View>
    );
  return (
    <ScrollView style={s.root} contentContainerStyle={{ padding: 16 }}>
      <Card>
        <Label>In outlet · {route.params.distance} m verified</Label>
        <Text style={s.store}>{route.params.store.name}</Text>
        <Text style={s.sub}>
          {route.params.store.code} · {new Date().toLocaleString("en-IN")}
        </Text>
      </Card>
      {!completed && (
        <>
          <Text style={s.heading}>In-visit actions</Text>
          <View style={s.grid}>
            {[
              ["1", "Take Order", () => setAction("order")],
              ["2", "Return", () => setAction("return")],
              ["3", "Competitor", () => setAction("competitor")],
              ["4", "Stock Check", () => setAction("stock")],
              ["5", "Tickets", () => setAction("ticket")],
              ["6", "Schemes", () => navigation.navigate("Main")],
              ["7", "Navigate", () => Alert.alert("Navigation", route.params.store.address)],
              ["8", "Share Order", () => lines.length ? share("pdf") : Alert.alert("No order", "Create an order before sharing it.")],
              ["9", "Checkout", checkout],
              ["10", "Asset Survey", () => setAction("asset")],
            ].map(([number, label, handler]) => <Text key={String(label)} style={s.actionTile} onPress={handler as () => void}><Text style={s.actionNumber}>{number as string}</Text>{"\n"}{label as string}</Text>)}
          </View>
        </>
      )}
      {action && (
        <Card>
          <Text style={s.formTitle}>{action.toUpperCase()}</Text>
          {action === "order" && (
            <>
              <Text style={s.sub}>
                Product:{" "}
                {
                  products.find(
                    (p) => p.id === (form.productId || products[0]?.id),
                  )?.name
                }
              </Text>
              <Button
                title="NEXT PRODUCT"
                kind="secondary"
                onPress={() => {
                  const i = products.findIndex(
                    (p) => p.id === (form.productId || products[0]?.id),
                  );
                  update("productId", products[(i + 1) % products.length].id);
                  update("schemeId", "");
                }}
              />
              <Label>AVAILABLE SCHEMES FOR THIS PRODUCT</Label>
              {!selectedProduct?.schemes?.length ? (
                <Text style={s.sub}>No active scheme is applicable to this product.</Text>
              ) : (
                selectedProduct.schemes.map((scheme) => (
                  <Text
                    key={scheme.id}
                    style={[s.schemeCard, form.schemeId === scheme.id && s.schemeSelected]}
                    onPress={() => update("schemeId", form.schemeId === scheme.id ? "" : scheme.id)}
                  >
                    {form.schemeId === scheme.id ? "✓ " : ""}{scheme.name}{"\n"}
                    <Text style={s.schemeDetail}>
                      {scheme.type || "Scheme"} · Min {scheme.minimumQuantity}
                      {scheme.discountPercent ? ` · ${scheme.discountPercent}% discount` : ""}
                      {scheme.freeQuantity ? ` · ${scheme.freeQuantity} free` : ""}
                    </Text>
                  </Text>
                ))
              )}
              <TextInput
                style={s.input}
                keyboardType="numeric"
                placeholder="Quantity"
                value={form.quantity}
                onChangeText={(v) => update("quantity", v)}
              />
              <TextInput
                style={s.input}
                keyboardType="numeric"
                placeholder="Discount ₹"
                value={form.discount}
                onChangeText={(v) => update("discount", v)}
              />
            </>
          )}
          {action === "return" && (
            <>
              <Text style={s.sub}>
                Product:{" "}
                {
                  products.find(
                    (p) => p.id === (form.productId || products[0]?.id),
                  )?.name
                }
              </Text>
              <Button
                title="NEXT PRODUCT"
                kind="secondary"
                onPress={() => {
                  const index = products.findIndex(
                    (p) => p.id === (form.productId || products[0]?.id),
                  );
                  update(
                    "productId",
                    products[(index + 1) % products.length].id,
                  );
                }}
              />
              <TextInput
                style={s.input}
                keyboardType="numeric"
                placeholder="Return quantity"
                onChangeText={(v) => update("quantity", v)}
              />
              <TextInput
                style={s.input}
                placeholder="Reason: Damaged / Expired / Wrong Product / Other"
                onChangeText={(v) => update("reason", v)}
              />
              <TextInput
                style={s.input}
                placeholder="Manufacturing date (YYYY-MM-DD)"
                onChangeText={(v) => update("manufacturingDate", v)}
              />
            </>
          )}
          {action === "stock" && (
            <>
              <Text style={s.sub}>Product: {products.find((p) => p.id === (form.productId || products[0]?.id))?.name}</Text>
              <Button title="NEXT PRODUCT" kind="secondary" onPress={() => { const index=products.findIndex((p)=>p.id===(form.productId||products[0]?.id)); update("productId",products[(index+1)%products.length].id); }}/>
              <TextInput style={s.input} keyboardType="numeric" placeholder="Shelf quantity" onChangeText={(v)=>update("quantity",v)}/>
              <TextInput style={s.input} placeholder="Manufacturing date (YYYY-MM-DD)" onChangeText={(v)=>update("manufacturingDate",v)}/>
            </>
          )}
          {action === "asset" && (
            <>
              <TextInput style={s.input} placeholder="Asset code" onChangeText={(v)=>update("assetCode",v)}/>
              <TextInput style={s.input} placeholder="Asset name" onChangeText={(v)=>update("assetName",v)}/>
              <TextInput style={s.input} placeholder="Status: Available / Damaged / Missing" onChangeText={(v)=>update("status",v)}/>
              <TextInput style={s.input} placeholder="Given date (YYYY-MM-DD)" onChangeText={(v)=>update("givenDate",v)}/>
              <TextInput style={s.input} placeholder="Picture URL" onChangeText={(v)=>update("pictureUrl",v)}/>
            </>
          )}
          {action === "competitor" && (
            <>
              <TextInput
                style={s.input}
                placeholder="Competitor name"
                onChangeText={(v) => update("competitorName", v)}
              />
              <TextInput
                style={s.input}
                placeholder="Company"
                onChangeText={(v) => update("company", v)}
              />
              <TextInput
                style={s.input}
                keyboardType="numeric"
                placeholder="MRP ₹"
                onChangeText={(v) => update("mrp", v)}
              />
              <TextInput
                style={s.input}
                keyboardType="numeric"
                placeholder="Retail buying price ₹"
                onChangeText={(v) => update("rbp", v)}
              />
              <TextInput
                style={s.input}
                placeholder="Promotion / Scheme"
                onChangeText={(v) => update("promotion", v)}
              />
              <TextInput
                style={s.input}
                placeholder="Remarks"
                onChangeText={(v) => update("remarks", v)}
              />
            </>
          )}
          {action === "ticket" && (
            <>
              <TextInput
                style={s.input}
                placeholder="Ticket subject"
                onChangeText={(v) => update("subject", v)}
              />
              <TextInput
                style={s.input}
                multiline
                placeholder="Description and remarks"
                onChangeText={(v) => update("description", v)}
              />
            </>
          )}
          {action === "revisit" && (
            <>
              <TextInput
                style={s.input}
                placeholder="Follow-up type"
                onChangeText={(v) => update("type", v)}
              />
              <TextInput
                style={s.input}
                placeholder="Remarks"
                onChangeText={(v) => update("remarks", v)}
              />
              <TextInput
                style={s.input}
                placeholder="Next follow-up date/time"
                onChangeText={(v) => update("followUp", v)}
              />
            </>
          )}
          <Button title="SAVE ACTION" onPress={save} />
          <Button
            title="CANCEL"
            kind="secondary"
            onPress={() => setAction(null)}
          />
        </Card>
      )}
      <Card>
        <Label>Visit summary</Label>
        <Text>Order lines: {lines.length}</Text>
        <Text>Returns: {returns.length}</Text>
        <Text>Competitor activities: {competitors.length}</Text>
        <Text>Tickets: {tickets.length}</Text>
        <Text style={s.total}>
          Order total: <Money value={total} />
        </Text>
        {!completed ? (
          <Button title="COMPLETE VISIT" onPress={checkout} />
        ) : (
          <>
            <Button title="SHARE PDF" onPress={() => share("pdf")} />
            <Button
              title="SHARE EXCEL"
              kind="secondary"
              onPress={() => share("excel")}
            />
            <Button
              title="EXIT OUTLET"
              kind="secondary"
              onPress={() => navigation.navigate("Main")}
            />
          </>
        )}
      </Card>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  store: { fontSize: 23, fontWeight: "900", color: colors.ink, marginTop: 6 },
  sub: { color: colors.muted, marginVertical: 5 },
  heading: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.ink,
    marginBottom: 8,
  },
  grid: { marginBottom: 12, flexDirection:"row", flexWrap:"wrap", justifyContent:"space-between" },
  actionTile:{ width:"31%", minHeight:82, marginBottom:10, paddingVertical:14, paddingHorizontal:5, backgroundColor:"white", borderWidth:1, borderColor:colors.border, borderRadius:14, textAlign:"center", color:colors.ink, fontSize:11, fontWeight:"800", overflow:"hidden" },
  actionNumber:{ color:colors.brand, fontSize:18, fontWeight:"900" },
  formTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.brand,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginVertical: 5,
    backgroundColor: "white",
  },
  total: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.brand,
    marginVertical: 10,
  },
  schemeCard: { borderWidth:1, borderColor:colors.border, borderRadius:12, padding:12, marginVertical:5, color:colors.ink, fontWeight:"800", backgroundColor:"white" },
  schemeSelected: { borderColor:colors.brand, backgroundColor:"#E7F5F3" },
  schemeDetail: { color:colors.muted, fontWeight:"500", fontSize:12 },
});
