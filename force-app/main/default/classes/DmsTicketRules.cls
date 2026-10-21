/** Ticket lifecycle is enforced in Salesforce, including edits made in the UI. */
public with sharing class DmsTicketRules {
    public static void validate(List<DMS_Support_Ticket__c> tickets, Map<Id,DMS_Support_Ticket__c> oldRows) {
        Set<Id> ids=new Set<Id>();
        for(DMS_Support_Ticket__c row:tickets) ids.add(row.Distributor__c);
        Map<Id,DMS_Distributor__c> distributors=new Map<Id,DMS_Distributor__c>([
            SELECT Id,Active__c,Officer__c FROM DMS_Distributor__c WHERE Id IN :ids]);
        for(DMS_Support_Ticket__c row:tickets) {
            DMS_Distributor__c distributor=distributors.get(row.Distributor__c);
            if(distributor==null || !distributor.Active__c) {row.addError('Choose an active distributor.');continue;}
            if(oldRows==null) {
                row.Status__c='Open';
                row.Officer__c=distributor.Officer__c;
                if(row.Officer__c!=null) row.OwnerId=row.Officer__c;
            } else {
                DMS_Support_Ticket__c previous=oldRows.get(row.Id);
                if(previous.Distributor__c!=row.Distributor__c) row.addError('The ticket distributor cannot be changed.');
                if(previous.Status__c!=row.Status__c) {
                    Boolean allowed=(previous.Status__c=='Open' && new Set<String>{'In Progress','Rejected'}.contains(row.Status__c)) ||
                        (previous.Status__c=='In Progress' && new Set<String>{'Closed','Rejected'}.contains(row.Status__c));
                    if(!allowed) row.addError('Use Open, then In Progress, then Closed; reject only an open or in-progress ticket.');
                    if(new Set<String>{'Closed','Rejected'}.contains(row.Status__c) && String.isBlank(row.Resolution__c))
                        row.addError('Enter a resolution or rejection reason.');
                }
            }
        }
    }
}