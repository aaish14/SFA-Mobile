trigger OutletGeographyTrigger on Retailer__c (before insert, before update, after insert, after update, after delete, after undelete) {
    if (Trigger.isBefore) SfaRecordedScopeHandler.copyBeatGeography(Trigger.new);
    if (Trigger.isAfter) SfaRecordedScopeHandler.refreshOutletCounts(Trigger.new, Trigger.old);
}