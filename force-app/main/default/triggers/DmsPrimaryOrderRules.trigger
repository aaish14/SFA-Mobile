trigger DmsPrimaryOrderRules on DMS_Primary_Order__c (before insert, before update, after insert, after update) {
    if(Trigger.isBefore) DmsPrimaryWorkflow.prepareHeaders(Trigger.new, Trigger.isInsert ? null : Trigger.oldMap, false);
    else DmsOfficerSharing.synchronize('DMS_Primary_Order__c', Trigger.newMap.keySet());
}