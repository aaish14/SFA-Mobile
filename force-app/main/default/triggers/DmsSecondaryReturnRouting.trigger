/**
 * Assign the outlet supplier to new secondary returns through the shared routing handler.
 */
trigger DmsSecondaryReturnRouting on Product_Return__c(before insert) {
    DmsSecondaryRouting.route(Trigger.new, 'Outlet__c');
}
