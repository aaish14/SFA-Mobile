import { recordBarcode } from "../services/barcode.js";
type ReadRecords = (query: string) => Promise<any[]>;

/** A bonus/free product is not a paid-product link. Only explicit product assignments count. */
function linkedToProduct(scheme: any, productId: string): boolean {
  return (
    scheme.Product__c === productId ||
    !!scheme.Scheme_Products__r?.records?.some((link: any) => link.Product__c === productId)
  );
}

/** Explain a linked offer without changing the Apex rules that control primary pricing. */
function unavailableReasons(scheme: any, distributor: any): string[] {
  const reasons: string[] = [];
  if (scheme.Sales_Channel__c !== "Primary")
    reasons.push(
      scheme.Sales_Channel__c
        ? "This is a Secondary scheme."
        : "Primary / Secondary is not set in Salesforce.",
    );
  if (!scheme.Active__c) reasons.push("The scheme is inactive.");
  if (scheme.Outlet_Type__c) reasons.push(`Restricted to ${scheme.Outlet_Type__c} outlets.`);
  if (scheme.Region__c && scheme.Region__c !== distributor.Geography__r?.Name)
    reasons.push(`Restricted to ${scheme.Region__c}.`);
  // The primary query uses Salesforce TODAY, matching Apex rather than the browser's date.
  if (!reasons.length) reasons.push("Outside the scheme's active dates.");
  return reasons;
}

/** Read-only catalogue; final eligibility and all financial values are owned by Apex. */
export async function primaryCatalogue(distributor: any, records: ReadRecords) {
  const products = await records(
    "SELECT Id,Name,Product_Code__c,Brand__c,Sub_Brand__c,Brand_Alias__c,Units_Per_Case__c,DMS_Case_Price__c,GST_Percent__c FROM Product__c WHERE Active__c=true AND Sellable__c=true ORDER BY Name",
  );
  const schemes = await records(
    "SELECT Id,Name,Product__c,Region__c,Minimum_Cases__c,Free_Cases__c,Free_Product__r.Name,Discount_Percent__c,Discount_Amount__c,Free_Gift__c,Gift_Quantity__c,(SELECT Product__c FROM Scheme_Products__r WHERE Active__c=true) FROM Scheme__c WHERE Active__c=true AND Sales_Channel__c='Primary' AND Outlet_Type__c=null AND (Start_Date__c=null OR Start_Date__c<=TODAY) AND (End_Date__c=null OR End_Date__c>=TODAY) ORDER BY Name",
  );
  const linkedOffers = await records(
    "SELECT Id,Name,Product__c,Sales_Channel__c,Active__c,Region__c,Outlet_Type__c,Start_Date__c,End_Date__c,Minimum_Cases__c,Minimum_Quantity__c,Free_Cases__c,Free_Quantity__c,Free_Product__r.Name,Discount_Percent__c,Discount_Amount__c,Free_Gift__c,Gift_Quantity__c,(SELECT Product__c FROM Scheme_Products__r WHERE Active__c=true) FROM Scheme__c ORDER BY Name",
  );
  return {
    distributor,
    products: await Promise.all(
      products.map(async (product) => {
        const applicable = schemes.filter(
          (scheme) =>
            (!scheme.Region__c || scheme.Region__c === distributor.Geography__r?.Name) &&
            linkedToProduct(scheme, product.Id),
        );
        const applicableIds = new Set(applicable.map((scheme) => scheme.Id));
        return {
          ...product,
          barcode: await recordBarcode("product", product.Id),
          schemes: applicable,
          linkedSchemes: linkedOffers
            .filter((scheme) => linkedToProduct(scheme, product.Id))
            .map((scheme) => ({
              ...scheme,
              applicableToPrimary: applicableIds.has(scheme.Id),
              unavailableReasons: applicableIds.has(scheme.Id)
                ? []
                : unavailableReasons(scheme, distributor),
            })),
        };
      }),
    ),
    retrievedAt: new Date().toISOString(),
  };
}
