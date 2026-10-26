public with sharing class SfaAllocationEmployeeService {
    /**
     * Links an outlet allocation to the Employee that uses the same Salesforce
     * user as the selected Sales Representative.
     */
    public static void populateEmployee(List<Distributor_Outlet_Allocation__c> allocations) {
        Set<Id> representativeIds = new Set<Id>();
        for (Distributor_Outlet_Allocation__c allocation : allocations) {
            if (allocation.Distributor__c != null) {
                representativeIds.add(allocation.Distributor__c);
            }
        }

        if (representativeIds.isEmpty()) {
            return;
        }

        Map<Id, Id> representativeToUser = new Map<Id, Id>();
        Set<Id> userIds = new Set<Id>();
        for (Distributor__c representative : [
            SELECT Id, User__c
            FROM Distributor__c
            WHERE Id IN :representativeIds
        ]) {
            representativeToUser.put(representative.Id, representative.User__c);
            if (representative.User__c != null) {
                userIds.add(representative.User__c);
            }
        }

        Map<Id, Id> userToEmployee = new Map<Id, Id>();
        if (!userIds.isEmpty()) {
            for (Employee__c employee : [
                SELECT Id, Salesforce_User__c
                FROM Employee__c
                WHERE Salesforce_User__c IN :userIds
                ORDER BY Employee_Code__c NULLS LAST, CreatedDate ASC
            ]) {
                if (!userToEmployee.containsKey(employee.Salesforce_User__c)) {
                    userToEmployee.put(employee.Salesforce_User__c, employee.Id);
                }
            }
        }

        for (Distributor_Outlet_Allocation__c allocation : allocations) {
            if (allocation.Employee__c != null) {
                continue;
            }
            Id userId = representativeToUser.get(allocation.Distributor__c);
            allocation.Employee__c = userToEmployee.get(userId);
        }
    }
}