@IsTest
private class DmsLoginEmailServiceTest {
    @TestSetup
    static void permissions() {
        Id permissionId = [SELECT Id FROM PermissionSet WHERE Name = 'DMS_Backend_Transactions'].Id;
        if ([SELECT COUNT() FROM PermissionSetAssignment
            WHERE AssigneeId = :UserInfo.getUserId() AND PermissionSetId = :permissionId] == 0) {
            insert new PermissionSetAssignment(AssigneeId = UserInfo.getUserId(), PermissionSetId = permissionId);
        }
    }

    private static DMS_Distributor__c distributor(String email) {
        DMS_Distributor__c row = new DMS_Distributor__c(Name = 'Sign-in fixture',
            Active__c = true, Officer__c = UserInfo.getUserId(), Login_Email__c = email);
        insert row;
        return row;
    }

    /** Real REST dispatch and trigger send; no emails leave Salesforce during a test. */
    @IsTest static void sendsThroughApexTrigger() {
        DMS_Distributor__c row = distributor('signin@example.invalid');
        RestContext.request = new RestRequest();
        RestContext.response = new RestResponse();
        RestContext.request.requestBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{
            'action' => 'sendLoginCode', 'email' => 'signin@example.invalid', 'code' => '123456'
        }));
        Test.startTest();
        DmsPortalApi.execute();
        System.assertEquals(1, Limits.getEmailInvocations());
        String response = RestContext.response.responseBody.toString();
        System.assert(response.contains('Email accepted'), response);
        System.assert(!response.contains('123456'));
        System.assertEquals(0, DmsLoginEmailService.pendingCodes.size());
        Test.stopTest();
        row = [SELECT Login_Email_Requested_At__c, Login_Email_Accepted__c
            FROM DMS_Distributor__c WHERE Id = :row.Id];
        System.assertNotEquals(null, row.Login_Email_Requested_At__c);
        System.assertEquals(true, row.Login_Email_Accepted__c);
    }

    @IsTest static void rejectsRapidResendAndInvalidCode() {
        distributor('throttle@example.invalid');
        Test.startTest();
        DmsLoginEmailService.requestCode('throttle@example.invalid', '123456');
        try {
            DmsLoginEmailService.requestCode('throttle@example.invalid', '654321');
            System.assert(false, 'A resend within 60 seconds must be rejected.');
        } catch (DmsPortalApi.InputException expected) {
            System.assert(expected.getMessage().contains('wait'));
        }
        try {
            DmsLoginEmailService.requestCode('throttle@example.invalid', 'invalid');
            System.assert(false, 'Invalid codes must not reach the email sender.');
        } catch (DmsPortalApi.InputException expected) {
            System.assert(expected.getMessage().contains('valid'));
        }
        System.assertEquals(1, Limits.getEmailInvocations());
        Test.stopTest();
    }

    @IsTest static void rejectsMissingInactiveAndDuplicateLogins() {
        DMS_Distributor__c inactive = distributor('inactive@example.invalid');
        inactive.Active__c = false;
        update inactive;
        distributor('duplicate@example.invalid');
        Database.SaveResult duplicate = Database.insert(new DMS_Distributor__c(Name = 'Duplicate fixture',
            Active__c = true, Login_Email__c = 'duplicate@example.invalid'), false);
        System.assertEquals(false, duplicate.isSuccess(), 'Salesforce must keep login emails unique.');
        Test.startTest();
        for (String email : new List<String>{ 'missing@example.invalid', 'inactive@example.invalid' }) {
            try {
                DmsLoginEmailService.requestCode(email, '123456');
                System.assert(false, 'Only one active matching login is allowed.');
            } catch (DmsPortalApi.InputException expected) {
                System.assert(expected.getMessage().contains('not available'));
            }
        }
        System.assertEquals(0, Limits.getEmailInvocations());
        Test.stopTest();
    }

    @IsTest static void ordinaryEditsDoNotSendAndCannotForgeRequests() {
        DMS_Distributor__c row = distributor('edit@example.invalid');
        Test.startTest();
        row.Name = 'Updated name'; update row;
        System.assertEquals(0, Limits.getEmailInvocations());
        row.Login_Email_Requested_At__c = System.now();
        Database.SaveResult result = Database.update(row, false);
        System.assertEquals(false, result.isSuccess());
        System.assertEquals(0, Limits.getEmailInvocations());
        Test.stopTest();
    }

    @IsTest static void handlesSeveralStagedRequestsInOneEmailCall() {
        DMS_Distributor__c first = distributor('first@example.invalid');
        DMS_Distributor__c second = distributor('second@example.invalid');
        DmsLoginEmailService.pendingCodes.put(first.Id, '123456');
        DmsLoginEmailService.pendingCodes.put(second.Id, '654321');
        first.Login_Email_Requested_At__c = System.now();
        second.Login_Email_Requested_At__c = System.now();
        Test.startTest();
        update new List<DMS_Distributor__c>{ first, second };
        System.assertEquals(1, Limits.getEmailInvocations());
        Test.stopTest();
    }
}