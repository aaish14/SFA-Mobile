/**
 * Delegate target-scope validation and unique-key preparation before insert or update.
 */
trigger DmsSalesTarget on DMS_Sales_Target__c(before insert, before update) {
    DmsSalesTargetHandler.populateScopeKeys(Trigger.new);
}
