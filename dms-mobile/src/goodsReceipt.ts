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
