import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { request } from "../api";
import { colors } from "../theme";
import { groupReturnOrders, selectWholeReturnOrder, ReturnItem, ReturnOrder, ReturnSelection } from "../returnSelection";

/** Review one original order at a time. Salesforce remains authoritative at submission. */
export default function ReturnForm({ token, kind, disabled, onReview, onSignIn, primaryOrders = [], onOpenPrimaryOrders }: {
  token: string; kind: "primary" | "secondary"; disabled: boolean;
  onReview: (body: Record<string, unknown>, summary: string) => void; onSignIn: () => void;
  primaryOrders?: { id: string; name: string; status: string; products: string[] }[];
  onOpenPrimaryOrders?: () => void;
}) {
  const [orders, setOrders] = useState<ReturnOrder[]>([]);
  const [order, setOrder] = useState<ReturnOrder | null>(null);
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [selected, setSelected] = useState<Record<string, ReturnSelection>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const generation = useRef(0);
  const unit = kind === "primary" ? "cases" : "pieces";
  const reasons = ["Damaged", "Expired", "Delayed Delivery", "No Demand", ...(kind === "secondary" ? ["Near Expiry", "Wrong Supply", "Quality Issue"] : []), "Other"];

  /** Reload the selected order independently so a truncated initial list cannot become a full-order return. */
  async function load(chosen: ReturnOrder | null = null) {
    const ticket = ++generation.current;
    setLoading(true); setLoaded(false); setError("");
    try {
      const data = await request(`/returns/${kind}/catalogue${chosen?.id ? `?orderId=${chosen.id}` : ""}`, token);
      if (ticket !== generation.current) return;
      setHasMore(data.hasMore);
      if (chosen) {
        const scoped = chosen.id ? data.items : groupReturnOrders(data.items).find(group => group.key === chosen.key)?.items || [];
        setItems(scoped);
      } else { setOrders(groupReturnOrders(data.items)); setItems([]); }
      setLoaded(true);
    } catch (failure: any) {
      if (ticket !== generation.current) return;
      setError(failure.message);
      if (failure.status === 401 || failure.status === 403) onSignIn();
    } finally { if (ticket === generation.current) setLoading(false); }
  }
  useEffect(() => { setOrder(null); setSelected({}); void load(); return () => { generation.current++; }; }, [token, kind]);
  const button = (title: string, action: () => void, blocked = false, checked = false) => (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: blocked, selected: checked }}
      disabled={blocked} onPress={action} style={[s.button, checked && s.selected, blocked && { opacity: .5 }]}>
      <Text style={[s.buttonText, checked && { color: colors.white }]}>{title}</Text>
    </Pressable>
  );
  function choose(chosen: ReturnOrder | null) {
    setOrder(chosen); setSelected({}); setSearch(""); void load(chosen);
  }
  function edit(id: string, patch: Partial<ReturnSelection>) {
    setSelected(current => ({ ...current, [id]: { ...current[id], ...patch } }));
  }
  function selectAll() {
    try { setSelected(selectWholeReturnOrder(items)); setError(""); }
    catch (failure: any) { setError(failure.message); }
  }
  /** Validate every selection, including products hidden by the search filter. */
  function review() {
    const chosen = items.filter(item => selected[item.id]);
    if (!loaded || hasMore || !chosen.length || chosen.length > 50 || chosen.length !== Object.keys(selected).length) {
      setError("Select 1–50 current products from this order. Refresh if the source records changed."); return;
    }
    for (const item of chosen) {
      const input = selected[item.id], quantity = Number(input.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > Math.min(item.available, 100000)) {
        setError(`${item.product}: enter 1–${Math.min(item.available, 100000)} whole ${unit}.`); return;
      }
      if (!reasons.includes(input.reason) || (input.reason === "Other" && !input.notes.trim())) {
        setError(`${item.product}: select a reason and explain Other.`); return;
      }
    }
    setError("");
    onReview({ lines: chosen.map(item => {
      const input = selected[item.id];
      return { ...(kind === "primary" ? { receiptLineId: item.id, cases: Number(input.quantity) } : { orderItemId: item.id, pieces: Number(input.quantity) }), reason: input.reason, notes: input.notes.trim() };
    }) }, chosen.map(item => `${item.order || item.receipt} · ${item.product}: ${selected[item.id].quantity} ${unit} (${selected[item.id].reason})`).join("; "));
  }
  const blocked = disabled || loading || !loaded;
  // Keep unreceived orders discoverable without treating ordered stock as received stock.
  // Choosing any order still reloads its eligible receipt lines from Salesforce.
  const visibleOrders = [...orders];
  if (kind === "primary") for (const known of primaryOrders) {
    const index = visibleOrders.findIndex(group => group.id === known.id);
    const group = index < 0 ? { key: known.id, id: known.id, name: known.name, items: [] } : visibleOrders[index];
    const enriched = { ...group, status: known.status, products: known.products };
    if (index < 0) visibleOrders.push(enriched); else visibleOrders[index] = enriched;
  }
  return <View style={s.card}>
    <Text style={s.heading}>{order ? `Return products from ${order.name}` : "Choose an order to return"}</Text>
    <Text style={s.copy}>{kind === "primary"
      ? "Choose a primary order, then all or some received products. Returns go to your company officer for approval. Goods must be received before they can be returned."
      : "Choose an approved outlet order, then all or some products. The selected products stay together for distributor approval."}</Text>
    <Text style={s.copy}>Pending and approved returns reduce the available quantity. Submission does not move stock.</Text>
    {order && button("Choose a different order", () => choose(null), disabled || loading)}
    {button(loading ? "Loading ordered products…" : "Refresh ordered products", () => void load(order), disabled || loading)}
    {!!error && <Text accessibilityRole="alert" style={s.notice}>{error}</Text>}
    {hasMore && <Text style={s.notice}>{order ? "This order has more than 500 source lines. Please use Salesforce to review it; partial selection is blocked." : "Showing recent orders. Choose an order to load its complete available product list."}</Text>}
    <Text style={s.label}>{order ? "Find a product in this order" : "Find an order, product or outlet"}</Text>
    <TextInput accessibilityLabel="Find product, order or outlet" placeholder="Product name, order number or outlet" placeholderTextColor={colors.muted}
      style={s.input} value={search} onChangeText={setSearch} editable={!disabled} />
    {!order && loaded && !visibleOrders.length && <Text style={s.notice}>No {kind === "primary" ? "primary" : "approved outlet"} orders are available yet.</Text>}
    {!order && visibleOrders.filter(group => `${group.name} ${group.outlet || ""} ${(group.products || group.items.map(item => item.product)).join(" ")}`.toLowerCase().includes(search.toLowerCase())).map(group => <View key={group.key} style={s.item}>
      <Text style={s.product}>{group.name}{group.outlet ? ` · ${group.outlet}` : ""}</Text>
      <Text style={s.copy}>{[...new Set(group.products || group.items.map(item => item.product))].join(", ")}</Text>
      {!!group.status && <Text style={s.label}>Order status: {group.status}</Text>}
      {kind === "primary" && loaded && !group.items.length && <Text style={s.notice}>{group.status === "Approved"
        ? "No received goods in the current return list. Choose this order to check its latest receipt availability."
        : "Approval and a received goods receipt are needed before these products can be returned."}</Text>}
      {button(`Choose ${group.name}${group.outlet ? ` — ${group.outlet}` : ""}`, () => choose(group), blocked)}
    </View>)}
    {order && <>
      {kind === "primary" && <>
        {!!order.status && <Text style={s.label}>Order status: {order.status}</Text>}
        {!!order.products?.length && <Text style={s.copy}>Ordered products: {order.products.join(", ")}</Text>}
        {loaded && !items.length && <Text accessibilityRole="alert" style={s.notice}>No received products are recorded for {order.name}. Approval alone does not record delivery. After you actually receive the goods, open Primary orders, choose “Receive goods for this line”, and save the received quantity, batch and expiry. Then return here and refresh.</Text>}
        {loaded && items.length > 0 && <Text style={s.copy}>Only received quantities are selectable. If a product is missing, record its goods receipt in Primary orders first.</Text>}
        {loaded && onOpenPrimaryOrders && button("Open Primary orders / Receive goods", onOpenPrimaryOrders, disabled)}
      </>}
      <Text style={s.label}>{items.length} source lines · {items.filter(item => item.available > 0).length} returnable</Text>
      {button("Select all returnable products in this order", selectAll, blocked || hasMore || !items.some(item => item.available > 0))}
      {!!Object.keys(selected).length && <>
        {button("Clear selected products", () => setSelected({}), disabled)}
        <Text style={s.label}>Apply a reason to all selected products</Text>
        <View style={s.reasons}>{reasons.map(reason => <View key={reason}>{button(`All: ${reason}`, () => setSelected(current => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, { ...value, reason }]))), disabled)}</View>)}</View>
      </>}
      {items.filter(item => `${item.product} ${item.batch || ""}`.toLowerCase().includes(search.toLowerCase())).map(item => {
        const input = selected[item.id];
        return <View key={item.id} style={s.item}>
          <Text style={s.product}>{item.product}</Text>
          <Text style={s.copy}>{item.order}{item.outlet ? ` · ${item.outlet}` : ""}{item.receipt ? ` · ${item.receipt}` : ""}</Text>
          {!!item.batch && <Text style={s.copy}>Batch {item.batch}{item.expiry ? ` · Expiry ${item.expiry}` : ""}</Text>}
          <Text style={s.label}>{item.available} {unit} available to return · {item.reserved} already requested · {item.original} {kind === "primary" ? "received" : "ordered"}</Text>
          {button(input ? `Remove ${item.product}` : `Select ${item.product}`, () => setSelected(current => {
            const next = { ...current }; if (next[item.id]) delete next[item.id]; else next[item.id] = { quantity: "1", reason: "", notes: "" }; return next;
          }), blocked || hasMore || (!input && item.available < 1), !!input)}
          {input && <>
            <Text style={s.label}>Return quantity (whole {unit})</Text>
            <TextInput accessibilityLabel={`Return ${unit} for ${item.product}`} keyboardType="numeric" value={input.quantity}
              editable={!disabled} onChangeText={quantity => edit(item.id, { quantity })} style={s.input} />
            <Text style={s.label}>Return reason</Text>
            <View style={s.reasons}>{reasons.map(reason => <View key={reason}>{button(reason, () => edit(item.id, { reason }), disabled, input.reason === reason)}</View>)}</View>
            <Text style={s.label}>Notes {input.reason === "Other" ? "(required)" : "(optional)"}</Text>
            <TextInput accessibilityLabel={`Return notes for ${item.product}`} value={input.notes} maxLength={1000} multiline editable={!disabled}
              placeholder="Explain the return" placeholderTextColor={colors.muted} onChangeText={notes => edit(item.id, { notes })} style={s.input} />
          </>}
        </View>;
      })}
      <Text style={s.label}>Selected order lines: {Object.keys(selected).length}</Text>
      {button("Review return for approval", review, blocked || hasMore || !Object.keys(selected).length, true)}
    </>}
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 24, gap: 14 },
  heading: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  product: { color: colors.ink, fontSize: 19, fontWeight: "700" },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  label: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, color: colors.ink, backgroundColor: colors.white, fontSize: 17 },
  item: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 20, gap: 12 },
  button: { borderWidth: 1, borderColor: colors.brand, borderRadius: 14, padding: 16, alignItems: "center" },
  buttonText: { color: colors.brand, fontWeight: "700" }, selected: { backgroundColor: colors.brand },
  notice: { backgroundColor: colors.surface, color: colors.ink, padding: 16, borderRadius: 12 },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
