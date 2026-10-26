// Read-only schema/integration check. Does not authenticate an app user or write records.
import { readFileSync } from "node:fs";
import { salesforce } from "../src/salesforce/SalesforceService.js";
import { DmsTransport, DmsUpstreamError } from "../src/dms/transport.js";
import { distributorDashboard } from "../src/dms/dashboard.js";
import { distributorReports } from "../src/dms/reports.js";
async function main() {
  const id = process.argv[2];
  if (!/^[A-Za-z0-9]{18}$/.test(id || ""))
    throw new Error("Pass the distributor record ID.");
  const source = readFileSync("src/dms/router.ts", "utf8");
  const outletFilter = `SELECT Id FROM Retailer__c WHERE DMS_Distributor__c='${id}'`;
  const block = source.match(
    /const queries:\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\n\s*\};/,
  )?.[1];
  if (!block) throw new Error("DMS query definitions could not be located.");
  let failures = 0;
  for (const match of block.matchAll(/(\w+):\s*`([^`]+)`/g)) {
    const query =
      match[2]
        .replaceAll("${id}", id)
        .replaceAll("${outletFilter}", outletFilter) +
      " ORDER BY CreatedDate DESC LIMIT 200";
    try {
      const rows = await salesforce.records(query);
      console.log(
        JSON.stringify({ list: match[1], ok: true, count: rows.length }),
      );
    } catch (error: any) {
      failures++;
      console.log(
        JSON.stringify({ list: match[1], ok: false, message: error.message }),
      );
    }
  }
  process.exitCode = failures ? 1 : 0;
  try {
    const dashboard = await distributorDashboard(id, (query) =>
      salesforce.records(query),
    );
    console.log(
      JSON.stringify({
        list: "dashboardAggregates",
        ok: true,
        months: dashboard.months.length,
      }),
    );
    const reports = await distributorReports(id, (query) =>
      salesforce.records(query),
    );
    console.log(
      JSON.stringify({
        list: "managementReports",
        ok: true,
        beats: reports.beats.length,
        outlets: reports.coverage.outlets,
        targetConfigured: reports.sales.target !== null,
      }),
    );
    const readTransport = new DmsTransport((refresh) =>
      salesforce.dmsSession(refresh),
    );
    const throughHttp = await distributorReports(id, (query) =>
      readTransport.records(query),
    );
    console.log(
      JSON.stringify({
        list: "reportHttpTransport",
        ok: true,
        outlets: throughHttp.coverage.outlets,
      }),
    );
    const schemeQuery = readFileSync("src/dms/employeeRouter.ts", "utf8").match(
      /const schemes = await deps.records\(\s*"([^"]+)"/,
    )?.[1];
    if (!schemeQuery) throw new Error("Scheme query not found");
    const schemes = await salesforce.records(schemeQuery);
    console.log(
      JSON.stringify({
        list: "primarySchemes",
        ok: true,
        count: schemes.length,
      }),
    );
  } catch (error: any) {
    process.exitCode = 1;
    console.log(
      JSON.stringify({ list: "newQueries", ok: false, message: error.message }),
    );
  }
  // Unsupported command must be rejected before business records are written.
  try {
    await new DmsTransport((refresh) => salesforce.dmsSession(refresh)).command(
      { action: "readOnlyConnectivityProbe", distributorId: id },
    );
    console.log(JSON.stringify({ list: "apexCommandValidation", ok: false }));
    process.exitCode = 1;
  } catch (error) {
    const valid =
      error instanceof DmsUpstreamError &&
      error.status === 400 &&
      error.message === "Unsupported transaction.";
    console.log(JSON.stringify({ list: "apexCommandValidation", ok: valid }));
    if (!valid) process.exitCode = 1;
  }
  const employeeId = process.argv[3];
  if (employeeId && /^[A-Za-z0-9]{18}$/.test(employeeId)) {
    const checks = {
      employee: `SELECT Id,Name,DMS_Distributor__c,DMS_Distributor__r.Name,DMS_Distributor__r.Officer__r.Name FROM Employee__c WHERE Id='${employeeId}' AND Active__c=true AND DMS_Distributor__r.Active__c=true LIMIT 1`,
      primaryCatalogue:
        "SELECT Id,Name,Product_Code__c,Units_Per_Case__c,DMS_Case_Price__c,GST_Percent__c FROM Product__c WHERE Active__c=true AND Sellable__c=true ORDER BY Name LIMIT 2000",
      employeeOrders: `SELECT Id,Name,Status__c,Total_Amount__c,Order_Date__c FROM DMS_Primary_Order__c WHERE Employee__c='${employeeId}' ORDER BY CreatedDate DESC LIMIT 100`,
      employeeReturns: `SELECT Id,Name,Status__c,Total_Amount__c,Return_Date__c FROM DMS_Primary_Return__c WHERE Employee__c='${employeeId}' ORDER BY CreatedDate DESC LIMIT 100`,
      receiptLines: `SELECT Id,Product__r.Name,Received_Cases__c,Case_Cost__c,Batch_Number__c,Expiry_Date__c FROM DMS_Goods_Receipt_Line__c WHERE Goods_Receipt__r.Distributor__c='${id}' AND Goods_Receipt__r.Status__c='Received' ORDER BY CreatedDate DESC LIMIT 200`,
    };
    for (const [list, query] of Object.entries(checks))
      try {
        const rows = await salesforce.records(query);
        console.log(JSON.stringify({ list, ok: true, count: rows.length }));
      } catch (error: any) {
        process.exitCode = 1;
        console.log(
          JSON.stringify({ list, ok: false, message: error.message }),
        );
      }
  }
}
void main().catch(() => {
  console.error(
    "DMS query diagnostic failed. Check Salesforce authentication.",
  );
  process.exitCode = 1;
});
