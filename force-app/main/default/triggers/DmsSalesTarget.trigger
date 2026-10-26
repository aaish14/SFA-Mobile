trigger DmsSalesTarget on DMS_Sales_Target__c (before insert, before update) {
    for (DMS_Sales_Target__c row : Trigger.new) {
        row.Unique_Key__c = String.valueOf(row.Distributor__c) + ':' + String.valueOf(row.Month__c) + ':' +
            String.valueOf(row.Employee__c) + ':' + String.valueOf(row.Geography__c) + ':' + String.valueOf(row.Product__c);
    }
}