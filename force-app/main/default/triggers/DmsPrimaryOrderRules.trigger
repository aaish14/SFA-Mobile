trigger DmsPrimaryOrderRules on DMS_Primary_Order__c (before insert, before update) {
    DmsPrimaryWorkflow.prepareHeaders(Trigger.new, Trigger.isInsert ? null : Trigger.oldMap, false);
}