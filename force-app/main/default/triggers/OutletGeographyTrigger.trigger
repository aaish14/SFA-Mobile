trigger OutletGeographyTrigger on Retailer__c (before insert, before update, after insert, after update, after delete, after undelete) {
    // Keep trigger entry points small. Business logic belongs in the handler so
    // it can be tested directly and reused safely from other Salesforce code.
    if (Trigger.isBefore) {
        SfaRecordedScopeHandler.copyBeatGeography(Trigger.new);
    }

    if (Trigger.isAfter) {
        SfaRecordedScopeHandler.refreshOutletCounts(Trigger.new, Trigger.old);
    }
}
