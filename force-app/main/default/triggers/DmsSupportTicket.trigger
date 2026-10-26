/**
 * Delegate ticket ownership and status-transition validation before saving.
 */
trigger DmsSupportTicket on DMS_Support_Ticket__c(before insert, before update) {
    DmsTicketRules.validate(Trigger.new, Trigger.isUpdate ? Trigger.oldMap : null);
}
