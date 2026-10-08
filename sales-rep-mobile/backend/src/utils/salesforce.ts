export function escapeSoqlLiteral(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function requireSalesforceId(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9]{15,18}$/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}
