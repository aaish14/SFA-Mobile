// Read-only post-import verification. No DML or approvals.
String batch='DEMO-20261022%';
Map<String,Integer> counts=new Map<String,Integer>();
List<String> names=new List<String>{'DMS_Distributor__c','DMS_Distributor_Survey__c','DMS_Sales_Target__c','DMS_Primary_Order__c','DMS_Primary_Order_Line__c','DMS_Goods_Receipt__c','DMS_Goods_Receipt_Line__c','DMS_Inventory__c','DMS_Invoice__c','DMS_Invoice_Line__c','DMS_Primary_Return__c','DMS_Primary_Return_Line__c','DMS_Credit_Note__c','DMS_Credit_Note_Line__c','DMS_Support_Ticket__c','DMS_Allocation_State__c'};
for(String name:names) counts.put(name,Database.countQuery('SELECT count() FROM '+name));
Decimal stockTotal=0;
for(DMS_Inventory__c row:[SELECT On_Hand_Pieces__c,Available_Pieces__c,Reserved_Pieces__c FROM DMS_Inventory__c WHERE Batch_Number__c LIKE :batch]) {
 System.assertEquals(row.On_Hand_Pieces__c,row.Available_Pieces__c);
 System.assertEquals(0,row.Reserved_Pieces__c);stockTotal+=row.Available_Pieces__c;
}
System.assertEquals(1154,stockTotal);
System.assertEquals(1,[SELECT count() FROM DMS_Primary_Order__c WHERE Notes__c LIKE :batch AND Status__c='Draft']);
System.assertEquals('Approved',[SELECT Status__c FROM DMS_Primary_Order__c WHERE Id='a0VjV000005F253UAC'].Status__c);
System.assertEquals('Draft',[SELECT Status__c FROM DMS_Goods_Receipt__c WHERE Id='a0ZjV000002U9hRUAS'].Status__c);
System.assertEquals(0,[SELECT count() FROM DMS_Goods_Receipt_Line__c WHERE Goods_Receipt__c='a0ZjV000002U9hRUAS']);
System.assertEquals(1,[SELECT count() FROM DMS_Allocation_State__c]);
System.assertEquals(0,[SELECT Employee_Allocation_Order__c FROM DMS_Distributor__c WHERE Distributor_Code__c='DEMO-20261022'].Employee_Allocation_Order__c);
System.assertEquals(0,[SELECT count() FROM Employee__c WHERE DMS_Distributor__r.Distributor_Code__c='DEMO-20261022']);
System.debug(LoggingLevel.ERROR,'DEMO_VERIFICATION '+JSON.serialize(new Map<String,Object>{'counts'=>counts,'availableDemoPieces'=>stockTotal,'existingOrderPreserved'=>true,'existingReceiptPreserved'=>true,'demoExcludedFromAllocation'=>true}));
