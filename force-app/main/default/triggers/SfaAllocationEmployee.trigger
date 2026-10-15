trigger SfaAllocationEmployee on Distributor_Outlet_Allocation__c (before insert, before update) {
    SfaAllocationEmployeeService.populateEmployee(Trigger.new);
}