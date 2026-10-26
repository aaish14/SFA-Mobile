// User-authorized DEMO data only. No updates/deletes to existing records or SFA.
// Single transaction; a failed assertion/DML rolls back the entire seed.
// Reruns stop before any writes, preventing duplicate inventory.
String marker = 'DEMO-20261022';
System.assertEquals(0, [SELECT count() FROM DMS_Distributor__c WHERE Distributor_Code__c = :marker], 'Demo batch already exists; do not seed twice.');
DMS_Distributor__c d = [SELECT Id,Officer__c,Geography__c FROM DMS_Distributor__c WHERE Id='a0TjV000001VqMjUAK' AND Active__c=true];
Employee__c employee = [SELECT Id FROM Employee__c WHERE DMS_Distributor__c=:d.Id AND Active__c=true ORDER BY CreatedDate,Id LIMIT 1];
Map<Id,Product__c> products = new Map<Id,Product__c>([SELECT Id,Name,Units_Per_Case__c,DMS_Case_Price__c,GST_Percent__c FROM Product__c WHERE Id IN ('a04jV000000WynbQAC','a04jV000000WyndQAC','a04jV000000WynYQAS') AND Active__c=true AND Sellable__c=true]);
System.assertEquals(3,products.size(),'Expected three active catalogue products.');
for(Product__c p:products.values()) System.assert(p.Units_Per_Case__c>0 && p.DMS_Case_Price__c>0,'Missing product conversion/price');
Date today=Date.today();
String note=marker+' | DEMO ONLY - not a real sale, shipment, payment or claim.';
Map<String,Object> manifest=new Map<String,Object>();

// No login email, user association or allocation priority: cannot enter the
// existing round-robin employee pool or authenticate as an existing distributor.
DMS_Distributor__c demo=new DMS_Distributor__c(Name='DEMO ONLY - Training Distributor',Distributor_Code__c=marker,
 Active__c=true,Partner_Type__c='Distributor',Employee_Allocation_Order__c=0,
 Officer__c=UserInfo.getUserId(),Address__c='DEMO ONLY - fictional training warehouse, not a delivery address',Credit_Limit__c=0);
insert demo; manifest.put('demoDistributor',demo.Id);

List<DMS_Inventory__c> stock=new List<DMS_Inventory__c>();
List<Id> productIds=new List<Id>{'a04jV000000WynbQAC','a04jV000000WyndQAC','a04jV000000WynYQAS'};
List<Integer> caseCounts=new List<Integer>{10,5,8};
for(Integer i=0;i<productIds.size();i++) {
 Product__c p=products.get(productIds[i]);
 stock.add(new DMS_Inventory__c(Distributor__c=d.Id,Product__c=p.Id,Batch_Number__c=marker+'-OPENING-'+(i+1),
  Warehouse__c='DEMO ONLY - simulated opening stock',On_Hand_Pieces__c=caseCounts[i]*p.Units_Per_Case__c,
  Reserved_Pieces__c=0,Reorder_Level_Pieces__c=2*p.Units_Per_Case__c,
  Manufacturing_Date__c=today.addDays(-15),Expiry_Date__c=today.addMonths(12),Last_Stock_Update__c=System.now()));
}
insert stock; manifest.put('openingStock',stock);

Product__c yippee=products.get(productIds[0]);
DMS_Primary_Order__c po=new DMS_Primary_Order__c(Distributor__c=d.Id,Status__c='Draft',Order_Source__c='Distributor DMS',
 Order_Date__c=today,Expected_Delivery_Date__c=today.addDays(7),Fulfilment_Status__c='Not Dispatched',Notes__c=note,
 Request_Key__c=marker+'-ORDER');
insert po;
DMS_Primary_Order_Line__c pol=new DMS_Primary_Order_Line__c(Order__c=po.Id,Product__c=yippee.Id,Cases__c=3);
insert pol; manifest.put('primaryOrder',po.Id); manifest.put('primaryOrderLine',pol.Id);

DMS_Goods_Receipt__c grn=new DMS_Goods_Receipt__c(Distributor__c=d.Id,Primary_Order__c=po.Id,Status__c='Draft',
 Supplier_Invoice_Number__c=marker+'-SAMPLE',Notes__c=note+' Draft only; no stock posting.');
insert grn;
DMS_Goods_Receipt_Line__c grnl=new DMS_Goods_Receipt_Line__c(Goods_Receipt__c=grn.Id,Primary_Order_Line__c=pol.Id,
 Product__c=yippee.Id,Received_Cases__c=3,Free_Cases__c=0,Pieces_Per_Case__c=yippee.Units_Per_Case__c,
 Case_Cost__c=yippee.DMS_Case_Price__c,Batch_Number__c=marker+'-DRAFT-RECEIPT',Manufacturing_Date__c=today.addDays(-15),Expiry_Date__c=today.addMonths(12));
