import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
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
type OrderView = "All Products" | "Must Sell" | "Focus Sell" | "Suggested Sell";
const refusalReasons = ["Stock already available", "Low demand", "No product demand", "Product not selling", "Season expired", "Other"];
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
  const [orderView, setOrderView] = useState<OrderView>("All Products");
  const [productSearch, setProductSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("All brands");
  const [subBrandFilter, setSubBrandFilter] = useState("All sub-brands");
  const [aliasFilter, setAliasFilter] = useState("All aliases");
  const [refusedProductIds, setRefusedProductIds] = useState<string[]>([]);
  const [selectedRefusalReason, setSelectedRefusalReason] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [completionMessage, setCompletionMessage] = useState("");
  const [completionError, setCompletionError] = useState("");
  const startVisit = () => {
    setStartError("");
    Promise.all([
      post<any>("/store/visit/start", {
        storeId: route.params.store.id,
        location: route.params.location,
        requestId: `visit-${Date.now()}`,
      }),
      api<Product[]>(`/products?outletId=${encodeURIComponent(route.params.store.id)}`),
    ])
      .then(([v, p]) => {
        setVisit(v);
        setProducts(p);
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
  const brands = useMemo(() => ["All brands", ...Array.from(new Set(products.map((product) => product.brand).filter(Boolean) as string[]))], [products]);
  const subBrands = useMemo(() => ["All sub-brands", ...Array.from(new Set(products.map((product) => product.subBrand).filter(Boolean) as string[]))], [products]);
  const aliases = useMemo(() => ["All aliases", ...Array.from(new Set(products.map((product) => product.brandAlias).filter(Boolean) as string[]))], [products]);
  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesView = orderView === "All Products" || product.configuration === orderView || product.configurations?.some((configuration) => configuration.type === orderView);
    const matchesBrand = brandFilter === "All brands" || product.brand === brandFilter;
    const matchesSubBrand = subBrandFilter === "All sub-brands" || product.subBrand === subBrandFilter;
    const matchesAlias = aliasFilter === "All aliases" || product.brandAlias === aliasFilter;
    const text = `${product.name} ${product.code} ${product.brand || ""} ${product.subBrand || ""} ${product.brandAlias || ""}`.toLowerCase();
    return matchesView && matchesBrand && matchesSubBrand && matchesAlias && text.includes(productSearch.toLowerCase());
  }), [products, orderView, brandFilter, subBrandFilter, aliasFilter, productSearch]);
  const selectedProduct = visibleProducts.find((product) => product.id === form.productId) || visibleProducts[0];
  const selectedConfiguration = selectedProduct?.configurations?.find((configuration) => configuration.type === orderView) || selectedProduct?.configurations?.find((configuration) => configuration.type === "Must Sell") || selectedProduct?.configurations?.[0];
  const selectedScheme = selectedProduct?.schemes?.find((scheme) => scheme.id === form.schemeId);
  const update = (k: string, v: string) => setForm((x) => ({ ...x, [k]: v }));
  const selectView = (view: OrderView) => {
    setOrderView(view);
    setSelectedRefusalReason("");
    setForm((current) => ({ ...current, productId: "", schemeId: "", refusalNotes: "" }));
  };
  const cycleFilter = (values: string[], current: string, setter: (value: string) => void) => {
    const index = Math.max(0, values.indexOf(current));
    setter(values[(index + 1) % values.length]);
    setSelectedRefusalReason("");
    setForm((value) => ({ ...value, productId: "", schemeId: "", refusalNotes: "" }));
  };
  const selectRefusalReason = (reason: string) => {
    const nextReason = selectedRefusalReason === reason ? "" : reason;
    setSelectedRefusalReason(nextReason);
    setForm((current) => ({ ...current, refusalNotes: nextReason }));
  };
  const saveRefusal = async (reason: string) => {
    if (!visit || !selectedProduct) return;
    try {
      await post("/product-refusals", { visitId: visit.id, productId: selectedProduct.id, reason, notes: form.refusalNotes });
      setRefusedProductIds((ids) => [...new Set([...ids, selectedProduct.id])]);
      setSelectedRefusalReason("");
      setForm((current) => ({ ...current, refusalNotes: "" }));
      Alert.alert("Refusal saved", `${selectedProduct.name}: ${reason}`);
    } catch (error: any) {
      Alert.alert("Could not save refusal", error.message || "Please try again.");
    }
  };
  const save = async () => {
    if (!visit) return;
    try {
      if (action === "order") {
        const product = selectedProduct;
        if (selectedRefusalReason) {
          await saveRefusal(selectedRefusalReason);
          return;
        }
        const quantity = Number(form.quantity || 0);
        if (!product || quantity <= 0)
          throw new Error("Select a product and enter a valid quantity.");
        const minimumQuantity = selectedConfiguration?.minimumQuantity || product.minimumQuantity || 1;
        if (quantity < minimumQuantity)
          throw new Error(`${selectedConfiguration?.name || product.configurationName || product.name} requires at least ${minimumQuantity} units.`);
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
          configurationId: selectedConfiguration?.id || product.configurationId,
          configurationType: selectedConfiguration?.type || product.configuration,
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
      if (action === "order") {
        setForm({});
      } else {
        setAction(null);
        setForm({});
      }
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
    if (isCompleting) return;
    setIsCompleting(true);
    setCompletionMessage("");
    setCompletionError("");
    try {
      const handledProductIds = new Set([...lines.map((line) => line.productId), ...refusedProductIds]);
      const pendingMustSell = products.filter((product) => (product.configuration === "Must Sell" || product.configurations?.some((configuration) => configuration.type === "Must Sell")) && !handledProductIds.has(product.id));
      if (pendingMustSell.length)
        throw new Error(`Complete or record a refusal for every Must Sell product: ${pendingMustSell.map((product) => product.name).join(", ")}`);
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
      const completion = await post<{ retailerEmailSent?: boolean; retailerEmailError?: string }>("/store/checkout", {
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
      setAction(null);
      setCompletionMessage("Visit completed and saved in Salesforce.");
      Alert.alert(
        "Visit completed successfully",
        completion.retailerEmailSent
          ? "The visit and order were saved in Salesforce, and the retailer email was sent."
          : completion.retailerEmailError
            ? `The visit and order were saved in Salesforce. Email was not sent: ${completion.retailerEmailError}`
            : "The visit and order were saved in Salesforce. You can now share the PDF or Excel file through WhatsApp or email.",
      );
    } catch (e: any) {
      setCompletionError(e.message || "Unable to complete the visit. Please try again.");
      Alert.alert("Checkout failed", e.message || "Unable to complete the visit. Please try again.");
    } finally {
      setIsCompleting(false);
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
        const documentBlob = await response.blob();
        const documentFile = new File([documentBlob], fileName, { type: documentBlob.type });
        const browserNavigator: any = navigator;
        if (browserNavigator.share && browserNavigator.canShare?.({ files: [documentFile] })) {
          await browserNavigator.share({
            title: `${route.params.store.name} visit ${kind.toUpperCase()}`,
            text: `SFA visit document for ${route.params.store.name}. Choose WhatsApp or Mail to send it.`,
            files: [documentFile],
          });
          return;
        }
        const objectUrl = URL.createObjectURL(documentBlob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(objectUrl);
        Alert.alert("Document downloaded", `${fileName} was downloaded. Attach it in WhatsApp or email.`);
      } else {
        const uri = `${FileSystem.cacheDirectory}${fileName}`;
        const result = await FileSystem.downloadAsync(url, uri, {
          headers: { Authorization: `Bearer ${token}` },
          sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
          md5: false,
        });
        if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device");
        await Sharing.shareAsync(result.uri, {
          dialogTitle: `Send ${kind.toUpperCase()} using WhatsApp or Mail`,
          mimeType: kind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      }
    } catch (error: any) {
      if (error?.name === "AbortError") return;
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
              ["11", "Survey & Merchandising", () => navigation.navigate("Survey", { store: route.params.store, visitId: visit.id, location: route.params.location })],
            ].map(([number, label, handler]) => <Text key={String(label)} style={s.actionTile} onPress={handler as () => void}><Text style={s.actionNumber}>{number as string}</Text>{"\n"}{label as string}</Text>)}
          </View>
        </>
      )}
      {action && (
        <Card>
          <Text style={s.formTitle}>{action.toUpperCase()}</Text>
          {action === "order" && (
            <>
              <Text style={s.orderHelp}>Choose a Salesforce-controlled configuration, then select products for this outlet.</Text>
              <View style={s.tabRow}>{(["All Products", "Must Sell", "Focus Sell", "Suggested Sell"] as OrderView[]).map((view) => <Pressable key={view} style={[s.tab, orderView === view && s.tabActive]} onPress={() => selectView(view)}><Text style={[s.tabText, orderView === view && s.tabTextActive]}>{view}</Text></Pressable>)}</View>
              <TextInput style={s.input} placeholder="Search product, SKU or brand" value={productSearch} onChangeText={setProductSearch}/>
              <View style={s.filterRow}>
                <Pressable style={s.filter} onPress={() => cycleFilter(brands, brandFilter, setBrandFilter)}><Text style={s.filterLabel}>BRAND</Text><Text style={s.filterValue}>{brandFilter}</Text></Pressable>
                <Pressable style={s.filter} onPress={() => cycleFilter(subBrands, subBrandFilter, setSubBrandFilter)}><Text style={s.filterLabel}>SUB-BRAND</Text><Text style={s.filterValue}>{subBrandFilter}</Text></Pressable>
                <Pressable style={s.filter} onPress={() => cycleFilter(aliases, aliasFilter, setAliasFilter)}><Text style={s.filterLabel}>ALIAS</Text><Text style={s.filterValue}>{aliasFilter}</Text></Pressable>
              </View>
              {!selectedProduct ? <Text style={s.sub}>No products match this configuration and filter.</Text> : <Card style={s.productCard}>
                <View style={s.productTop}><Text style={s.productName}>{selectedProduct.name}</Text><Text style={s.configuration}>{selectedProduct.configurations?.map((configuration) => configuration.type).join(" · ") || selectedProduct.configuration || "Standard"}</Text></View>
                <Text style={s.sub}>{selectedProduct.code} · {selectedProduct.brand || "No brand"}{selectedProduct.subBrand ? ` · ${selectedProduct.subBrand}` : ""}{selectedProduct.brandAlias ? ` · ${selectedProduct.brandAlias}` : ""}</Text>
                <Text style={s.productMeta}>Price <Money value={selectedProduct.price}/> · Stock {selectedProduct.stock} · Previously purchased {selectedProduct.previousQuantity || 0}</Text>
                {!!(selectedConfiguration || selectedProduct.configurationName) && <Text style={s.suggestion}>{selectedConfiguration?.name || selectedProduct.configurationName} · Minimum {selectedConfiguration?.minimumQuantity || selectedProduct.minimumQuantity || 1}{(selectedConfiguration?.targetQuantity || selectedProduct.targetQuantity) ? ` · Target ${selectedConfiguration?.targetQuantity || selectedProduct.targetQuantity}` : ""}{selectedConfiguration?.geography ? ` · ${selectedConfiguration.geography}` : ""}{selectedConfiguration?.channel && selectedConfiguration.channel !== "All Channels" ? ` · ${selectedConfiguration.channel}` : ""}</Text>}
                {!!selectedProduct.suggestionSource && <Text style={s.suggestion}>{selectedProduct.suggestionSource}</Text>}
                {!!selectedProduct.lastFiveOrders?.length && <View style={s.history}><Label>LAST FIVE ORDER HISTORY</Label>{selectedProduct.lastFiveOrders.map((history) => <Text key={`${history.orderId}-${history.orderDate}`} style={s.historyLine}>{history.orderNumber || "Order"} · {history.orderDate || "Date unavailable"} · Qty {history.quantity}</Text>)}</View>}
              </Card>}
              <Button
                title="NEXT PRODUCT"
                kind="secondary"
                onPress={() => {
                  if (!visibleProducts.length) return;
                  const i = visibleProducts.findIndex((p) => p.id === selectedProduct?.id);
                  update("productId", visibleProducts[(i + 1) % visibleProducts.length].id);
                  update("schemeId", "");
                   update("refusalNotes", "");
                   setSelectedRefusalReason("");
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
              {(selectedProduct?.configuration === "Must Sell" || selectedProduct?.configurations?.some((configuration) => configuration.type === "Must Sell")) && !lines.some((line) => line.productId === selectedProduct.id) && !refusedProductIds.includes(selectedProduct.id) && <>
                <Label>RETAILER DECLINED THIS MUST SELL PRODUCT</Label>
                <View style={s.reasonGrid}>{refusalReasons.map((reason) => {
                  const isSelected = selectedRefusalReason === reason;
                  return <Pressable key={reason} style={[s.reason, isSelected && s.reasonSelected]} onPress={() => selectRefusalReason(reason)} accessibilityRole="button" accessibilityState={{ selected: isSelected }}><Text style={[s.reasonText, isSelected && s.reasonTextSelected]}>{isSelected ? "✓ " : ""}{reason}</Text></Pressable>;
                })}</View>
                <TextInput style={s.input} placeholder="Optional refusal notes" value={form.refusalNotes} onChangeText={(value) => update("refusalNotes", value)}/>
              </>}
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
          <>
            <Button title={isCompleting ? "COMPLETING VISIT…" : "COMPLETE VISIT"} onPress={checkout} disabled={isCompleting} />
            {!!completionError && <Text style={s.completionError}>{completionError}</Text>}
          </>
        ) : (
          <>
            {!!completionMessage && <Text style={s.completionSuccess}>{completionMessage}</Text>}
            <Button title="SEND PDF · WHATSAPP / MAIL" onPress={() => share("pdf")} />
            <Button
              title="SEND EXCEL · WHATSAPP / MAIL"
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
  orderHelp:{color:colors.muted,marginBottom:10},
  tabRow:{flexDirection:"row",flexWrap:"wrap",gap:6,marginBottom:8},
  tab:{paddingVertical:9,paddingHorizontal:12,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:"white"},
  tabActive:{backgroundColor:colors.brand,borderColor:colors.brand},
  tabText:{fontSize:11,fontWeight:"800",color:colors.ink},
  tabTextActive:{color:"white"},
  filterRow:{flexDirection:"row",gap:6,marginVertical:6},
  filter:{flex:1,padding:9,borderRadius:10,backgroundColor:"#F4F7F5",borderWidth:1,borderColor:colors.border},
  filterLabel:{fontSize:8,fontWeight:"900",color:colors.muted},
  filterValue:{fontSize:10,fontWeight:"800",color:colors.ink,marginTop:3},
  productCard:{marginVertical:8,borderLeftWidth:4,borderLeftColor:colors.brand},
  productTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8},
  productName:{flex:1,fontSize:17,fontWeight:"900",color:colors.ink},
  configuration:{fontSize:9,fontWeight:"900",color:colors.brand,backgroundColor:"#E7F5F3",padding:6,borderRadius:10},
  productMeta:{fontSize:12,fontWeight:"700",color:colors.ink,marginTop:6},
  suggestion:{fontSize:11,color:colors.blue,fontWeight:"700",marginTop:5},
  history:{marginTop:10,paddingTop:8,borderTopWidth:1,borderTopColor:colors.border},
  historyLine:{fontSize:11,color:colors.muted,marginTop:3},
  reasonGrid:{flexDirection:"row",flexWrap:"wrap",gap:6,marginVertical:6},
  reason:{paddingVertical:9,paddingHorizontal:10,borderWidth:1,borderColor:colors.warning,borderRadius:12,backgroundColor:"#FFF8E7"},
  reasonText:{fontSize:10,fontWeight:"800",color:colors.ink},
  reasonSelected:{backgroundColor:colors.warning,borderColor:colors.warning},
  reasonTextSelected:{color:"white"},
  completionSuccess:{color:colors.brand,fontWeight:"800",textAlign:"center",marginVertical:8},
  completionError:{color:colors.danger,fontWeight:"800",textAlign:"center",marginVertical:8},
});
