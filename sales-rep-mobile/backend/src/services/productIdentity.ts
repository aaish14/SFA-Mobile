/** Always include the three Salesforce product identity fields in API responses. */
export function productIdentity(row: {
  Brand__c?: string | null;
  Sub_Brand__c?: string | null;
  Brand_Alias__c?: string | null;
}) {
  return {
    brand: row.Brand__c ?? "",
    subBrand: row.Sub_Brand__c ?? "",
    brandAlias: row.Brand_Alias__c ?? "",
  };
}
