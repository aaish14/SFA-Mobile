import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ values: [] as any[], index: 0 }));
const connection = vi.hoisted(() => ({ getApiBaseUrl: vi.fn(), saveApiBaseUrl: vi.fn() }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: any) => {
    const index = state.index++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (value: any) => { state.values[index] = value; }];
  },
}));
vi.mock("react-native", () => ({
  Modal: "Modal", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput", View: "View",
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("./ui", () => ({ Button: "Button" }));
vi.mock("../api/connection", () => connection);
import ServerConnectionButton from "./ServerConnectionButton";

function find(node: any, type: string): any[] {
  if (!React.isValidElement(node)) return [];
  return [...(node.type === type ? [node] : []), ...React.Children.toArray((node.props as any).children).flatMap(child => find(child, type))];
}
function render(props: React.ComponentProps<typeof ServerConnectionButton> = {}) {
  state.index = 0;
  return ServerConnectionButton(props);
}
beforeEach(() => {
  state.values = []; state.index = 0; vi.resetAllMocks();
  connection.getApiBaseUrl.mockResolvedValue("https://existing.example.com/api");
});
describe("server connection recovery controls", () => {
  it("opens with the current address but never saves it without confirmation", async () => {
    await find(render(), "Button")[0].props.onPress();
    expect(find(render(), "Modal")[0].props.visible).toBe(true);
    expect(find(render(), "TextInput")[0].props.value).toBe("https://existing.example.com/api");
    expect(connection.saveApiBaseUrl).not.toHaveBeenCalled();
  });
  it("retains entered text and shows errors when the server check fails", async () => {
    await find(render(), "Button")[0].props.onPress();
    find(render(), "TextInput")[0].props.onChangeText("https://new.example.com/api");
    connection.saveApiBaseUrl.mockRejectedValue(new Error("Cannot reach the server"));
    await find(render(), "Button").find(button => button.props.title === "Check & use this address").props.onPress();
    expect(find(render(), "Modal")[0].props.visible).toBe(true);
    expect(JSON.stringify(render())).toContain("Cannot reach the server");
    expect(find(render(), "TextInput")[0].props.value).toBe("https://new.example.com/api");
  });
  it("closes and reports success only after the explicit save succeeds", async () => {
    const onSaved = vi.fn();
    await find(render({ onSaved }), "Button")[0].props.onPress();
    connection.saveApiBaseUrl.mockResolvedValue("https://existing.example.com/api");
    await find(render({ onSaved }), "Button").find(button => button.props.title === "Check & use this address").props.onPress();
    expect(onSaved).toHaveBeenCalledOnce();
    expect(find(render(), "Modal")[0].props.visible).toBe(false);
  });
  it("cancel never changes the connection", async () => {
    await find(render(), "Button")[0].props.onPress();
    find(render(), "Button").find(button => button.props.title === "Cancel").props.onPress();
    expect(find(render(), "Modal")[0].props.visible).toBe(false);
    expect(connection.saveApiBaseUrl).not.toHaveBeenCalled();
  });
});
