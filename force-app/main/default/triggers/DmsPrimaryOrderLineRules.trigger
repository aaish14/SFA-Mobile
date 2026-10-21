trigger DmsPrimaryOrderLineRules on DMS_Primary_Order_Line__c
    (before insert, before update, before delete, after insert, after update, after delete, after undelete) {
    if(Trigger.isBefore) {
        DmsPrimaryWorkflow.prepareLines(Trigger.isDelete ? Trigger.old : Trigger.new,
            Trigger.isUpdate ? Trigger.oldMap : null, false, Trigger.isDelete);
    } else {
        DmsPrimaryWorkflow.updateOrderTotals(Trigger.isDelete ? Trigger.old : Trigger.new,
            Trigger.isUpdate ? Trigger.oldMap : null);
    }
}