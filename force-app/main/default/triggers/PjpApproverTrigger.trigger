trigger PjpApproverTrigger on Permanent_Journey_Plan__c (before insert, before update) {
    SfaRecordedScopeHandler.copyReportingManager(Trigger.new);
}