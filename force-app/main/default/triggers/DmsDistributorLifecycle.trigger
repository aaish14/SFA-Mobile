trigger DmsDistributorLifecycle on DMS_Distributor__c (before insert, before update) {
    // Preserve all history. Never automatically re-enable a discontinued login.
    for (DMS_Distributor__c distributor : Trigger.new) {
        if (distributor.Discontinued__c) distributor.Active__c = false;
    }
}