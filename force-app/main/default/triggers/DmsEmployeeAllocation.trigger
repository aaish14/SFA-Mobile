trigger DmsEmployeeAllocation on Employee__c (after insert) {
    DmsEmployeeAllocator.allocate(Trigger.newMap.keySet());
}