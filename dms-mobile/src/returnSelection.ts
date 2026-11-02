export type ReturnItem = {
  id: string; productId?: string; product: string; orderId?: string; order?: string;
  receiptId?: string; receipt?: string; outlet?: string; batch?: string; expiry?: string;
  original: number; reserved: number; available: number;
};
export type ReturnSelection = { quantity: string; reason: string; notes: string };
export type ReturnOrder = { key: string; id?: string; name: string; outlet?: string; items: ReturnItem[]; status?: string; products?: string[] };

/** Keep identical product names on different orders separate, including receipt batches. */
export function groupReturnOrders(items: ReturnItem[]): ReturnOrder[] {
  const orders = new Map<string, ReturnOrder>();
  for (const item of items) {
    const key = item.orderId || `receipt:${item.receiptId || item.id}`;
    if (!orders.has(key)) orders.set(key, {
      key, id: item.orderId, name: item.order || `Receipt ${item.receipt || "without a linked order"}`,
      outlet: item.outlet, items: [],
    });
    orders.get(key)!.items.push(item);
  }
  return [...orders.values()];
}

/** Select the remaining received/ordered quantity, never already reserved or rejected balances. */
export function selectWholeReturnOrder(items: ReturnItem[]): Record<string, ReturnSelection> {
  const eligible = items.filter(item => item.available > 0);
  if (!eligible.length || eligible.length > 50 || eligible.some(item => !Number.isInteger(item.available) || item.available > 100000))
    throw new Error("Choose 1–50 returnable lines, with no more than 100,000 whole units per line.");
  return Object.fromEntries(eligible.map(item => [item.id, { quantity: String(item.available), reason: "", notes: "" }]));
}
