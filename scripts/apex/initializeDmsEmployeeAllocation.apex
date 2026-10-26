// Run once in the intended org. Re-running preserves assignments and cursor.
System.assertEquals('00DjV000004opjNUAQ', String.valueOf(UserInfo.getOrganizationId()));
Map<Id, Integer> slots = new Map<Id, Integer>{
    'a0TjV000001VqMjUAK' => 1,
    'a0TjV000001VqRZUA0' => 2,
    'a0TjV000001VpYkUAK' => 3
};
List<DMS_Distributor__c> distributors = [
    SELECT Id, Name, Active__c, Employee_Allocation_Order__c
    FROM DMS_Distributor__c WHERE Id IN :slots.keySet() FOR UPDATE
];
System.assertEquals(3, distributors.size(), 'Expected the three approved distributors.');
for (DMS_Distributor__c distributor : distributors) {
    System.assert(distributor.Active__c, 'The distributor must be active.');
    System.assertEquals('Distributor ' + slots.get(distributor.Id), distributor.Name);
    System.assert(distributor.Employee_Allocation_Order__c == null ||
        distributor.Employee_Allocation_Order__c == slots.get(distributor.Id),
        'Existing allocation sequence changed. Review before proceeding.');
    distributor.Employee_Allocation_Order__c = slots.get(distributor.Id);
}
List<DMS_Allocation_State__c> states = [
    SELECT Id FROM DMS_Allocation_State__c
    WHERE Allocation_Key__c = 'EmployeeDistributor' FOR UPDATE
];
if (states.isEmpty()) {
    insert new DMS_Allocation_State__c(Name='Employee Distributor Round Robin',
        Allocation_Key__c='EmployeeDistributor', Last_Allocated_Order__c=0);
}
update distributors;
Set<Id> employees = new Map<Id, Employee__c>([
    SELECT Id FROM Employee__c WHERE DMS_Distributor__c = null
    ORDER BY CreatedDate, Id LIMIT 200
]).keySet();
DmsEmployeeAllocator.allocate(employees);
System.debug('DMS_ALLOCATION_VERIFIED ' + JSON.serialize([
    SELECT Name, DMS_Distributor__r.Name FROM Employee__c ORDER BY CreatedDate, Id
]));
System.debug('DMS_CURSOR ' + [
    SELECT Last_Allocated_Order__c FROM DMS_Allocation_State__c
    WHERE Allocation_Key__c='EmployeeDistributor'
].Last_Allocated_Order__c);
