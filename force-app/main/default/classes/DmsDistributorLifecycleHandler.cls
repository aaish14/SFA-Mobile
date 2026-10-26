/**
 * Applies lifecycle rules before saving, including bulk imports.
 * System context matches the original trigger; this is internal automation.
 * Clearing Discontinued never automatically reactivates an account.
 */
public without sharing class DmsDistributorLifecycleHandler {
    /**
     * Make a discontinued distributor inactive. Clearing Discontinued does not automatically
     * reactivate the distributor.
     */
    public static void applyDiscontinuation(List<DMS_Distributor__c> distributors) {
        for (DMS_Distributor__c distributor : distributors) {
            if (distributor.Discontinued__c) {
                distributor.Active__c = false;
            }
        }
    }
}
