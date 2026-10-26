type ReadRecords = (query: string) => Promise<any[]>;

/** Read-only catalogue; final eligibility and all financial values are owned by Apex. */
export async function primaryCatalogue(distributor: any, records: ReadRecords) {
  const products = await records(
    "SELECT Id,Name,Product_Code__c,Units_Per_Case__c,DMS_Case_Price__c,GST_Percent__c FROM Product__c WHERE Active__c=true AND Sellable__c=true ORDER BY Name",
  );
  const schemes = await records(
    "SELECT Id,Name,Product__c,Region__c,Minimum_Cases__c,Free_Cases__c,Free_Product__r.Name,Discount_Percent__c,Discount_Amount__c,Free_Gift__c,Gift_Quantity__c,(SELECT Product__c FROM Scheme_Products__r WHERE Active__c=true) FROM Scheme__c WHERE Active__c=true AND Sales_Channel__c='Primary' AND Outlet_Type__c=null AND (Start_Date__c=null OR Start_Date__c<=TODAY) AND (End_Date__c=null OR End_Date__c>=TODAY) ORDER BY Name",
  );
  return {
    distributor,
    products: products.map((product) => ({
      ...product,
      schemes: schemes.filter(
        (scheme) =>
          (!scheme.Region__c || scheme.Region__c === distributor.Geography__r?.Name) &&
          (scheme.Product__c === product.Id ||
            scheme.Scheme_Products__r?.records?.some(
              (link: any) => link.Product__c === product.Id,
            )),
      ),
    })),
    retrievedAt: new Date().toISOString(),
  };
}
