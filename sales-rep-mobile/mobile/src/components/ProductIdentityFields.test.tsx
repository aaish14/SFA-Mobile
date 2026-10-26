import React from "react";
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  StyleSheet: { create: (styles: unknown) => styles },
}));
import ProductIdentityFields from "./ProductIdentityFields";
import { nextProduct } from "../utils/productSelection";

const products = [
  { id: "one", brand: "Brand A", subBrand: "Range A", brandAlias: "Alias A" },
  { id: "two", brand: "Brand B", subBrand: "Range B", brandAlias: "Alias B" },
];
/**
 * Extract displayed content from the rendered test tree for identity-field assertions.
 */
function displayed(product?: Parameters<typeof ProductIdentityFields>[0]["product"]) {
  const fields = React.Children.toArray(
    ProductIdentityFields({ product }).props.children,
  ) as React.ReactElement<any>[];
  return fields.map(
    (field) =>
      (React.Children.toArray(field.props.children)[1] as React.ReactElement<any>).props
        .accessibilityLabel,
  );
}
describe("selected product identity", () => {
  it("changes all three displayed fields when Next Product selects another product", () => {
    expect(displayed(products[0])).toEqual([
      "BRAND: Brand A",
      "SUB-BRAND: Range A",
      "ALIAS: Alias A",
    ]);
    expect(displayed(nextProduct(products, "one"))).toEqual([
      "BRAND: Brand B",
      "SUB-BRAND: Range B",
      "ALIAS: Alias B",
    ]);
  });
  it("wraps to the first product and respects the filtered product list", () => {
    expect(nextProduct(products, "two")).toBe(products[0]);
    expect(nextProduct([products[1]], "one")).toBe(products[1]);
  });
  it("never retains another product's missing metadata", () => {
    expect(displayed({ brand: "Brand C" })).toEqual([
      "BRAND: Brand C",
      "SUB-BRAND: Not set in Salesforce",
      "ALIAS: Not set in Salesforce",
    ]);
  });
  it("handles an empty catalogue", () => {
    expect(nextProduct([], "one")).toBeUndefined();
    expect(displayed()).toEqual([
      "BRAND: No product selected",
      "SUB-BRAND: No product selected",
      "ALIAS: No product selected",
    ]);
  });
});
