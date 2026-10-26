import React from "react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  StyleSheet: { create: (styles: unknown) => styles },
}));
import VisitField from "./VisitField";

/**
 * Read rendered child elements for component-level assertions.
 */
function children(props: Parameters<typeof VisitField>[0]) {
  return React.Children.toArray(VisitField(props).props.children) as React.ReactElement<any>[];
}

describe("Outlet Visit field guidance", () => {
  it("retains the visible label after entering a quantity", () => {
    const [label, input] = children({ label: "Quantity", placeholder: "e.g. 10", value: "12" });
    expect(label.props.children).toBe("Quantity");
    expect(input.props.value).toBe("12");
    expect(input.props.accessibilityLabel).toBe("Quantity");
    expect(input.props.placeholderTextColor).toBe("#627873");
    expect(input.props.style[1].color).toBeTruthy();
  });
  it("uses existing hints as labels for the other visit forms", () => {
    const [label] = children({ placeholder: "Return quantity" });
    expect(label.props.children).toBe("Return quantity");
  });
  it("preserves input behavior and multiline notes", () => {
    const onChangeText = vi.fn();
    const [, input] = children({
      placeholder: "Notes",
      multiline: true,
      keyboardType: "default",
      onChangeText,
    });
    input.props.onChangeText("Retailer requested a follow-up");
    expect(onChangeText).toHaveBeenCalledWith("Retailer requested a follow-up");
    expect(input.props.multiline).toBe(true);
    expect(input.props.style[2].textAlignVertical).toBe("top");
  });
  it("covers every input on the Outlet Visit screen, including quantity and discount", () => {
    const source = readFileSync(new URL("../screens/VisitScreen.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("<TextInput");
    expect(source.match(/<VisitField\b/g)?.length).toBeGreaterThan(20);
    expect(source).toContain('label="Quantity"');
    expect(source).toContain('label="Discount (₹)"');
  });
});
