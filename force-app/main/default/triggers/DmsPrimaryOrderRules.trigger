/**
 * Validate primary order headers before writes; after saving, maintain officer access and issue
 * invoices for approved orders.
 */
trigger DmsPrimaryOrderRules on DMS_Primary_Order__c(
    before insert,
    before update,
    after insert,
    after update
) {
    if (Trigger.isBefore)
        DmsPrimaryWorkflow.prepareHeaders(
            Trigger.new,
            Trigger.isInsert ? null : Trigger.oldMap,
            false
        );
    else {
        DmsOfficerSharing.synchronize('DMS_Primary_Order__c', Trigger.newMap.keySet());
        DmsInvoiceService.primary(Trigger.new, Trigger.isInsert ? null : Trigger.oldMap);
    }
}
