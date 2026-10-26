// Inspected historical return: both DMS fields were null. Preserve its quantities and reason.
List<Product_Return__c> rows=[SELECT Id,Outlet__r.DMS_Distributor__c FROM Product_Return__c WHERE Id='a0FjV000001XbjNUAS' AND DMS_Distributor__c=null AND DMS_Status__c=null AND Outlet__r.DMS_Distributor__r.Active__c=true];
for(Product_Return__c row:rows) {
    row.DMS_Distributor__c=row.Outlet__r.DMS_Distributor__c;
    row.DMS_Status__c='Pending';
}
update rows;
System.debug('Linked existing returns: '+rows.size());
