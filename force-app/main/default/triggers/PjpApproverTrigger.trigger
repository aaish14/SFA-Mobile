trigger PjpApproverTrigger on Permanent_Journey_Plan__c (before insert, before update) {
    // The handler performs the query once for the complete trigger batch.
    SfaRecordedScopeHandler.copyReportingManager(Trigger.new);
}
