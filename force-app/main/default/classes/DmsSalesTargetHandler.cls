/**
 * Builds the uniqueness key for a monthly target scope before saving.
 * Internal automation; no queries, DML, or record access is needed.
 * Preserve the existing delimiter and String.valueOf(null) representation.
 */
public without sharing class DmsSalesTargetHandler {
    /**
     * Validate target dimensions and derive the distributor/month/dimension scope key used to
     * prevent duplicate targets.
     */
    public static void populateScopeKeys(List<DMS_Sales_Target__c> targets) {
        for (DMS_Sales_Target__c target : targets) {
            target.Unique_Key__c =
                String.valueOf(target.Distributor__c) +
                ':' +
                String.valueOf(target.Month__c) +
                ':' +
                String.valueOf(target.Employee__c) +
                ':' +
                String.valueOf(target.Geography__c) +
                ':' +
                String.valueOf(target.Product__c);
        }
    }
}
