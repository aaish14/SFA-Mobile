trigger SfaSalesRepresentativeInvitation on Distributor__c (
    before insert,
    before update,
    after insert,
    after update
) {
    if (Trigger.isBefore) {
        SfaSalesRepresentativeInvitationService.synchronizeLoginEmail(Trigger.new);
    }

    if (Trigger.isAfter) {
        SfaSalesRepresentativeInvitationService.emailApplicationLinks(
            Trigger.new,
            Trigger.isInsert ? null : Trigger.oldMap
        );
    }
}