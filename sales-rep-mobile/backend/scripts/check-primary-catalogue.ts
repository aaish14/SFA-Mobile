// Live, read-only verification using the production Salesforce transport.
import { salesforce } from "../src/salesforce/SalesforceService.js";
import { DmsTransport } from "../src/dms/transport.js";
import { primaryCatalogue } from "../src/dms/primaryCatalogue.js";
async function main() {
  const transport = new DmsTransport(refresh => salesforce.dmsSession(refresh));
  const distributors = await transport.records("SELECT Id,Name,Officer__r.Name,Officer__r.IsActive,Geography__r.Name FROM DMS_Distributor__c WHERE Active__c=true ORDER BY Name");
  for(const distributor of distributors) {
    const result = await primaryCatalogue(distributor, q => transport.records(q));
    console.log(JSON.stringify({ distributor: distributor.Name, officer: distributor.Officer__r?.Name,
      products: result.products.length,
      readyProducts: result.products.filter(p => Number(p.DMS_Case_Price__c)>0 && Number.isInteger(Number(p.Units_Per_Case__c)) && Number(p.Units_Per_Case__c)>0).length,
      applicableSchemes: new Set(result.products.flatMap(p => p.schemes.map((s: any) => s.Id))).size,
    }));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
