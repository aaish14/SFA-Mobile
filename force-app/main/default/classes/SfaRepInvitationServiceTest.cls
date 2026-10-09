@IsTest
private class SfaRepInvitationServiceTest {
    @IsTest
    static void synchronizesEmailAndQueuesInvitation() {
        Beat__c beat = new Beat__c(Name = 'Test Beat', Active__c = false);
        insert beat;

        Distributor__c representative = new Distributor__c(
            Name = 'Test Representative',
            Email__c = 'NEW.REP@example.com',
            Status__c = 'Pending',
            Beat__c = beat.Id
        );

        Test.startTest();
        insert representative;
        representative.Email__c = 'UPDATED.REP@example.com';
        update representative;
        Test.stopTest();

        Distributor__c savedRepresentative = [
            SELECT Login_Email__c
            FROM Distributor__c
            WHERE Id = :representative.Id
        ];
        System.assertEquals('updated.rep@example.com', savedRepresentative.Login_Email__c);
    }
}