// Populate Employee Beat values from the linked Sales Representative where possible.
Map<Id, Id> userToBeat = new Map<Id, Id>();
for (Distributor__c representative : [
    SELECT User__c, Beat__c
    FROM Distributor__c
    WHERE User__c != null AND Beat__c != null
]) {
    if (!userToBeat.containsKey(representative.User__c)) {
        userToBeat.put(representative.User__c, representative.Beat__c);
    }
}

List<Employee__c> employeesToUpdate = new List<Employee__c>();
for (Employee__c employee : [
    SELECT Id, Salesforce_User__c, Beat__c
    FROM Employee__c
    WHERE Salesforce_User__c IN :userToBeat.keySet()
]) {
    if (employee.Beat__c == null) {
        employee.Beat__c = userToBeat.get(employee.Salesforce_User__c);
        employeesToUpdate.add(employee);
    }
}
if (!employeesToUpdate.isEmpty()) {
    update employeesToUpdate;
}

// Updating each allocation invokes SfaAllocationEmployee and links its Employee.
List<Distributor_Outlet_Allocation__c> allocations = [
    SELECT Id, Distributor__c
    FROM Distributor_Outlet_Allocation__c
];
if (!allocations.isEmpty()) {
    update allocations;
}

System.debug('Employees updated: ' + employeesToUpdate.size());
System.debug('Outlet allocations linked: ' + allocations.size());
