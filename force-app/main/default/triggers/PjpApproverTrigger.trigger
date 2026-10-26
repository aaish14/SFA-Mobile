/**
 * Populate reporting-manager context before plan writes and synchronize allocations after
 * approved plan changes.
 */
trigger PjpApproverTrigger on Permanent_Journey_Plan__c(
    before insert,
    before update,
    after insert,
    after update
) {
    if (Trigger.isBefore) {
        SfaRecordedScopeHandler.copyReportingManager(Trigger.new);
    } else {
        SfaPjpAllocationService.afterSave(Trigger.new, Trigger.isInsert ? null : Trigger.oldMap);
    }
}
