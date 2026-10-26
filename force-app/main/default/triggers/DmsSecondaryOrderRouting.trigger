/**
 * Route new secondary orders before insert, then issue eligible invoices after insert/update
 * once the order is ready.
 */
trigger DmsSecondaryOrderRouting on Sales_Order__c(before insert, after insert, after update) {
    if (Trigger.isBefore)
        DmsSecondaryRouting.route(Trigger.new, 'Retailer__c');
    else
        DmsInvoiceService.secondary(Trigger.new, Trigger.isInsert ? null : Trigger.oldMap);
}
