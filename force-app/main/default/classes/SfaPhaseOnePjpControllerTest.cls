@IsTest
private class SfaPhaseOnePjpControllerTest {
    private static User makeUser(String label) {
        Profile profile = [SELECT Id FROM Profile WHERE Id = :UserInfo.getProfileId()];
        String unique = label + '.' + System.now().getTime() + '@example.test';
        return new User(
            FirstName = label, LastName = 'SFA', Alias = label.left(5), Email = unique,
            Username = unique, CommunityNickname = label + System.now().getTime(),
            TimeZoneSidKey = 'Asia/Kolkata', LocaleSidKey = 'en_IN', EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US', ProfileId = profile.Id
        );
    }

    private static void assignSfaAccess(List<User> users) {
        Id permissionSetId = [SELECT Id FROM PermissionSet WHERE Name = 'SFA_Mobile_User' LIMIT 1].Id;
        List<PermissionSetAssignment> assignments = new List<PermissionSetAssignment>();
        for (User userRecord : users) {
            assignments.add(new PermissionSetAssignment(
                AssigneeId = userRecord.Id,
                PermissionSetId = permissionSetId
            ));
        }
        insert assignments;
    }

    @IsTest
    static void employeeSubmitsAndManagerApproves() {
        User employeeUser = makeUser('Dhanush');
        User managerUser = makeUser('Dinesh');
        insert new List<User>{ employeeUser, managerUser };
        assignSfaAccess(new List<User>{ employeeUser, managerUser });

        Geography__c geography;
        Employee__c manager;
        Employee__c employee;
        Beat__c firstBeat;
        Beat__c secondBeat;
        System.runAs(employeeUser) {
            geography = new Geography__c(
                Name = 'MG Road Geography', Nation__c = 'India', State__c = 'Karnataka',
                District__c = 'Bengaluru Urban', Town__c = 'MG Road'
            );
            insert geography;
            manager = new Employee__c(
                Name = 'Dinesh', Salesforce_User__c = managerUser.Id,
                Phone__c = '9000000101', Active__c = true, Geography__c = geography.Id,
                PAN_Number__c = 'TESTM0001A'
            );
            Database.insert(manager, AccessLevel.SYSTEM_MODE);
            employee = new Employee__c(
                Name = 'Dhanush', Salesforce_User__c = employeeUser.Id,
                Phone__c = '9000000102', Active__c = true, Geography__c = geography.Id,
                Reporting_Manager__c = manager.Id, PAN_Number__c = 'TESTR0002A'
            );
            Database.insert(employee, AccessLevel.SYSTEM_MODE);
            firstBeat = new Beat__c(Name = 'MG Road Beat', Active__c = true, Assigned_Employee__c = employee.Id, Geography__c = geography.Id);
            secondBeat = new Beat__c(Name = 'Indiranagar Beat', Active__c = true, Assigned_Employee__c = employee.Id, Geography__c = geography.Id);
            insert new List<Beat__c>{ firstBeat, secondBeat };
        }

        Id pjpId;
        System.runAs(employeeUser) {
            pjpId = SfaPhaseOnePjpController.saveDraft(
                null, Date.newInstance(2026, 10, 1), Date.newInstance(2026, 10, 30),
                new List<Id>{ firstBeat.Id, secondBeat.Id }
            );
            SfaPhaseOnePjpController.submitPjp(pjpId);
            System.assertEquals(1, SfaPhaseOnePjpController.getMyPjps().size());
        }

        Permanent_Journey_Plan__c submitted = [
            SELECT Status__c, Approver__c, Submitted_By__c, Submitted_Date__c,
                   (SELECT Id FROM Selected_Beats__r)
            FROM Permanent_Journey_Plan__c WHERE Id = :pjpId
        ];
        System.assertEquals('Submitted', submitted.Status__c);
        System.assertEquals(manager.Id, submitted.Approver__c);
        System.assertEquals(2, submitted.Selected_Beats__r.size());

        System.runAs(managerUser) {
            System.assertEquals(1, SfaPhaseOnePjpController.getMyApprovals().size());
            SfaPhaseOnePjpController.decidePjp(pjpId, true, null);
        }
        Permanent_Journey_Plan__c approved = [SELECT Status__c, Approved_By__c, Approved_Date__c FROM Permanent_Journey_Plan__c WHERE Id = :pjpId];
        System.assertEquals('Approved', approved.Status__c);
        System.assertEquals(managerUser.Id, approved.Approved_By__c);
        System.assertNotEquals(null, approved.Approved_Date__c);
    }

    @IsTest
    static void rejectsInvalidDateRange() {
        User employeeUser = makeUser('Aish'); insert employeeUser;
        assignSfaAccess(new List<User>{ employeeUser });
        System.runAs(employeeUser) {
            Geography__c geography = new Geography__c(Name='Test Geo',Nation__c='India',State__c='Karnataka',District__c='Bengaluru Urban',Town__c='MG Road'); insert geography;
            Employee__c manager = new Employee__c(Name='Manager',Phone__c='9000000201',Active__c=true,Geography__c=geography.Id); Database.insert(manager, AccessLevel.SYSTEM_MODE);
            Database.insert(new Employee__c(Name='Aishwarya',Phone__c='9000000202',Active__c=true,Geography__c=geography.Id,Salesforce_User__c=employeeUser.Id,Reporting_Manager__c=manager.Id), AccessLevel.SYSTEM_MODE);
        }
        System.runAs(employeeUser) {
            Boolean validationRaised = false;
            try {
                SfaPhaseOnePjpController.saveDraft(null, Date.newInstance(2026,10,30), Date.newInstance(2026,10,1), new List<Id>());
            } catch (AuraHandledException expected) {
                validationRaised = true;
            }
            System.assert(validationRaised, 'Invalid dates must fail.');
        }
    }
}