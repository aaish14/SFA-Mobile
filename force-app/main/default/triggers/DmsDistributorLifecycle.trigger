/**
 * Apply distributor lifecycle rules and send only sign-in requests staged by the trusted Apex service.
 */
trigger DmsDistributorLifecycle on DMS_Distributor__c(before insert, before update) {
    DmsDistributorLifecycleHandler.applyDiscontinuation(Trigger.new);
    if (Trigger.isUpdate) {
        DmsLoginEmailService.sendFromTrigger(Trigger.new, Trigger.oldMap);
    }
}