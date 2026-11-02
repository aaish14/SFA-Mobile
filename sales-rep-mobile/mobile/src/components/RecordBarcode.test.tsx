import React from "react";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { describe, expect, it, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ values: [] as any[], index: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: any) => {
    const index = state.index++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (value: any) => {
      state.values[index] = typeof value === "function" ? value(state.values[index]) : value;
    }];
  },
}));
vi.mock("react-native", () => ({
  View: "View", Text: "Text", Image: "Image", Pressable: "Pressable",
  StyleSheet: { create: (styles: unknown) => styles },
}));
import RecordBarcode from "./RecordBarcode";

const barcode = { format: "CODE128" as const, value: "P-a0P000000000001AAA", image: "data:image/png;base64,fixture", width: 600, height: 100 };
/** Walk rendered elements without mounting a native runtime or issuing network requests. */
function find(node: any, type: string): any[] {
  if (!React.isValidElement(node)) return [];
  const props = node.props as any;
  return [...(node.type === type ? [node] : []), ...React.Children.toArray(props.children).flatMap(child => find(child, type))];
}
function render(props: Partial<React.ComponentProps<typeof RecordBarcode>> = {}) {
  state.index = 0;
  return RecordBarcode({ barcode, label: "Product barcode", children: "SKU details", ...props });
}
beforeEach(() => { state.values = []; state.index = 0; });
describe("traditional barcode interactions", () => {
  it("reveals and hides the current product details when tapped", () => {
    let tree = render();
    expect(JSON.stringify(tree)).not.toContain("SKU details");
    find(tree, "Pressable")[0].props.onPress();
    tree = render();
    expect(JSON.stringify(tree)).toContain("SKU details");
    find(tree, "Pressable")[0].props.onPress();
    expect(JSON.stringify(render())).not.toContain("SKU details");
  });
  it("opens an invoice instead of treating it as a product", () => {
    const open = vi.fn();
    find(render({ onPress: open }), "Pressable")[0].props.onPress();
    expect(open).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(render({ onPress: open }))).not.toContain("SKU details");
  });
  it("keeps the whole image aspect ratio within a narrow screen", () => {
    const tree = render();
    const layout = find(tree, "View").find(view => view.props.onLayout);
    layout.props.onLayout({ nativeEvent: { layout: { width: 242 } } });
    expect(find(render(), "Image")[0].props.style).toEqual({ width: 240, height: 40 });
  });
  it("disables both tap targets while loading", () => {
    expect(find(render({ disabled: true }), "Pressable").every(button => button.props.disabled)).toBe(true);
  });
  it("hides missing codes and refuses externally hosted images", () => {
    expect(render({ barcode: null })).toBeNull();
    expect(render({ barcode: { ...barcode, image: "https://example.invalid/code" } })).toBeNull();
  });
  it("keeps the portal and mobile invoice/barcode behavior identical", () => {
    for (const name of ["RecordBarcode.tsx", "InvoiceList.tsx"]) {
      const local = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
      const portal = readFileSync(new URL(`../../../../dms-mobile/src/components/${name}`, import.meta.url), "utf8");
      expect(local).toBe(portal);
    }
  });
});
