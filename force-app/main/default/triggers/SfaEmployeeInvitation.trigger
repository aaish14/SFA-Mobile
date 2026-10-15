trigger SfaEmployeeInvitation on Employee__c (after insert, after update) {
    SfaEmployeeInvitationService.emailApplicationLinks(
        Trigger.new,
        Trigger.isInsert ? null : Trigger.oldMap
    );
}