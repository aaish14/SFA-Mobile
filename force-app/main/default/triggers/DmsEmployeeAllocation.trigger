/**
 * After employee creation, delegate the inserted employee IDs to the persistent round-robin
 * allocator.
 */
trigger DmsEmployeeAllocation on Employee__c(after insert) {
    DmsEmployeeAllocator.allocate(Trigger.newMap.keySet());
}
