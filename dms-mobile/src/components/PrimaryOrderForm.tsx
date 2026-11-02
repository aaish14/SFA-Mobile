import React, { useCallback, useEffect, useRef, useState } from "react";
import RecordBarcode from "./RecordBarcode";
import { AppState, View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { request } from "../api";
import { colors } from "../theme";

type Row = Record<string, any>;
type Selection = { cases: string; schemeId?: string };
/**
 * Manage product, case and scheme selection for a distributor order; hand a validated draft to
 * the parent review dialog instead of submitting immediately.
 */
export default function PrimaryOrderForm({
  token,
  disabled,
  onReview,
  onSignIn,
}: {
  token: string;
  disabled: boolean;
  onReview: (body: Record<string, unknown>, summary: string) => void;
  onSignIn?: () => void;
}) {
  const [catalogue, setCatalogue] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Record<string, Selection>>({});
  const [loading, setLoading] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const catalogueRequest = useRef(0);
  /**
   * Refresh the primary product/scheme catalogue and request renewed sign-in when the API denies
   * the session.
   */
  const load = useCallback(
    async (background = false) => {
      const requestId = ++catalogueRequest.current;
      if (!background) setLoading(true);
      try {
        const latest = await request("/primary/catalogue", token);
        if (requestId !== catalogueRequest.current) return;
        setCatalogue(latest);
        if (!background) setError("");
        setNeedsSignIn(false);
      } catch (failure: any) {
        if (requestId !== catalogueRequest.current) return;
        if (failure.status === 401 || failure.status === 403) setCatalogue(null);
        setError(failure.message);
        setNeedsSignIn(failure.status === 401 || failure.status === 403);
      } finally {
        if (requestId === catalogueRequest.current) setLoading(false);
      }
    },
    [token],
  );
  useEffect(() => {
    void load();
    // Refresh Salesforce offers without clearing the distributor's quantities or notes.
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void load(true);
    }, 60000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void load(true);
    });
    return () => {
      catalogueRequest.current += 1;
      clearInterval(timer);
      listener.remove();
    };
  }, [load]);
  const products: Row[] = catalogue?.products || [];
  const chosen = products.filter((p) => selected[p.Id]);
  /**
   * Require a positive case price and a positive whole-number pieces-per-case conversion before
   * a product can be ordered.
   */
  const configured = (p: Row) =>
    Number(p.DMS_Case_Price__c) > 0 &&
    Number.isInteger(Number(p.Units_Per_Case__c)) &&
    Number(p.Units_Per_Case__c) > 0;
  /**
   * Render an accessible product/scheme action with explicit selected and disabled state.
   */
  const button = (title: string, action: () => void, blocked = false, checked = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, selected: checked }}
      disabled={blocked}
      onPress={action}
      style={[s.button, checked && s.selected, blocked && { opacity: 0.5 }]}
    >
      <Text style={[s.buttonText, checked && { color: colors.white }]}>{title}</Text>
    </Pressable>
  );
  /**
   * Validate selected products, whole-case quantities and scheme minimums before constructing
   * the review payload; Salesforce remains authoritative for final prices and approval.
   */
  function review() {
    if (!chosen.length || chosen.length > 50 || chosen.length !== Object.keys(selected).length) {
      setError(
        "Select between 1 and 50 current products. A removed product requires reopening the form.",
      );
      return;
    }
    const lines = [];
    for (const product of chosen) {
      const input = selected[product.Id],
        cases = Number(input.cases);
      if (!configured(product) || !Number.isInteger(cases) || cases <= 0 || cases > 100000) {
        setError(
          `${product.Name}: enter 1–100000 whole cases and ensure case pricing is configured.`,
        );
        return;
      }
      const scheme = product.schemes?.find((row: Row) => row.Id === input.schemeId);
      if (
        input.schemeId &&
        (!scheme || cases < Number(scheme.Minimum_Cases__c) || Number(scheme.Minimum_Cases__c) <= 0)
      ) {
        setError(`${product.Name}: meet the scheme minimum or select No scheme.`);
        return;
      }
      lines.push({
        productId: product.Id,
        cases,
        ...(input.schemeId ? { schemeId: input.schemeId } : {}),
      });
    }
    setError("");
    onReview(
      { lines, notes: notes.trim() },
      chosen
        .map((p) => {
          const selection = selected[p.Id],
            scheme = p.schemes?.find((row: Row) => row.Id === selection.schemeId);
          return `${p.Name}: ${selection.cases} cases (${scheme?.Name || "No scheme"})`;
        })
        .join("; "),
    );
  }
  return (
    <View style={s.card}>
      <Text style={s.heading}>Place Primary Order</Text>
      <Text style={s.copy}>
        Order for {catalogue?.distributor?.Name || "your distributor"} in whole cases. Company
        officer:{" "}
        {catalogue
          ? catalogue.distributor?.Officer__r?.Name || "Not assigned"
          : "sign in and refresh to load"}
        .
      </Text>
      <Text style={s.copy}>
        Salesforce confirms prices, discounts, free cases and approval. Submission does not increase
        stock; receive goods only after approval and delivery.
      </Text>
      {button(
        loading ? "Loading catalogue…" : "Refresh products and schemes",
        () => void load(),
        loading || disabled,
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {needsSignIn && onSignIn && (
        <>
          <Text style={s.copy}>
            Renew your distributor sign-in to load Salesforce orders and products. Saved pending
            work stays on this device.
          </Text>
          {button("Sign in again", onSignIn, disabled)}
        </>
      )}
      {catalogue && (
        <>
          {!catalogue.distributor?.Officer__r?.IsActive && (
            <Text style={s.error}>
              An active company officer must be assigned in Salesforce before ordering.
            </Text>
          )}
          {!!products.length && !products.some(configured) && (
            <Text style={s.error}>
              No products are ready for primary ordering. Set Primary Case Price and Units Per Case
              on the Salesforce products first.
            </Text>
          )}
          {!products.length && (
            <Text style={s.copy}>No active sellable products in Salesforce.</Text>
          )}
          <Text style={s.label}>Search product or code</Text>
          <Text style={s.copy}>
            Schemes appear under their linked products. Offers refresh automatically every minute
            while this form is active. Only applicable Primary schemes can be selected.
          </Text>
          <TextInput
            accessibilityLabel="Search primary products"
            placeholder="Product name, code or P- barcode"
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={colors.muted}
            style={s.input}
            value={search}
            onChangeText={setSearch}
          />
          {products
            .filter((p) =>
              `${p.Name} ${p.Product_Code__c || ""} ${p.barcode?.value || ""}`
                .toLowerCase()
                .includes(search.trim().toLowerCase()),
            )
            .map((product) => {
              const selection = selected[product.Id];
              return (
                <View key={product.Id} style={s.product}>
                  <RecordBarcode
                    barcode={product.barcode}
                    label={`Product barcode: ${product.Name}`}
                  >
                    <Text style={s.label}>{product.Name}</Text>
                    <Text style={s.copy}>SKU: {product.Product_Code__c || "Not configured"}</Text>
                    <Text style={s.copy}>
                      Brand: {product.Brand__c || "Not configured"} · Sub-brand:{" "}
                      {product.Sub_Brand__c || "Not configured"}
                    </Text>
                    <Text style={s.copy}>Alias: {product.Brand_Alias__c || "Not configured"}</Text>
                    <Text style={s.copy}>
                      ₹{Number(product.DMS_Case_Price__c || 0).toFixed(2)} per case ·{" "}
                      {product.Units_Per_Case__c || "Not configured"} pieces per case · GST{" "}
                      {product.GST_Percent__c || 0}%
                    </Text>
                  </RecordBarcode>
                  <Text style={s.name}>{product.Name}</Text>
                  <Text style={s.copy}>
                    {configured(product)
                      ? `₹${Number(product.DMS_Case_Price__c).toFixed(2)} / case · ${product.Units_Per_Case__c} pieces / case · GST ${product.GST_Percent__c || 0}%`
                      : "Primary case price / pieces per case needs Salesforce configuration"}
                  </Text>
                  {button(
                    selection ? "Remove product" : "Add product",
                    () =>
                      setSelected((old) => {
                        const next = { ...old };
                        if (next[product.Id]) delete next[product.Id];
                        else next[product.Id] = { cases: "1" };
                        return next;
                      }),
                    disabled || !configured(product),
                    !!selection,
                  )}
                  {selection && (
                    <>
                      <Text style={s.label}>Quantity (whole cases)</Text>
                      <TextInput
                        accessibilityLabel={`${product.Name} cases`}
                        keyboardType="number-pad"
                        value={selection.cases}
                        editable={!disabled}
                        placeholder="Enter cases"
                        placeholderTextColor={colors.muted}
                        style={s.input}
                        onChangeText={(cases) =>
                          setSelected((old) => ({
                            ...old,
                            [product.Id]: { ...old[product.Id], cases },
                          }))
                        }
                      />
                    </>
                  )}
                  <View style={s.schemePanel}>
                    <Text style={s.label}>Schemes for {product.Name}</Text>
                    {selection && (
                      <>
                        {!!product.schemes?.length &&
                          button(
                            selection.schemeId ? "Continue without a scheme" : "No scheme selected",
                            () =>
                              setSelected((old) => ({
                                ...old,
                                [product.Id]: { ...old[product.Id], schemeId: undefined },
                              })),
                            disabled,
                            !selection.schemeId,
                          )}
                        {!!selection.schemeId &&
                          !product.schemes?.some(
                            (scheme: Row) => scheme.Id === selection.schemeId,
                          ) && (
                            <Text accessibilityRole="alert" style={s.error}>
                              The selected scheme is no longer available. Remove it or choose
                              another offer.
                            </Text>
                          )}
                        {!!selection.schemeId &&
                          !product.schemes?.some(
                            (scheme: Row) => scheme.Id === selection.schemeId,
                          ) &&
                          button(
                            "Remove unavailable scheme",
                            () =>
                              setSelected((old) => ({
                                ...old,
                                [product.Id]: { ...old[product.Id], schemeId: undefined },
                              })),
                            disabled,
                          )}
                      </>
                    )}
                    {!product.schemes?.length && !product.linkedSchemes?.length && (
                      <Text style={s.copy}>
                        No scheme is linked to {product.Name} in Salesforce. A linked offer will
                        appear here automatically.
                      </Text>
                    )}
                    {product.schemes?.map((scheme: Row) => (
                      <View key={scheme.Id} style={s.scheme}>
                        {selection ? (
                          <>
                            {button(
                              scheme.Name,
                              () =>
                                setSelected((old) => ({
                                  ...old,
                                  [product.Id]: { ...old[product.Id], schemeId: scheme.Id },
                                })),
                              disabled ||
                                Number(scheme.Minimum_Cases__c) <= 0 ||
                                Number(selection.cases) < Number(scheme.Minimum_Cases__c),
                              selection.schemeId === scheme.Id,
                            )}
                            {Number(selection.cases) < Number(scheme.Minimum_Cases__c) && (
                              <Text style={s.copy}>
                                Order at least {scheme.Minimum_Cases__c} cases to use this scheme.
                              </Text>
                            )}
                          </>
                        ) : (
                          <Text style={s.label}>{scheme.Name}</Text>
                        )}
                        <Text style={s.copy}>
                          Minimum {scheme.Minimum_Cases__c || "not configured"} cases ·{" "}
                          {scheme.Discount_Percent__c || 0}% discount · ₹
                          {scheme.Discount_Amount__c || 0} discount / buy block ·{" "}
                          {scheme.Free_Cases__c || 0} free cases of{" "}
                          {scheme.Free_Product__r?.Name || product.Name} / buy block
                          {scheme.Free_Gift__c
                            ? ` · ${scheme.Gift_Quantity__c || 0} × ${scheme.Free_Gift__c} / buy block`
                            : ""}
                        </Text>
                      </View>
                    ))}
                    {product.linkedSchemes
                      ?.filter((scheme: Row) => !scheme.applicableToPrimary)
                      .map((scheme: Row) => (
                        <View key={scheme.Id} style={s.scheme}>
                          <Text style={s.label}>{scheme.Name}</Text>
                          <Text style={s.copy}>Not applicable to this primary order</Text>
                          <Text style={s.copy}>{scheme.unavailableReasons.join(" ")}</Text>
                          <Text style={s.copy}>
                            Channel: {scheme.Sales_Channel__c || "Not set"} · Valid:{" "}
                            {scheme.Start_Date__c || "No start date"} to{" "}
                            {scheme.End_Date__c || "No end date"}
                          </Text>
                          <Text style={s.copy}>
                            {scheme.Discount_Percent__c || 0}% discount · ₹
                            {scheme.Discount_Amount__c || 0} fixed discount
                            {scheme.Sales_Channel__c === "Primary"
                              ? ` · Minimum ${scheme.Minimum_Cases__c ?? "not set"} cases · ${scheme.Free_Cases__c || 0} free cases`
                              : ` · Minimum quantity: ${scheme.Minimum_Quantity__c ?? "not set"} · Free quantity: ${scheme.Free_Quantity__c || 0}`}
                          </Text>
                          {!!scheme.Free_Product__r?.Name && (
                            <Text style={s.copy}>Free product: {scheme.Free_Product__r.Name}</Text>
                          )}
                        </View>
                      ))}
                  </View>
                </View>
              );
            })}
          <Text style={s.label}>Selected products: {chosen.length}</Text>
          {chosen.map((p) => (
            <Text key={p.Id} style={s.copy}>
              {p.Name}: {selected[p.Id].cases || "0"} cases
            </Text>
          ))}
          <Text style={s.copy}>
            Base value before scheme discounts and GST: ₹
            {chosen
              .reduce(
                (sum, p) =>
                  sum + (Number(selected[p.Id].cases) || 0) * Number(p.DMS_Case_Price__c || 0),
                0,
              )
              .toFixed(2)}
            . Final payable value is calculated by Salesforce on submission.
          </Text>
          <Text style={s.label}>Order notes (optional)</Text>
          <TextInput
            accessibilityLabel="Primary order notes"
            multiline
            maxLength={1000}
            value={notes}
            onChangeText={setNotes}
            editable={!disabled}
            placeholder="Delivery instructions or remarks"
            placeholderTextColor={colors.muted}
            style={s.input}
          />
          {button(
            "Review order for approval",
            review,
            disabled || loading || !chosen.length || !catalogue.distributor?.Officer__r?.IsActive,
            true,
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          )}
          {!catalogue.distributor?.Officer__r?.IsActive && (
            <Text accessibilityRole="alert" style={s.error}>
              Review is unavailable until an active company officer is assigned in Salesforce.
            </Text>
          )}
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: { padding: 18, borderRadius: 22, backgroundColor: colors.white, marginVertical: 12 },
  heading: { fontSize: 21, fontWeight: "900", color: colors.ink, marginBottom: 10 },
  name: { fontSize: 17, fontWeight: "800", color: colors.ink },
  label: { fontSize: 13, color: colors.ink, fontWeight: "700", marginVertical: 8 },
  copy: { fontSize: 13, color: colors.muted, lineHeight: 20, marginVertical: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    minHeight: 50,
    color: colors.ink,
  },
  product: { borderTopWidth: 1, borderColor: colors.border, marginTop: 18, paddingTop: 18 },
  schemePanel: { backgroundColor: "#F3FAF5", borderRadius: 12, padding: 14, marginTop: 8 },
  scheme: { borderTopWidth: 1, borderColor: colors.border, marginTop: 6, paddingTop: 6 },
  button: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: 14,
    padding: 13,
    minHeight: 48,
    marginVertical: 6,
  },
  selected: { backgroundColor: colors.brand },
  buttonText: { color: colors.brand, fontWeight: "800", textAlign: "center" },
  error: {
    backgroundColor: "#E7F4EB",
    color: "#173D2D",
    padding: 12,
    borderRadius: 12,
    marginVertical: 8,
  },
});
