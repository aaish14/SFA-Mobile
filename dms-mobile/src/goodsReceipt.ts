type ReceiptPricingLine = {
  receiptKind?: string;
  Case_Price__c?: unknown;
  Discount_Amount__c?: unknown;
  Cases__c?: unknown;
};

/**
 * Preview the receipt value using the approved order's price and allocated discount.
 * Match Salesforce's two-decimal Case_Cost__c before multiplying received cases;
 * receipt inventory cost excludes GST and free scheme cases carry zero cost.
 * This is display-only: Salesforce recalculates the saved value independently.
 */
export function goodsReceiptAmount(line: ReceiptPricingLine, enteredCases: string) {
  const free = line.receiptKind === "Free";
  const quantity = Number(enteredCases);
  const cases = Number.isInteger(quantity) && quantity > 0 && quantity <= 100000
    ? quantity : null;
  let pricePaise = 0;
  let costPaise = 0;
  if (!free) {
    if (line.Case_Price__c == null || line.Case_Price__c === "") return null;
    const price = Number(line.Case_Price__c);
    const discount = Number(line.Discount_Amount__c ?? 0);
    const orderedCases = Number(line.Cases__c);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(discount) || discount < 0 ||
        !Number.isInteger(orderedCases) || orderedCases <= 0) return null;
    pricePaise = Math.round((price + Number.EPSILON) * 100);
    const discountPaise = Math.round((discount + Number.EPSILON) * 100);
    const netOrderPaise = pricePaise * orderedCases - discountPaise;
    if (!Number.isSafeInteger(netOrderPaise) || netOrderPaise < 0) return null;
    costPaise = Math.round(netOrderPaise / orderedCases);
  }
  if (cases !== null && !Number.isSafeInteger(costPaise * cases)) return null;
  return {
    free,
    cases,
    casePrice: pricePaise / 100,
    discountPerCase: (pricePaise - costPaise) / 100,
    caseCost: costPaise / 100,
    total: cases === null ? null : (costPaise * cases) / 100,
  };
}

/** Accept the displayed ISO format and the unambiguous Indian day-first format. */
export function receiptExpiry(value: string): string | null {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const dayFirst = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text);
  if (!iso && !dayFirst) return null;
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(dayFirst![3]), Number(dayFirst![2]), Number(dayFirst![1])];
  if (year < 1900 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Validate whole-case quantity, approved limit, batch and expiry before review, returning either
 * a readable error or a normalized receipt payload.
 */
export function validateGoodsReceipt(
  cases: string,
  batch: string,
  expiry: string,
  approvedCases?: number,
) {
  const quantity = Number(cases);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 100000)
    return { error: "Enter received cases as a whole number between 1 and 100,000." };
  if (approvedCases !== undefined && (!Number.isFinite(approvedCases) || approvedCases <= 0))
    return {
      error:
        "No approved cases are available for this receipt. Refresh the order before continuing.",
    };
  if (approvedCases !== undefined && quantity > approvedCases)
    return {
      error: `This order approves ${approvedCases} case(s), but you entered ${quantity}. Enter only the cases actually delivered, within the approved quantity. Salesforce also checks any previous receipts.`,
    };
  if (!batch.trim() || batch.trim().length > 80)
    return { error: "Enter a batch number of 1–80 characters." };
  const date = receiptExpiry(expiry);
  if (!date) return { error: "Enter a valid expiry date, for example 2026-12-14 or 14-12-2026." };
  return { value: { cases: quantity, batch: batch.trim(), expiry: date } };
}
