/**
 * Before saving distributors, delegate discontinuation handling to the bulk lifecycle handler.
 */
trigger DmsDistributorLifecycle on DMS_Distributor__c(before insert, before update) {
    DmsDistributorLifecycleHandler.applyDiscontinuation(Trigger.new);
    if (Trigger.isUpdate) {
        DmsLoginEmailService.sendFromTrigger(Trigger.new, Trigger.oldMap);
    }
}