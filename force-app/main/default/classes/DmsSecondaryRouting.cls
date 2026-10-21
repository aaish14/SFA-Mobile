/**
 * Routes new secondary transactions using the outlet's supplier relationship.
 * Employee allocation is not used here: a shared outlet still has one supplier.
 * Unmapped outlets retain the existing SFA save behavior until configured.
 */
public without sharing class DmsSecondaryRouting {
    public static void route(List<SObject> records, String outletField) {
        Set<Id> outletIds=new Set<Id>();
        for(SObject record:records) outletIds.add((Id)record.get(outletField));
        Map<Id,Retailer__c> outlets=new Map<Id,Retailer__c>([
            SELECT Id,DMS_Distributor__c,DMS_Distributor__r.Active__c
            FROM Retailer__c WHERE Id IN :outletIds
        ]);
        for(SObject record:records) {
            Retailer__c outlet=outlets.get((Id)record.get(outletField));
            if(outlet==null || outlet.DMS_Distributor__c==null) {
                if(record.get('DMS_Distributor__c')!=null)
                    record.addError('Configure the outlet DMS Distributor before routing this transaction.');
                continue;
            }
            if(!outlet.DMS_Distributor__r.Active__c) {
                record.addError('The outlet distributor is inactive. Ask the administrator to update the outlet mapping.');
                continue;
            }
            Id supplied=(Id)record.get('DMS_Distributor__c');
            if(supplied!=null && supplied!=outlet.DMS_Distributor__c) {
                record.addError('The distributor must match the outlet DMS Distributor.');
                continue;
            }
            record.put('DMS_Distributor__c',outlet.DMS_Distributor__c);
            record.put('DMS_Status__c','Pending');
        }
    }
}