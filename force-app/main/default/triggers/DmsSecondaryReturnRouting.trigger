trigger DmsSecondaryReturnRouting on Product_Return__c (before insert) {
    DmsSecondaryRouting.route(Trigger.new, 'Outlet__c');
}