/**
 * Internal automation, not an end-user API. System sharing is intentional:
 * all employee creators must use the same distributor pool and locked cursor.
 */
public without sharing class DmsEmployeeAllocator {
    public class ConfigurationException extends Exception {}

    public static void allocate(Set<Id> employeeIds) {
        if (employeeIds == null || employeeIds.isEmpty()) {
            return;
        }
        List<DMS_Distributor__c> pool = [
            SELECT Id, Employee_Allocation_Order__c FROM DMS_Distributor__c
            WHERE Active__c = true AND Employee_Allocation_Order__c > 0
            ORDER BY Employee_Allocation_Order__c
        ];
        // No configured pool: normal Employee creation remains available.
        if (pool.isEmpty()) {
            return;
        }
        // Serialize concurrent transactions. Initialization is a separate admin
        // step, preventing competing first-time transactions creating cursors.
        List<DMS_Allocation_State__c> states = [
            SELECT Id, Last_Allocated_Order__c FROM DMS_Allocation_State__c
            WHERE Allocation_Key__c = 'EmployeeDistributor' LIMIT 1 FOR UPDATE
        ];
        if (states.isEmpty()) {
            throw new ConfigurationException('Employee allocation is not initialized. Ask your administrator to initialize the DMS allocation state.');
        }
        DMS_Allocation_State__c state = states[0];
        Decimal lastOrder = state.Last_Allocated_Order__c;
        List<Employee__c> changes = new List<Employee__c>();
        // Read after the lock. Retries skip assigned rows; Id breaks timestamp ties.
        for (Employee__c employee : [
            SELECT Id, DMS_Distributor__c FROM Employee__c
            WHERE Id IN :employeeIds AND DMS_Distributor__c = null ORDER BY CreatedDate, Id
        ]) {
            DMS_Distributor__c nextDistributor = pool[0];
            for (DMS_Distributor__c candidate : pool) {
                if (candidate.Employee_Allocation_Order__c > lastOrder) {
                    nextDistributor = candidate;
                    break;
                }
            }
            changes.add(new Employee__c(Id = employee.Id, DMS_Distributor__c = nextDistributor.Id));
            lastOrder = nextDistributor.Employee_Allocation_Order__c;
        }
        if (!changes.isEmpty()) {
            // Both writes belong to the employee transaction. Any failure must
            // roll back both records and cursor; never swallow a save failure.
            state.Last_Allocated_Order__c = lastOrder;
            update state;
            update changes;
        }
    }
}