insert grnl; manifest.put('draftReceipt',grn.Id); manifest.put('draftReceiptLine',grnl.Id);

// Required invoice source is a read-only reference to an existing secondary
// order/item. Neither the source order, item nor outlet is updated or posted.
Order_Item__c source=[SELECT Id,Sales_Order__c,Sales_Order__r.Retailer__c FROM Order_Item__c
 WHERE Id='a02jV000002FvmPQAS' AND Product__c='a04jV000000WyndQAC' AND Sales_Order__r.DMS_Distributor__c=:d.Id];
DMS_Invoice__c inv=new DMS_Invoice__c(Distributor__c=d.Id,Outlet__c=source.Sales_Order__r.Retailer__c,
 Sales_Order__c=source.Sales_Order__c,Status__c='Draft',Payment_Status__c='Unpaid',Paid_Amount__c=0,
 Invoice_Date__c=today,Due_Date__c=today.addDays(30),Notes__c=note+' Existing order is reference-only; do not issue this demo invoice.');
insert inv;
Product__c atta=products.get(productIds[1]);
DMS_Invoice_Line__c il=new DMS_Invoice_Line__c(Invoice__c=inv.Id,Order_Item__c=source.Id,Product__c=atta.Id,
 Inventory__c=stock[1].Id,Quantity_Pieces__c=5,Free_Pieces__c=0,Discount_Amount__c=0,
 Unit_Price__c=atta.DMS_Case_Price__c/atta.Units_Per_Case__c,Tax_Percent__c=atta.GST_Percent__c,
 Batch_Number__c=stock[1].Batch_Number__c,Expiry_Date__c=stock[1].Expiry_Date__c);
insert il; manifest.put('draftInvoice',inv.Id); manifest.put('draftInvoiceLine',il.Id);

DMS_Primary_Return__c ret=new DMS_Primary_Return__c(Distributor__c=d.Id,Employee__c=employee.Id,
 Status__c='Draft',Return_Date__c=today,Notes__c=note+' Simulated opening-stock return; no stock deduction.');
insert ret;
DMS_Primary_Return_Line__c rl=new DMS_Primary_Return_Line__c(Primary_Return__c=ret.Id,Product__c=yippee.Id,
 Cases__c=1,Batch_Number__c=stock[0].Batch_Number__c,Expiry_Date__c=stock[0].Expiry_Date__c,
 Reason__c='Damaged',Notes__c=marker+' - simulated damaged carton, not a real claim');
insert rl; manifest.put('draftReturn',ret.Id); manifest.put('draftReturnLine',rl.Id);

DMS_Credit_Note__c credit=new DMS_Credit_Note__c(Distributor__c=d.Id,Primary_Return__c=ret.Id,
 Status__c='Draft',Sales_Channel__c='Primary',Credit_Date__c=today,Reason__c='Return',Notes__c=note);
insert credit;
DMS_Credit_Note_Line__c cl=new DMS_Credit_Note_Line__c(Credit_Note__c=credit.Id,Product__c=yippee.Id,
 Description__c=marker+' - illustrative credit only',Quantity__c=1,Quantity_Unit__c='Case',Unit_Credit__c=yippee.DMS_Case_Price__c,Tax_Percent__c=yippee.GST_Percent__c);
insert cl; manifest.put('draftCredit',credit.Id); manifest.put('draftCreditLine',cl.Id);

List<DMS_Support_Ticket__c> tickets=new List<DMS_Support_Ticket__c>();
for(String category:new List<String>{'Product','Portal','Delivery'}) tickets.add(new DMS_Support_Ticket__c(
 Distributor__c=d.Id,Subject__c=marker+' - '+category+' training example',Category__c=category,
 Status__c='Open',Description__c=note+' Training ticket; no real customer issue or delivery action required.'));
insert tickets; manifest.put('tickets',tickets);

// Isolate the illustrative target so it does not become Distributor 1's real target.
DMS_Sales_Target__c target=new DMS_Sales_Target__c(Distributor__c=demo.Id,Month__c=today.toStartOfMonth(),Target_Amount__c=100000);
insert target; manifest.put('demoTarget',target.Id);
DMS_Distributor_Survey__c survey=new DMS_Distributor_Survey__c(Distributor__c=demo.Id,Product__c=yippee.Id,
 Visit_Date__c=today,Stock_Cases__c=0,Movement__c='Normal',Demand_Notes__c=note+' Training survey only; no physical inspection performed.');
insert survey; manifest.put('demoSurvey',survey.Id);

System.debug(LoggingLevel.ERROR,'DEMO_MANIFEST '+JSON.serialize(manifest));
