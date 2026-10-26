/**
 * Escape backslashes and apostrophes in a SOQL string literal. Object and field identifiers must
 * still come from trusted code.
 */
export function escapeSoqlLiteral(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Validate the existing alphanumeric identifier length rule and return the value, or throw an
 * error with the caller-provided label.
 */
export function requireSalesforceId(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9]{15,18}$/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}
