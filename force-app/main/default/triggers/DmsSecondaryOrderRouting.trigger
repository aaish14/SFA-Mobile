trigger DmsSecondaryOrderRouting on Sales_Order__c (before insert) {
    DmsSecondaryRouting.route(Trigger.new, 'Retailer__c');
}