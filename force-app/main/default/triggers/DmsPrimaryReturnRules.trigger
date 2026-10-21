trigger DmsPrimaryReturnRules on DMS_Primary_Return__c (before insert, before update) {
    DmsPrimaryWorkflow.prepareHeaders(Trigger.new, Trigger.isInsert ? null : Trigger.oldMap, true);
}