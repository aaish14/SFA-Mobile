/** Read original ordered products and reserve quantities in all non-rejected returns. */
export async function returnCatalogue(
  distributorId: string,
  kind: "primary" | "secondary",
  records: (query: string) => Promise<any[]>,
  orderId?: string,
) {
  const primary = kind === "primary";
  const orderFilter = orderId ? ` AND ${primary ? "Goods_Receipt__r.Primary_Order__c" : "Sales_Order__c"}='${orderId}'` : "";
  const sources = await records(primary
    ? `SELECT Id,Product__c,Product__r.Name,Received_Cases__c,Free_Cases__c,Batch_Number__c,Expiry_Date__c,Goods_Receipt__c,Goods_Receipt__r.Name,Goods_Receipt__r.Primary_Order__c,Goods_Receipt__r.Primary_Order__r.Name FROM DMS_Goods_Receipt_Line__c WHERE Goods_Receipt__r.Distributor__c='${distributorId}' AND Goods_Receipt__r.Status__c='Received'${orderFilter} ORDER BY CreatedDate DESC LIMIT 501`
    : `SELECT Id,Product__c,Product__r.Name,Piece_Quantity__c,Sales_Order__c,Sales_Order__r.Name,Sales_Order__r.Retailer__r.Name FROM Order_Item__c WHERE Sales_Order__r.DMS_Distributor__c='${distributorId}' AND Sales_Order__r.Retailer__r.DMS_Distributor__c='${distributorId}' AND Sales_Order__r.DMS_Status__c='Approved'${orderFilter} ORDER BY CreatedDate DESC LIMIT 501`);
  const totals = await records(primary
    ? `SELECT Receipt_Line__c source,SUM(Cases__c) quantity FROM DMS_Primary_Return_Line__c WHERE Primary_Return__r.Distributor__c='${distributorId}' AND Primary_Return__r.Status__c!='Rejected' GROUP BY Receipt_Line__c`
    : `SELECT Order_Item__c source,SUM(Quantity__c) quantity FROM Product_Return__c WHERE DMS_Distributor__c='${distributorId}' AND (DMS_Status__c=null OR DMS_Status__c!='Rejected') GROUP BY Order_Item__c`);
  const reserved = new Map(totals.map(row => [row.source, Number(row.quantity || 0)]));
  return {
    kind, unit: primary ? "cases" : "pieces", hasMore: sources.length > 500,
    items: sources.slice(0, 500).map(row => {
      const original = primary ? Number(row.Received_Cases__c || 0) + Number(row.Free_Cases__c || 0) : Number(row.Piece_Quantity__c || 0);
      return {
        id: row.Id, productId: row.Product__c, product: row.Product__r?.Name,
        orderId: primary ? row.Goods_Receipt__r?.Primary_Order__c : row.Sales_Order__c,
        receiptId: row.Goods_Receipt__c,
        order: primary ? row.Goods_Receipt__r?.Primary_Order__r?.Name : row.Sales_Order__r?.Name,
        receipt: primary ? row.Goods_Receipt__r?.Name : undefined,
        outlet: primary ? undefined : row.Sales_Order__r?.Retailer__r?.Name,
        batch: row.Batch_Number__c, expiry: row.Expiry_Date__c,
        original, reserved: reserved.get(row.Id) || 0,
        available: Math.max(0, original - (reserved.get(row.Id) || 0)),
      };
    }),
  };
}
