import { recordBarcode } from "../services/barcode.js";
import { DmsUpstreamError } from "./transport.js";

type Row = Record<string, any>;
type Records = (query: string) => Promise<Row[]>;
export const secondaryReturnFields = "Id,Name,DMS_Distributor__c,Outlet__r.Name,Product__c,Product__r.Name,Quantity__c,Return_Reason__c,Return_Notes__c,Order_Item__c,Order_Item__r.Sales_Order__c,Order_Item__r.Sales_Order__r.Name,Mobile_Request_Key__c,DMS_Status__c,DMS_Decision_Notes__c";

/** Only the application-generated distributor/request/line key can join return lines. */
export function secondaryReturnPrefix(row: Row): string | null {
  const match = /^([A-Za-z0-9]{18}:[A-Za-z0-9-]{16,50}:)[A-Za-z0-9]{18}$/.exec(row.Mobile_Request_Key__c || "");
  return match && match[1].startsWith(`${row.DMS_Distributor__c}:`) ? match[1] : null;
}

/** Preserve one approval card per submitted order, while keeping legacy single returns usable. */
export function groupSecondaryReturns(rows: Row[]): Row[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = `${secondaryReturnPrefix(row) || row.Id}:${row.Order_Item__r?.Sales_Order__c || ""}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.values()].map(lines => {
    const statuses = new Set(lines.map(line => line.DMS_Status__c || "Pending"));
    return { ...lines[0], lines, DMS_Status__c: statuses.size === 1 ? [...statuses][0] : "Mixed decisions" };
  });
}

/** Build an authenticated Salesforce page URL; never embed a session token in a barcode or link. */
export function salesforceReturnUrl(origin: string | undefined, id: string): string | undefined {
  if (!origin) return;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.endsWith(".salesforce.com")) return;
    return `${url.origin}/apex/DmsReturnReview?id=${id}`;
  } catch { return; }
}

/** Load a saved request and its original order under the distributor's existing authenticated scope. */
export async function returnReview(kind: "primary" | "secondary", id: string, distributorId: string, records: Records, origin?: string) {
  let title: string, status: string, approver: string, lines: Row[], orderedLines: Row[];
  if (kind === "primary") {
    const [header] = await records(`SELECT Id,Name,Status__c,Officer__r.Name,Primary_Order__c FROM DMS_Primary_Return__c WHERE Id='${id}' AND Distributor__c='${distributorId}' LIMIT 1`);
    if (!header) throw new DmsUpstreamError(404, "Return not found for your distributor.");
    title = header.Name; status = header.Status__c; approver = header.Officer__r?.Name || "Company officer";
    const saved = await records(`SELECT Id,Product__c,Product__r.Name,Cases__c,Reason__c,Notes__c,Batch_Number__c,Receipt_Line__r.Goods_Receipt__r.Primary_Order__c,Receipt_Line__r.Goods_Receipt__r.Primary_Order__r.Name FROM DMS_Primary_Return_Line__c WHERE Primary_Return__c='${id}' ORDER BY Id LIMIT 501`);
    if (saved.length > 500) throw new DmsUpstreamError(409, "Open this large return in Salesforce.");
    lines = saved.map(line => ({ id: line.Id, productId: line.Product__c, product: line.Product__r?.Name, quantity: line.Cases__c, reason: line.Reason__c, notes: line.Notes__c, batch: line.Batch_Number__c, order: line.Receipt_Line__r?.Goods_Receipt__r?.Primary_Order__r?.Name }));
    const orderIds = [...new Set([header.Primary_Order__c, ...saved.map(line => line.Receipt_Line__r?.Goods_Receipt__r?.Primary_Order__c)].filter(value => /^[A-Za-z0-9]{18}$/.test(value || "")))];
    orderedLines = orderIds.length ? (await records(`SELECT Id,Product__c,Product__r.Name,Cases__c,Free_Cases__c,Order__r.Name FROM DMS_Primary_Order_Line__c WHERE Order__c IN ('${orderIds.join("','")}') AND Order__r.Distributor__c='${distributorId}' ORDER BY Id LIMIT 501`)).map(line => ({ product: line.Product__r?.Name, quantity: line.Cases__c, free: line.Free_Cases__c || 0, order: line.Order__r?.Name })) : [];
  } else {
    const [anchor] = await records(`SELECT ${secondaryReturnFields} FROM Product_Return__c WHERE Id='${id}' AND DMS_Distributor__c='${distributorId}' LIMIT 1`);
    if (!anchor) throw new DmsUpstreamError(404, "Return not found for your distributor.");
    const prefix = secondaryReturnPrefix(anchor), orderId = anchor.Order_Item__r?.Sales_Order__c;
    const saved = prefix ? await records(`SELECT ${secondaryReturnFields} FROM Product_Return__c WHERE DMS_Distributor__c='${distributorId}' AND Mobile_Request_Key__c LIKE '${prefix}%'${orderId ? ` AND Order_Item__r.Sales_Order__c='${orderId}'` : " AND Order_Item__c=null"} ORDER BY Id LIMIT 51`) : [anchor];
    if (saved.length > 50) throw new DmsUpstreamError(409, "Open this large return in Salesforce.");
    title = anchor.Name; status = groupSecondaryReturns(saved)[0]?.DMS_Status__c || anchor.DMS_Status__c; approver = "Distributor";
    lines = saved.map(line => ({ id: line.Id, name: line.Name, productId: line.Product__c, product: line.Product__r?.Name, quantity: line.Quantity__c, reason: line.Return_Reason__c, notes: line.Return_Notes__c, status: line.DMS_Status__c, order: line.Order_Item__r?.Sales_Order__r?.Name }));
    orderedLines = orderId ? (await records(`SELECT Id,Product__r.Name,Piece_Quantity__c,Sales_Order__r.Name FROM Order_Item__c WHERE Sales_Order__c='${orderId}' AND Sales_Order__r.DMS_Distributor__c='${distributorId}' ORDER BY Id LIMIT 501`)).map(line => ({ product: line.Product__r?.Name, quantity: line.Piece_Quantity__c, order: line.Sales_Order__r?.Name })) : [];
  }
  if (orderedLines.length > 500) throw new DmsUpstreamError(409, "Open this large order in Salesforce.");
  return { id, title, status, approver, unit: kind === "primary" ? "cases" : "pieces", lines, orderedLines,
    barcode: await recordBarcode("return", id), salesforceUrl: salesforceReturnUrl(origin, id) };
}
