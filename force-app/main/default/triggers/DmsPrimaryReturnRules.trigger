trigger DmsPrimaryReturnRules on DMS_Primary_Return__c (before insert, before update, after insert, after update) {
    if(Trigger.isBefore) DmsPrimaryWorkflow.prepareHeaders(Trigger.new, Trigger.isInsert ? null : Trigger.oldMap, true);
    else DmsOfficerSharing.synchronize('DMS_Primary_Return__c', Trigger.newMap.keySet());
}