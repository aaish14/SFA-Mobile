import { salesforce } from "../salesforce/SalesforceService.js";
import { objectMap } from "../config/env.js";
import { escapeSoqlLiteral } from "../utils/salesforce.js";
import type { VisitPayload } from "../types.js";

/** Salesforce, not server memory, owns the visit after check-in. */
export async function restoreVisit(
  visitId: string,
  employeeId: string,
): Promise<VisitPayload | undefined> {
  const safeId = escapeSoqlLiteral(visitId);
  const rows = await salesforce.records(
    `SELECT Id, Name, Employee__c, Retailer__c, Retailer__r.Name, Status__c, Notes__c, Mobile_Order_Draft__c, Check_In_Time__c, Check_Out_Time__c, Check_In_Latitude__c, Check_In_Longitude__c, Check_Out_Latitude__c, Check_Out_Longitude__c, Permanent_Journey_Plan__r.Beat__r.Name FROM ${objectMap.visit} WHERE Id = '${safeId}' AND Employee__c = '${escapeSoqlLiteral(employeeId)}' LIMIT 1`,
  );
  if (!rows.length) return undefined;
  const row = rows[0];
  const [items, returns, competitors, tickets, refusals, stocks, assets] = await Promise.all([
    salesforce.records(
      `SELECT Id, Product__c, Product__r.Name, Piece_Quantity__c, Unit_Price__c, Line_Amount__c, Scheme__c, Scheme__r.Name, Product_Sales_Configuration__c FROM ${objectMap.orderItem} WHERE Sales_Order__r.Visit__c = '${safeId}' ORDER BY CreatedDate`,
    ),
    salesforce.records(
      `SELECT Id, Product__r.Name, Quantity__c, Return_Reason__c FROM ${objectMap.returns} WHERE Visit__c = '${safeId}'`,
    ),
    salesforce.records(
      `SELECT Id, Competitor_Name__c, Company__c FROM ${objectMap.competitor} WHERE Visit__c = '${safeId}'`,
    ),
    salesforce.records(
      `SELECT Id, Subject__c, Status__c FROM ${objectMap.ticket} WHERE Visit__c = '${safeId}'`,
    ),
    salesforce.records(
      `SELECT Id, Product__c, Reason__c FROM ${objectMap.productRefusal} WHERE Visit__c = '${safeId}'`,
    ),
    salesforce.records(
      `SELECT Id, Product__r.Name, Quantity__c FROM ${objectMap.stockCheck} WHERE Visit__c = '${safeId}'`,
    ),
    salesforce.records(
      `SELECT Id, Asset_Name__c, Status__c FROM ${objectMap.assetSurvey} WHERE Visit__c = '${safeId}'`,
    ),
  ]);
  let draft = [];
  try {
    draft = JSON.parse(row.Mobile_Order_Draft__c || "[]");
  } catch {
    /* Older or manually edited drafts must not hide submitted orders. */
  }
  return {
    id: row.Id,
    employeeId: row.Employee__c,
    storeId: row.Retailer__c,
    storeName: row.Retailer__r?.Name || row.Name,
    beatName: row.Permanent_Journey_Plan__r?.Beat__r?.Name || "",
    status: row.Status__c,
    remarks: row.Notes__c,
    checkIn: {
      latitude: row.Check_In_Latitude__c,
      longitude: row.Check_In_Longitude__c,
      timestamp: row.Check_In_Time__c,
    },
    checkOut: row.Check_Out_Time__c
      ? {
          latitude: row.Check_Out_Latitude__c,
          longitude: row.Check_Out_Longitude__c,
          timestamp: row.Check_Out_Time__c,
        }
      : undefined,
    orderSubmitted: items.length > 0,
    orderLines: items.length
      ? items.map((item) => ({
          productId: item.Product__c,
          productName: item.Product__r?.Name,
          quantity: Number(item.Piece_Quantity__c),
          unitPrice: Number(item.Unit_Price__c),
          discount: 0,
          amount: Number(item.Line_Amount__c),
          schemeId: item.Scheme__c,
          schemeName: item.Scheme__r?.Name,
          configurationId: item.Product_Sales_Configuration__c,
        }))
      : Array.isArray(draft)
        ? draft
        : [],
    returns,
    competitors,
    tickets,
    stocks,
    assets,
    refusedProductIds: refusals.map((refusal) => refusal.Product__c),
  };
}
