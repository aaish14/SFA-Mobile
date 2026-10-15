@IsTest
private class SfaEmployeeInvitationServiceTest {
    @IsTest
    static void sendsInvitationWhenEmployeeIsCreatedWithEmail() {
        Test.startTest();
        insert new Employee__c(
            Name = 'New Employee',
            Employee_Code__c = 'EMP-INV-001',
            Email__c = 'new.employee@example.com',
            Phone__c = '9000001001',
            Active__c = true
        );
        Integer emailInvocations = Limits.getEmailInvocations();
        Test.stopTest();

        System.assertEquals(1, emailInvocations, 'A new employee should receive one invitation email.');
    }

    @IsTest
    static void skipsInvitationWhenEmailIsMissing() {
        Test.startTest();
        insert new Employee__c(
            Name = 'Employee Without Email',
            Employee_Code__c = 'EMP-INV-002',
            Phone__c = '9000001002',
            Active__c = true
        );
        Integer emailInvocations = Limits.getEmailInvocations();
        Test.stopTest();

        System.assertEquals(0, emailInvocations, 'No email should be sent without an email address.');
    }

    @IsTest
    static void sendsInvitationWhenEmployeeEmailChanges() {
        Employee__c employee = new Employee__c(
            Name = 'Existing Employee',
            Employee_Code__c = 'EMP-INV-003',
            Phone__c = '9000001003',
            Active__c = true
        );
        insert employee;

        Test.startTest();
        employee.Email__c = 'updated.employee@example.com';
        update employee;
        Integer emailInvocations = Limits.getEmailInvocations();
        Test.stopTest();

        System.assertEquals(1, emailInvocations, 'Changing the employee email should send the access email.');
    }
}