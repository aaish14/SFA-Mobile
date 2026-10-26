// Run only AFTER the automatic-secondary-approval deployment succeeds.
// Preserve prior decisions and do not post inventory, receipts or invoices.
List<Sales_Order__c> pendingOrders = [
    SELECT Id,DMS_Distributor__c,DMS_Distributor__r.Active__c,
           Retailer__r.DMS_Distributor__c
    FROM Sales_Order__c
    WHERE DMS_Distributor__c != null
      AND (DMS_Status__c = 'Pending' OR DMS_Status__c = null)
    LIMIT 1000 FOR UPDATE
];
List<Sales_Order__c> approvedOrders = new List<Sales_Order__c>();
for(Sales_Order__c row : pendingOrders) {
    if(row.DMS_Distributor__r.Active__c &&
       row.Retailer__r.DMS_Distributor__c == row.DMS_Distributor__c) {
        approvedOrders.add(new Sales_Order__c(
            Id=row.Id, DMS_Status__c='Approved',
            DMS_Decision_Notes__c='Automatically approved secondary order.',
            DMS_Decided_At__c=System.now()));
    }
}
update approvedOrders;
System.debug(LoggingLevel.INFO,'Secondary orders automatically approved: '+approvedOrders.size());
