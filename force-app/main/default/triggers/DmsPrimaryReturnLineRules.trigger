trigger DmsPrimaryReturnLineRules on DMS_Primary_Return_Line__c
    (before insert, before update, before delete, after undelete) {
    DmsPrimaryWorkflow.prepareLines(Trigger.isDelete ? Trigger.old : Trigger.new,
        Trigger.isUpdate ? Trigger.oldMap : null, true, Trigger.isDelete || Trigger.isUndelete);
}