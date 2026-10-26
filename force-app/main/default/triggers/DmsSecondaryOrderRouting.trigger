trigger DmsSecondaryOrderRouting on Sales_Order__c(before insert, after insert, after update) {
    if (Trigger.isBefore) DmsSecondaryRouting.route(Trigger.new, 'Retailer__c');
    else DmsInvoiceService.secondary(Trigger.new, Trigger.isInsert ? null : Trigger.oldMap);
}