@IsTest
private class SfaEmployeeInvitationServiceTest {
    /**
     * Regression scenario: sends invitation when employee is created with email. Arrange
     * isolated test data, exercise the workflow and assert the expected outcome.
     */
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

        System.assertEquals(
            1,
            emailInvocations,
            'A new employee should receive one invitation email.'
        );
    }

    /**
     * Regression scenario: skips invitation when email is missing. Arrange isolated test data,
     * exercise the workflow and assert the expected outcome.
     */
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

        System.assertEquals(
            0,
            emailInvocations,
            'No email should be sent without an email address.'
        );
    }

    /**
     * Regression scenario: sends invitation when employee email changes. Arrange isolated test
     * data, exercise the workflow and assert the expected outcome.
     */
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

        System.assertEquals(
            1,
            emailInvocations,
            'Changing the employee email should send the access email.'
        );
    }
}
