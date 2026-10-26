import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Linking,
} from "react-native";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, post, postRecoverable } from "../api/client";
import { Button, Card, Label, Money } from "../components/ui";
import VisitField from "../components/VisitField";
import ProductIdentityFields from "../components/ProductIdentityFields";
import { nextProduct } from "../utils/productSelection";
import { colors } from "../constants/theme";
import { clearVisitDraft, readVisitDraft, writeVisitDraft } from "../storage/visitDraft";
import type { OrderLine, Product, RootStack } from "../types";
type Action = "order" | "return" | "competitor" | "ticket" | "stock" | "asset" | "revisit" | null;
type OrderView = "All Products" | "Must Sell" | "Focus Sell" | "Suggested Sell";
const refusalReasons = [
  "Stock already available",
  "Low demand",
  "No product demand",
  "Product not selling",
  "Season expired",
  "Other",
];
/**
 * Coordinate outlet visit actions, product selection, recoverable order drafts, checkout and
 * visit-document sharing.
 */
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
  const [showProductFilters, setShowProductFilters] = useState(false);
  const [refusedProductIds, setRefusedProductIds] = useState<string[]>([]);
  const [selectedRefusalReason, setSelectedRefusalReason] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [completionMessage, setCompletionMessage] = useState("");
  const [completionError, setCompletionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [showSchemes, setShowSchemes] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startRequestId = useRef(`visit-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const actionRequestId = useRef("");
  /**
   * Start or recover the outlet visit using a stable request ID, load products and restore a
   * dirty local order draft only when no order has been submitted.
   */
  const startVisit = () => {
    setStartError("");
    Promise.all([
      post<any>("/store/visit/start", {
        storeId: route.params.store.id,
        location: route.params.location,
        requestId: startRequestId.current,
      }),
      api<Product[]>(`/products?outletId=${encodeURIComponent(route.params.store.id)}`),
    ])
      .then(async ([v, p]) => {
        setVisit(v);
        setProducts(p);
        const draft = await readVisitDraft(route.params.store.id);
        setLines(!v.orderSubmitted && draft?.dirty ? draft.items : v.orderLines || []);
        setReturns(v.returns || []);
        setCompetitors(v.competitors || []);
        setTickets(v.tickets || []);
        setRefusedProductIds(v.refusedProductIds || []);
        setCompleted(v.status === "Completed");
        if (draft?.dirty && !v.orderSubmitted)
          setSaveMessage(
            "Recovered an order draft from this device. Tap Save draft to Salesforce when connected.",
          );
      })
      .catch((e) => {
        setStartError(e.message || "Visit could not start.");
        Alert.alert("Visit could not start", e.message);
      });
  };
  useEffect(() => {
    startVisit();
  }, []);
  /**
   * Sum the current local order-line amounts for the visit summary.
   */
  const total = useMemo(() => lines.reduce((s, l) => s + l.amount, 0), [lines]);
  /**
   * Derive unique nonempty brand filter choices from the loaded product catalogue.
   */
  const brands = useMemo(
    () => [
      "All brands",
      ...Array.from(new Set(products.map((product) => product.brand).filter(Boolean) as string[])),
    ],
    [products],
  );
  /**
   * Derive unique nonempty sub-brand filter choices from the loaded product catalogue.
   */
  const subBrands = useMemo(
    () => [
      "All sub-brands",
      ...Array.from(
        new Set(products.map((product) => product.subBrand).filter(Boolean) as string[]),
      ),
    ],
    [products],
  );
  /**
   * Derive unique nonempty alias filter choices from the loaded product catalogue.
   */
  const aliases = useMemo(
    () => [
      "All aliases",
      ...Array.from(
        new Set(products.map((product) => product.brandAlias).filter(Boolean) as string[]),
      ),
    ],
    [products],
  );
  /**
   * Apply configuration, brand, sub-brand, alias and search filters to the loaded products.
   */
  const visibleProducts = useMemo(
    () =>
      products.filter((product) => {
        const matchesView =
          orderView === "All Products" ||
          product.configuration === orderView ||
          product.configurations?.some((configuration) => configuration.type === orderView);
        const matchesBrand = brandFilter === "All brands" || product.brand === brandFilter;
        const matchesSubBrand =
          subBrandFilter === "All sub-brands" || product.subBrand === subBrandFilter;
        const matchesAlias = aliasFilter === "All aliases" || product.brandAlias === aliasFilter;
        const text =
          `${product.name} ${product.code} ${product.brand || ""} ${product.subBrand || ""} ${product.brandAlias || ""}`.toLowerCase();
        return (
          matchesView &&
          matchesBrand &&
          matchesSubBrand &&
          matchesAlias &&
          text.includes(productSearch.toLowerCase())
        );
      }),
    [products, orderView, brandFilter, subBrandFilter, aliasFilter, productSearch],
  );
  const selectedProduct =
    visibleProducts.find((product) => product.id === form.productId) || visibleProducts[0];
  const selectedConfiguration =
    selectedProduct?.configurations?.find((configuration) => configuration.type === orderView) ||
    selectedProduct?.configurations?.find((configuration) => configuration.type === "Must Sell") ||
    selectedProduct?.configurations?.[0];
  const selectedScheme = selectedProduct?.schemes?.find((scheme) => scheme.id === form.schemeId);
  /**
   * Change a local action field and clear its request key so an edited action is treated as a
   * new submission.
   */
  const update = (k: string, v: string) => {
    actionRequestId.current = "";
    setForm((x) => ({ ...x, [k]: v }));
  };
  /**
   * Refresh the visit and product catalogue while preserving an unsent dirty order draft.
   */
  const refreshRecords = async () => {
    if (!visit || refreshing) return;
    setRefreshing(true);
    setSaveError("");
    try {
      const [freshProducts, freshVisit] = await Promise.all([
        api<Product[]>(`/products?outletId=${encodeURIComponent(route.params.store.id)}`),
        api<any>(`/visits/${visit.id}`),
      ]);
      setProducts(freshProducts);
      setVisit(freshVisit);
      setReturns(freshVisit.returns || []);
      setCompetitors(freshVisit.competitors || []);
      setTickets(freshVisit.tickets || []);
      setRefusedProductIds(freshVisit.refusedProductIds || []);
      setCompleted(freshVisit.status === "Completed");
      const local = await readVisitDraft(route.params.store.id);
      if (!local?.dirty || freshVisit.orderSubmitted) setLines(freshVisit.orderLines || []);
    } catch (error: any) {
      setSaveError(error.message);
    } finally {
      setRefreshing(false);
    }
  };
  /**
   * Persist the current order draft for recovery and report whether Salesforce accepted the
   * draft save.
   */
  const saveDraft = async (items = lines) => {
    await writeVisitDraft(route.params.store.id, items, true);
    await postRecoverable(`/visits/${visit.id}/order-draft`, { items });
    await writeVisitDraft(route.params.store.id, items, false);
    setSaveMessage(
      "Order draft saved in Salesforce. Complete Visit to submit the Sales Order and Order Items.",
    );
  };
  /**
   * Switch the product-configuration view and update the local selection state.
   */
  const selectView = (view: OrderView) => {
    setOrderView(view);
    setSelectedRefusalReason("");
    setForm((current) => ({ ...current, productId: "", schemeId: "", refusalNotes: "" }));
  };
  /**
   * Advance a product filter to the next choice and wrap back to its first option.
   */
  const cycleFilter = (values: string[], current: string, setter: (value: string) => void) => {
    const index = Math.max(0, values.indexOf(current));
    setter(values[(index + 1) % values.length]);
    setSelectedRefusalReason("");
    setForm((value) => ({ ...value, productId: "", schemeId: "", refusalNotes: "" }));
  };
  /**
   * Choose the refusal reason used when recording a product the outlet does not want.
   */
  const selectRefusalReason = (reason: string) => {
    const nextReason = selectedRefusalReason === reason ? "" : reason;
    setSelectedRefusalReason(nextReason);
    setForm((current) => ({ ...current, refusalNotes: nextReason }));
  };
  /**
   * Validate and submit the product-refusal action, then update the local refused-product state.
   */
  const saveRefusal = async (reason: string) => {
    if (!visit || !selectedProduct) return;
    try {
      await post("/product-refusals", {
        visitId: visit.id,
        productId: selectedProduct.id,
        reason,
        notes: form.refusalNotes,
      });
      setRefusedProductIds((ids) => [...new Set([...ids, selectedProduct.id])]);
      setSelectedRefusalReason("");
      setForm((current) => ({ ...current, refusalNotes: "" }));
      Alert.alert("Refusal saved", `${selectedProduct.name}: ${reason}`);
    } catch (error: any) {
      Alert.alert("Could not save refusal", error.message || "Please try again.");
    }
  };
  /**
   * Validate the selected visit action and submit its payload with replay protection, then
   * update the matching local activity list.
   */
  const save = async () => {
    if (!visit || isSaving || isCompleting) return;
    setIsSaving(true);
    setSaveError("");
    setSaveMessage("");
    try {
      if (action === "order") {
        if (visit.orderSubmitted)
          throw new Error(
            "This order has already been submitted. Complete this visit before taking another order.",
          );
        const product = selectedProduct;
        if (selectedRefusalReason) {
          await saveRefusal(selectedRefusalReason);
          return;
        }
        const quantity = Number(form.quantity || 0);
        if (!product || !Number.isFinite(quantity) || quantity <= 0)
          throw new Error("Select a product and enter a valid quantity.");
        const minimumQuantity =
          selectedConfiguration?.minimumQuantity || product.minimumQuantity || 1;
        if (quantity < minimumQuantity)
          throw new Error(
            `${selectedConfiguration?.name || product.configurationName || product.name} requires at least ${minimumQuantity} units.`,
          );
        if (selectedScheme && quantity < selectedScheme.minimumQuantity)
          throw new Error(
            `${selectedScheme.name} requires at least ${selectedScheme.minimumQuantity} units.`,
          );
        const automaticDiscount = selectedScheme
          ? (quantity * product.price * selectedScheme.discountPercent) / 100
          : 0;
        const discount = automaticDiscount + Number(form.discount || 0);
        if (!Number.isFinite(discount) || discount < 0 || discount > quantity * product.price)
          throw new Error("Enter a valid discount between zero and the product total.");
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
        await writeVisitDraft(route.params.store.id, next, true);
        setLines(next);
        setForm({});
        await saveDraft(next);
      } else {
        const payload = {
          visitId: visit.id,
          ...form,
          ...((action === "return" || action === "stock") && !form.productId
            ? { productId: products[0]?.id }
            : {}),
          requestId:
            actionRequestId.current ||
            (actionRequestId.current = `${action}-${Date.now()}-${Math.random().toString(36).slice(2)}`),
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
        actionRequestId.current = "";
        if (action === "return") setReturns((x) => [...x, payload]);
        if (action === "competitor") setCompetitors((x) => [...x, payload]);
        if (action === "ticket") setTickets((x) => [...x, payload]);
        if (action === "stock")
          setVisit((current: any) => ({
            ...current,
            stocks: [...(current.stocks || []), payload],
          }));
        if (action === "asset")
          setVisit((current: any) => ({
            ...current,
            assets: [...(current.assets || []), payload],
          }));
        setSaveMessage(
          "The record was saved in Salesforce. View it from More or refresh this visit.",
        );
      }
      if (action === "order") {
        setForm({});
      } else {
        setAction(null);
        setForm({});
      }
      Alert.alert(
        "Saved",
        action === "order"
          ? "Order draft saved in Salesforce. Complete Visit to submit the order."
          : "The visit action was saved in Salesforce.",
      );
    } catch (e: any) {
      setSaveError(e.message || "The record could not be saved. Your entries are unchanged.");
      Alert.alert("Save not confirmed", e.message || "Please try again.");
    } finally {
      setIsSaving(false);
    }
  };
  /**
   * Submit unsubmitted order lines first, then complete the visit with checkout location;
   * preserve failure information when either step fails.
   */
  const checkout = async () => {
    if (isCompleting || isSaving) return;
    setIsCompleting(true);
    setCompletionMessage("");
    setCompletionError("");
    try {
      const handledProductIds = new Set([
        ...lines.map((line) => line.productId),
        ...refusedProductIds,
      ]);
      const pendingMustSell = products.filter(
        (product) =>
          (product.configuration === "Must Sell" ||
            product.configurations?.some((configuration) => configuration.type === "Must Sell")) &&
          !handledProductIds.has(product.id),
      );
      if (pendingMustSell.length)
        throw new Error(
          `Complete or record a refusal for every Must Sell product: ${pendingMustSell.map((product) => product.name).join(", ")}`,
        );
      if (lines.length) {
        const order = await postRecoverable<any>("/orders", {
          visitId: visit.id,
          items: lines,
          requestId: `order-final-${visit.id}`,
        });
        setVisit((current: any) => ({ ...current, orderSubmitted: true }));
        if (order.items) setLines(order.items);
        await clearVisitDraft(route.params.store.id);
      }
      const loc =
        Platform.OS === "web"
          ? {
              coords: {
                latitude: route.params.location.latitude,
                longitude: route.params.location.longitude,
              },
            }
          : await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const completion = await postRecoverable<{
        retailerEmailSent?: boolean;
        retailerEmailError?: string;
      }>("/store/checkout", {
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
      await clearVisitDraft(route.params.store.id);
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
      Alert.alert(
        "Checkout failed",
        e.message || "Unable to complete the visit. Please try again.",
      );
    } finally {
      setIsCompleting(false);
    }
  };
  /**
   * Fetch the authenticated visit PDF or spreadsheet and offer platform sharing or a browser
   * download.
   */
  const share = async (kind: "pdf" | "excel") => {
    const token = await import("@react-native-async-storage/async-storage").then((m) =>
      m.default.getItem("token"),
    );
    const apiBase = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api";
    const url = `${apiBase}/documents/${kind}/${visit.id}`;
    const extension = kind === "pdf" ? "pdf" : "xlsx";
    const fileName = `${route.params.store.code}-visit-${Date.now()}.${extension}`;
    try {
      if (Platform.OS === "web") {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok)
          throw new Error(
            (await response.json().catch(() => null))?.message || "Document generation failed",
          );
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
        Alert.alert(
          "Document downloaded",
          `${fileName} was downloaded. Attach it in WhatsApp or email.`,
        );
      } else {
        const uri = `${FileSystem.cacheDirectory}${fileName}`;
        const result = await FileSystem.downloadAsync(url, uri, {
          headers: { Authorization: `Bearer ${token}` },
          sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
          md5: false,
        });
        if (!(await Sharing.isAvailableAsync()))
          throw new Error("Sharing is not available on this device");
        await Sharing.shareAsync(result.uri, {
          dialogTitle: `Send ${kind.toUpperCase()} using WhatsApp or Mail`,
          mimeType:
            kind === "pdf"
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
      <Button
        title={refreshing ? "REFRESHING…" : "REFRESH SALESFORCE DATA"}
        kind="secondary"
        onPress={refreshRecords}
        disabled={refreshing || isSaving || isCompleting}
      />
      {!!saveMessage && <Text style={s.completionSuccess}>{saveMessage}</Text>}
      {!!saveError && <Text style={s.completionError}>{saveError}</Text>}
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
              ["6", "Schemes", () => setShowSchemes((value) => !value)],
              [
                "7",
                "Navigate",
                () =>
                  Linking.openURL(
                    `https://www.google.com/maps/dir/?api=1&destination=${route.params.store.latitude},${route.params.store.longitude}`,
                  ).catch(() =>
                    Alert.alert("Maps unavailable", "Please open your maps application."),
                  ),
              ],
              [
                "8",
                "Share Order",
                () =>
                  lines.length
                    ? share("pdf")
                    : Alert.alert("No order", "Create an order before sharing it."),
              ],
              ["9", "Checkout", checkout],
              ["10", "Asset Survey", () => setAction("asset")],
              [
                "11",
                "Survey & Merchandising",
                () =>
                  navigation.navigate("Survey", {
                    store: route.params.store,
                    visitId: visit.id,
                    location: route.params.location,
                  }),
              ],
            ].map(([number, label, handler]) => (
              <Text key={String(label)} style={s.actionTile} onPress={handler as () => void}>
                <Text style={s.actionNumber}>{number as string}</Text>
                {"\n"}
                {label as string}
              </Text>
            ))}
          </View>
        </>
      )}
      {showSchemes && (
        <Card>
          <Label>Product-specific schemes</Label>
          {products
            .filter((product) => product.schemes?.length)
            .map((product) => (
              <View key={product.id}>
                <Text style={s.productName}>{product.name}</Text>
                {product.schemes?.map((scheme) => (
                  <Text key={scheme.id} style={s.sub}>
                    {scheme.name} · Minimum {scheme.minimumQuantity} · {scheme.discountPercent}%
                    discount
                  </Text>
                ))}
              </View>
            ))}
          {!products.some((product) => product.schemes?.length) && (
            <Text>No applicable schemes.</Text>
          )}
        </Card>
      )}
      {action && (
        <Card>
          <Text style={s.formTitle}>{action.toUpperCase()}</Text>
          {action === "order" && (
            <>
              <Text style={s.orderHelp}>
                Choose a Salesforce-controlled configuration, then select products for this outlet.
              </Text>
              <View style={s.tabRow}>
                {(["All Products", "Must Sell", "Focus Sell", "Suggested Sell"] as OrderView[]).map(
                  (view) => (
                    <Pressable
                      key={view}
                      style={[s.tab, orderView === view && s.tabActive]}
                      onPress={() => selectView(view)}
                    >
                      <Text style={[s.tabText, orderView === view && s.tabTextActive]}>{view}</Text>
                    </Pressable>
                  ),
                )}
              </View>
              <VisitField
                style={s.input}
                placeholder="Search product, SKU or brand"
                value={productSearch}
                onChangeText={setProductSearch}
              />
              <Label>Selected product details</Label>
              <ProductIdentityFields product={selectedProduct} />
              <Button
                title={showProductFilters ? "HIDE PRODUCT FILTERS" : "FILTER PRODUCTS"}
                kind="secondary"
                onPress={() => setShowProductFilters((value) => !value)}
              />
              {showProductFilters && (
                <View style={s.filterRow}>
                  <Pressable
                    style={s.filter}
                    onPress={() => cycleFilter(brands, brandFilter, setBrandFilter)}
                  >
                    <Text style={s.filterLabel}>FILTER BY BRAND</Text>
                    <Text style={s.filterValue}>{brandFilter}</Text>
                  </Pressable>
                  <Pressable
                    style={s.filter}
                    onPress={() => cycleFilter(subBrands, subBrandFilter, setSubBrandFilter)}
                  >
                    <Text style={s.filterLabel}>FILTER BY SUB-BRAND</Text>
                    <Text style={s.filterValue}>{subBrandFilter}</Text>
                  </Pressable>
                  <Pressable
                    style={s.filter}
                    onPress={() => cycleFilter(aliases, aliasFilter, setAliasFilter)}
                  >
                    <Text style={s.filterLabel}>FILTER BY ALIAS</Text>
                    <Text style={s.filterValue}>{aliasFilter}</Text>
                  </Pressable>
                </View>
              )}
              {!selectedProduct ? (
                <Text style={s.sub}>No products match this configuration and filter.</Text>
              ) : (
                <Card style={s.productCard}>
                  <View style={s.productTop}>
                    <Text style={s.productName}>{selectedProduct.name}</Text>
                    <Text style={s.configuration}>
                      {selectedProduct.configurations
                        ?.map((configuration) => configuration.type)
                        .join(" · ") ||
                        selectedProduct.configuration ||
                        "Standard"}
                    </Text>
                  </View>
                  <Text style={s.sub}>{selectedProduct.code}</Text>
                  <Text style={s.productMeta}>
                    Price <Money value={selectedProduct.price} /> · Stock {selectedProduct.stock} ·
                    Previously purchased {selectedProduct.previousQuantity || 0}
                  </Text>
                  {!!(selectedConfiguration || selectedProduct.configurationName) && (
                    <Text style={s.suggestion}>
                      {selectedConfiguration?.name || selectedProduct.configurationName} · Minimum{" "}
                      {selectedConfiguration?.minimumQuantity ||
                        selectedProduct.minimumQuantity ||
                        1}
                      {selectedConfiguration?.targetQuantity || selectedProduct.targetQuantity
                        ? ` · Target ${selectedConfiguration?.targetQuantity || selectedProduct.targetQuantity}`
                        : ""}
                      {selectedConfiguration?.geography
                        ? ` · ${selectedConfiguration.geography}`
                        : ""}
                      {selectedConfiguration?.channel &&
                      selectedConfiguration.channel !== "All Channels"
                        ? ` · ${selectedConfiguration.channel}`
                        : ""}
                    </Text>
                  )}
                  {!!selectedProduct.suggestionSource && (
                    <Text style={s.suggestion}>{selectedProduct.suggestionSource}</Text>
                  )}
                  {!!selectedProduct.lastFiveOrders?.length && (
                    <View style={s.history}>
                      <Label>LAST FIVE ORDER HISTORY</Label>
                      {selectedProduct.lastFiveOrders.map((history) => (
                        <Text key={`${history.orderId}-${history.orderDate}`} style={s.historyLine}>
                          {history.orderNumber || "Order"} ·{" "}
                          {history.orderDate || "Date unavailable"} · Qty {history.quantity}
                        </Text>
                      ))}
                    </View>
                  )}
                </Card>
              )}
              <Button
                title="NEXT PRODUCT"
                kind="secondary"
                onPress={() => {
                  const next = nextProduct(visibleProducts, selectedProduct?.id);
                  if (!next) return;
                  update("productId", next.id);
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
                    {form.schemeId === scheme.id ? "✓ " : ""}
                    {scheme.name}
                    {"\n"}
                    <Text style={s.schemeDetail}>
                      {scheme.type || "Scheme"} · Min {scheme.minimumQuantity}
                      {scheme.discountPercent ? ` · ${scheme.discountPercent}% discount` : ""}
                      {scheme.freeQuantity ? ` · ${scheme.freeQuantity} free` : ""}
                    </Text>
                  </Text>
                ))
              )}
              <VisitField
                style={s.input}
                keyboardType="numeric"
                label="Quantity"
                placeholder="e.g. 10"
                value={form.quantity}
                onChangeText={(v) => update("quantity", v)}
              />
              <VisitField
                style={s.input}
                keyboardType="numeric"
                label="Discount (₹)"
                placeholder="e.g. 0"
                value={form.discount}
                onChangeText={(v) => update("discount", v)}
              />
              {(selectedProduct?.configuration === "Must Sell" ||
                selectedProduct?.configurations?.some(
                  (configuration) => configuration.type === "Must Sell",
                )) &&
                !lines.some((line) => line.productId === selectedProduct.id) &&
                !refusedProductIds.includes(selectedProduct.id) && (
                  <>
                    <Label>RETAILER DECLINED THIS MUST SELL PRODUCT</Label>
                    <View style={s.reasonGrid}>
                      {refusalReasons.map((reason) => {
                        const isSelected = selectedRefusalReason === reason;
                        return (
                          <Pressable
                            key={reason}
                            style={[s.reason, isSelected && s.reasonSelected]}
                            onPress={() => selectRefusalReason(reason)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isSelected }}
                          >
                            <Text style={[s.reasonText, isSelected && s.reasonTextSelected]}>
                              {isSelected ? "✓ " : ""}
                              {reason}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <VisitField
                      style={s.input}
                      placeholder="Optional refusal notes"
                      value={form.refusalNotes}
                      onChangeText={(value) => update("refusalNotes", value)}
                    />
                  </>
                )}
            </>
          )}
          {action === "return" && (
            <>
              <ProductIdentityFields
                product={products.find((p) => p.id === (form.productId || products[0]?.id))}
              />
              <Text style={s.sub}>
                Product: {products.find((p) => p.id === (form.productId || products[0]?.id))?.name}
              </Text>
              <Button
                title="NEXT PRODUCT"
                kind="secondary"
                onPress={() => {
                  if (!products.length) return;
                  const index = products.findIndex(
                    (p) => p.id === (form.productId || products[0]?.id),
                  );
                  update("productId", products[(index + 1) % products.length].id);
                }}
              />
              <VisitField
                style={s.input}
                keyboardType="numeric"
                placeholder="Return quantity"
                onChangeText={(v) => update("quantity", v)}
              />
              <VisitField
                style={s.input}
                placeholder="Reason: Damaged / Expired / Wrong Supply / Other"
                onChangeText={(v) => update("reason", v)}
              />
              <VisitField
                style={s.input}
                placeholder="Manufacturing date (YYYY-MM-DD)"
                onChangeText={(v) => update("manufacturingDate", v)}
              />
            </>
          )}
          {action === "stock" && (
            <>
              <ProductIdentityFields
                product={products.find((p) => p.id === (form.productId || products[0]?.id))}
              />
              <Text style={s.sub}>
                Product: {products.find((p) => p.id === (form.productId || products[0]?.id))?.name}
              </Text>
              <Button
                title="NEXT PRODUCT"
                kind="secondary"
                onPress={() => {
                  if (!products.length) return;
                  const index = products.findIndex(
                    (p) => p.id === (form.productId || products[0]?.id),
                  );
                  update("productId", products[(index + 1) % products.length].id);
                }}
              />
              <VisitField
                style={s.input}
                keyboardType="numeric"
                placeholder="Shelf quantity"
                onChangeText={(v) => update("quantity", v)}
              />
              <VisitField
                style={s.input}
                placeholder="Manufacturing date (YYYY-MM-DD)"
                onChangeText={(v) => update("manufacturingDate", v)}
              />
            </>
          )}
          {action === "asset" && (
            <>
              <VisitField
                style={s.input}
                placeholder="Asset code"
                onChangeText={(v) => update("assetCode", v)}
              />
              <VisitField
                style={s.input}
                placeholder="Asset name"
                onChangeText={(v) => update("assetName", v)}
              />
              <VisitField
                style={s.input}
                placeholder="Status: Working / Needs Service / Damaged / Missing"
                onChangeText={(v) => update("status", v)}
              />
              <VisitField
                style={s.input}
                placeholder="Given date (YYYY-MM-DD)"
                onChangeText={(v) => update("givenDate", v)}
              />
              <VisitField
                style={s.input}
                placeholder="Picture URL"
                onChangeText={(v) => update("pictureUrl", v)}
              />
            </>
          )}
          {action === "competitor" && (
            <>
              <VisitField
                style={s.input}
                placeholder="Competitor name"
                onChangeText={(v) => update("competitorName", v)}
              />
              <VisitField
                style={s.input}
                placeholder="Company"
                onChangeText={(v) => update("company", v)}
              />
              <VisitField
                style={s.input}
                keyboardType="numeric"
                placeholder="MRP ₹"
                onChangeText={(v) => update("mrp", v)}
              />
              <VisitField
                style={s.input}
                keyboardType="numeric"
                placeholder="Retail buying price ₹"
                onChangeText={(v) => update("rbp", v)}
              />
              <VisitField
                style={s.input}
                placeholder="Promotion / Scheme"
                onChangeText={(v) => update("promotion", v)}
              />
              <VisitField
                style={s.input}
                placeholder="Remarks"
                onChangeText={(v) => update("remarks", v)}
              />
            </>
          )}
          {action === "ticket" && (
            <>
              <VisitField
                style={s.input}
                placeholder="Ticket subject"
                onChangeText={(v) => update("subject", v)}
              />
              <VisitField
                style={s.input}
                multiline
                placeholder="Description and remarks"
                onChangeText={(v) => update("description", v)}
              />
            </>
          )}
          {action === "revisit" && (
            <>
              <VisitField
                style={s.input}
                placeholder="Follow-up type"
                onChangeText={(v) => update("type", v)}
              />
              <VisitField
                style={s.input}
                placeholder="Remarks"
                onChangeText={(v) => update("remarks", v)}
              />
              <VisitField
                style={s.input}
                placeholder="Next follow-up date/time"
                onChangeText={(v) => update("followUp", v)}
              />
            </>
          )}
          <Button
            title={isSaving ? "SAVING…" : "SAVE ACTION"}
            onPress={save}
            disabled={isSaving || isCompleting}
          />
          <Button title="CANCEL" kind="secondary" onPress={() => setAction(null)} />
        </Card>
      )}
      <Card>
        <Label>Visit summary</Label>
        <Text>Order lines: {lines.length}</Text>
        <Text>Returns: {returns.length}</Text>
        <Text>Competitor activities: {competitors.length}</Text>
        <Text>Tickets: {tickets.length}</Text>
        <Text>
          Stock checks: {visit.stocks?.length || 0} · Asset surveys: {visit.assets?.length || 0}
        </Text>
        {lines.map((line, index) => (
          <Text key={`${line.productId}-${index}`} style={s.sub}>
            {line.productName} · Qty {line.quantity} · {line.schemeName || "No scheme"} · ₹
            {line.amount}
          </Text>
        ))}
        {!completed && !visit.orderSubmitted && lines.length > 0 && (
          <Button
            title="SAVE DRAFT TO SALESFORCE"
            kind="secondary"
            disabled={isSaving || isCompleting}
            onPress={async () => {
              setIsSaving(true);
              setSaveError("");
              try {
                await saveDraft();
              } catch (e: any) {
                setSaveError(e.message);
              } finally {
                setIsSaving(false);
              }
            }}
          />
        )}
        <Text style={s.total}>
          Order total: <Money value={total} />
        </Text>
        {!completed ? (
          <>
            <Button
              title={isCompleting ? "COMPLETING VISIT…" : "COMPLETE VISIT"}
              onPress={checkout}
              disabled={isCompleting || isSaving}
            />
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
  grid: {
    marginBottom: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  actionTile: {
    width: "31%",
    minHeight: 82,
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 5,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    textAlign: "center",
    color: colors.ink,
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
  },
  actionNumber: { color: colors.brand, fontSize: 18, fontWeight: "900" },
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
  schemeCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginVertical: 5,
    color: colors.ink,
    fontWeight: "800",
    backgroundColor: "white",
  },
  schemeSelected: { borderColor: colors.brand, backgroundColor: "#E7F5F3" },
  schemeDetail: { color: colors.muted, fontWeight: "500", fontSize: 12 },
  orderHelp: { color: colors.muted, marginBottom: 10 },
  tabRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  tab: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "white",
  },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontSize: 11, fontWeight: "800", color: colors.ink },
  tabTextActive: { color: "white" },
  filterRow: { flexDirection: "row", gap: 6, marginVertical: 6 },
  filter: {
    flex: 1,
    padding: 9,
    borderRadius: 10,
    backgroundColor: "#F4F7F5",
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterLabel: { fontSize: 8, fontWeight: "900", color: colors.muted },
  filterValue: { fontSize: 10, fontWeight: "800", color: colors.ink, marginTop: 3 },
  productCard: { marginVertical: 8, borderLeftWidth: 4, borderLeftColor: colors.brand },
  productTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  productName: { flex: 1, fontSize: 17, fontWeight: "900", color: colors.ink },
  configuration: {
    fontSize: 9,
    fontWeight: "900",
    color: colors.brand,
    backgroundColor: "#E7F5F3",
    padding: 6,
    borderRadius: 10,
  },
  productMeta: { fontSize: 12, fontWeight: "700", color: colors.ink, marginTop: 6 },
  suggestion: { fontSize: 11, color: colors.blue, fontWeight: "700", marginTop: 5 },
  history: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  historyLine: { fontSize: 11, color: colors.muted, marginTop: 3 },
  reasonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 6 },
  reason: {
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 12,
    backgroundColor: "#FFF8E7",
  },
  reasonText: { fontSize: 10, fontWeight: "800", color: colors.ink },
  reasonSelected: { backgroundColor: colors.warning, borderColor: colors.warning },
  reasonTextSelected: { color: "white" },
  completionSuccess: {
    color: colors.brand,
    fontWeight: "800",
    textAlign: "center",
    marginVertical: 8,
  },
  completionError: {
    color: colors.danger,
    fontWeight: "800",
    textAlign: "center",
    marginVertical: 8,
  },
});
