@IsTest
private class SfaAllocationEmployeeServiceTest {
    @IsTest
    static void linksAllocationToEmployeeUsingSalesforceUser() {
        Geography__c geography = new Geography__c(
            Name = 'Employee Allocation Test Geography',
            Nation__c = 'India',
            State__c = 'Karnataka',
            District__c = 'Bengaluru Urban'
        );
        insert geography;

        Beat__c beat = new Beat__c(
            Name = 'Employee Allocation Test Beat',
            Geography__c = geography.Id,
            Active__c = false
        );
        insert beat;

        Employee__c employee = new Employee__c(
            Name = 'Test Employee',
            Employee_Code__c = 'EMP-ALLOC-TEST',
            Phone__c = '9000000001',
            Active__c = true,
            Geography__c = geography.Id,
            Beat__c = beat.Id,
            Salesforce_User__c = UserInfo.getUserId()
        );
        insert employee;

        beat.Assigned_Employee__c = employee.Id;
        beat.Active__c = true;
        update beat;

        Distributor__c representative = new Distributor__c(
            Name = 'Test Sales Representative',
            Beat__c = beat.Id,
            Status__c = 'Active',
            User__c = UserInfo.getUserId()
        );
        insert representative;

        Retailer__c outlet = new Retailer__c(
            Name = 'Test Outlet',
            Geography__c = geography.Id,
            Beat__c = beat.Id,
            Active__c = true
        );
        insert outlet;

        Distributor_Outlet_Allocation__c allocation = new Distributor_Outlet_Allocation__c(
            Distributor__c = representative.Id,
            Employee__c = null,
            Outlet__c = outlet.Id,
            Beat__c = beat.Id,
            Allocation_Status__c = 'Active',
            Allocation_Date__c = Date.today()
        );

        Test.startTest();
        insert allocation;
        Test.stopTest();

        Distributor_Outlet_Allocation__c savedAllocation = [
            SELECT Employee__c
            FROM Distributor_Outlet_Allocation__c
            WHERE Id = :allocation.Id
        ];
        System.assertEquals(employee.Id, savedAllocation.Employee__c);
    }
}