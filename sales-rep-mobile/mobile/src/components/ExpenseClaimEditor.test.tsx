import React from "react";
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({
  View: "View", Text: "Text", TextInput: "TextInput", Pressable: "Pressable",
  StyleSheet: { create: (styles: unknown) => styles },
}));
import ExpenseClaimEditor, { ExpenseField } from "./ExpenseClaimEditor";

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  return React.Children.toArray(node).flatMap((child) => React.isValidElement<any>(child)
    ? [child, ...elements((child as React.ReactElement<{ children?: React.ReactNode }>).props.children)] : []);
}
function fields(category = "Mobile Internet", receiptRequired = true) {
  return elements(ExpenseClaimEditor({ policy: { name: "Monthly Internet", category, receiptRequired }, form: {}, update: vi.fn() }))
    .filter((element) => element.type === ExpenseField);
}

describe("expense field guidance", () => {
  it("gives all four ordinary claim fields persistent labels and example placeholders", () => {
    const inputs = fields();
    expect(inputs).toHaveLength(4);
    for (const input of inputs) {
      expect(input.props.label).toBeTruthy();
      expect(input.props.placeholder).toBeTruthy();
    }
    expect(inputs[0].props.label).toContain("required");
    expect(inputs[1].props.hint).toContain("Leave blank");
  });
  it("adds labelled odometer fields for vehicle claims", () => {
    expect(fields("Two Wheeler").map((field) => field.props.label)).toContain("Start odometer (km) — optional");
    expect(fields("Four Wheeler")).toHaveLength(6);
  });
  it("shows whether receipt evidence is required by the policy", () => {
    expect(fields()[2].props.label).toContain("required");
    expect(fields("Food", false)[2].props.label).toContain("optional");
  });
  it("explicitly colors hints and preserves the label after typing", () => {
    const tree = elements(ExpenseField({ label: "Claim amount", value: "200", placeholder: "e.g. 200" }));
    expect(tree.some((element) => element.props.children === "Claim amount")).toBe(true);
    const input = tree.find((element) => element.props.accessibilityLabel === "Claim amount")!;
    expect(input.props.placeholderTextColor).toBe("#627873");
    expect(input.props.value).toBe("200");
  });
  it("keeps each field connected to the existing claim payload", () => {
    const update = vi.fn();
    const tree = elements(ExpenseClaimEditor({ policy: { name: "Petrol", category: "Two Wheeler", receiptRequired: true }, form: { amount: "200" }, update }));
    const inputs = tree.filter((element) => element.type === ExpenseField);
    expect(inputs[0].props.value).toBe("200");
    inputs.forEach((input) => input.props.onChangeText("test"));
    expect(update.mock.calls.map(([key]) => key)).toEqual(["amount", "distanceKm", "startOdometer", "endOdometer", "receiptUrl", "remarks"]);
  });
});
