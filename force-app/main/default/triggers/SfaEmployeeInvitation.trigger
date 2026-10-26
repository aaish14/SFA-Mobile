/**
 * Delegate employee invitation processing after insert/update, supplying old values to detect
 * changed emails.
 */
trigger SfaEmployeeInvitation on Employee__c(after insert, after update) {
    SfaEmployeeInvitationService.emailApplicationLinks(
        Trigger.new,
        Trigger.isInsert ? null : Trigger.oldMap
    );
}
