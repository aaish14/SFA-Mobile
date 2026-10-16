// Safe to repeat. Creates only missing employee/outlet allocations and reactivates
// matching inactive ones. Existing unrelated/manual allocations are preserved.
Set<Id> approvedIds = new Map<Id, Permanent_Journey_Plan__c>([
    SELECT Id FROM Permanent_Journey_Plan__c
    WHERE Status__c = 'Approved' AND Employee__c != null AND Employee__r.Active__c = true
]).keySet();
Integer beforeCount = [SELECT COUNT() FROM Distributor_Outlet_Allocation__c];
SfaPjpAllocationService.syncApprovedPlans(approvedIds);
Integer afterCount = [SELECT COUNT() FROM Distributor_Outlet_Allocation__c];
System.debug(LoggingLevel.ERROR, 'PJP_ALLOCATION_BACKFILL plans=' + approvedIds.size() + ' newAllocations=' + (afterCount-beforeCount));
