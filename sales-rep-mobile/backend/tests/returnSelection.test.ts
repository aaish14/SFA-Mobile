import { describe, expect, it } from "vitest";
import { groupReturnOrders, selectWholeReturnOrder } from "../../../dms-mobile/src/returnSelection";
const first="a0R000000000001AAA", second="a0R000000000002AAA", order="a0S000000000001AAA";

describe("whole-order return selection", () => {
  const item = { id: first, product: "Same product", orderId: order, order: "SO-1", original: 10, reserved: 3, available: 7 };
  it("groups by order ID instead of product labels and keeps receipt batches", () => {
    const groups = groupReturnOrders([item, { ...item, id: second }, { ...item, id: "third", orderId: "other-order" }]);
    expect(groups.map(group => group.items.length)).toEqual([2, 1]);
  });
  it("selects only the full remaining balance and skips fully returned lines", () => {
    expect(selectWholeReturnOrder([item, { ...item, id: second, available: 0 }])).toEqual({ [first]: { quantity: "7", reason: "", notes: "" } });
  });
  it("never silently clips a full order to the request limit", () => {
    expect(() => selectWholeReturnOrder(Array.from({ length: 51 }, (_, n) => ({ ...item, id: String(n) })))).toThrow();
  });
});
