/**
 * Populate allocation employee references from linked Salesforce users before saving.
 */
trigger SfaAllocationEmployee on Distributor_Outlet_Allocation__c(before insert, before update) {
    SfaAllocationEmployeeService.populateEmployee(Trigger.new);
}
