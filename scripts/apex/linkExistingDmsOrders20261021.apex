// One-time repair of the eight inspected submitted SFA orders predating DMS routing.
// Before state: DMS_Distributor__c=null and DMS_Status__c=null on every listed ID.
// Never change an already-routed order, an approval, an amount, or an outlet mapping.
Set<Id> ids=new Set<Id>{'a06jV000001pvIDQAY','a06jV000001uZLtQAM','a06jV000001uaGLQAY','a06jV0000023e9RQAQ','a06jV0000024lqPQAQ','a06jV0000025wLZQAY','a06jV0000026k0bQAA','a06jV0000028T25QAE'};
List<Sales_Order__c> updates=new List<Sales_Order__c>();
for(Sales_Order__c row:[SELECT Id,Retailer__r.DMS_Distributor__c FROM Sales_Order__c WHERE Id IN :ids AND DMS_Distributor__c=null AND DMS_Status__c=null AND Status__c='Submitted' AND Retailer__r.DMS_Distributor__r.Active__c=true]) {
    updates.add(new Sales_Order__c(Id=row.Id,DMS_Distributor__c=row.Retailer__r.DMS_Distributor__c,DMS_Status__c='Pending'));
}
update updates;
System.debug('Linked existing submitted orders: '+updates.size());
