trigger DmsDistributorSurvey on DMS_Distributor_Survey__c (before insert, before update) {
    Set<Id> ids=new Set<Id>();
    for(DMS_Distributor_Survey__c row:Trigger.new) ids.add(row.Distributor__c);
    Map<Id,DMS_Distributor__c> distributors=new Map<Id,DMS_Distributor__c>([SELECT Id,Officer__c,Active__c FROM DMS_Distributor__c WHERE Id IN :ids]);
    for(DMS_Distributor_Survey__c row:Trigger.new) {
        DMS_Distributor__c distributor=distributors.get(row.Distributor__c);
        if(distributor==null||!distributor.Active__c||distributor.Officer__c!=UserInfo.getUserId()) row.addError('Only the assigned company Distributor Officer can record or edit this distributor survey.');
        if(Trigger.isInsert) row.Officer__c=UserInfo.getUserId();
        else row.Officer__c=Trigger.oldMap.get(row.Id).Officer__c;
    }
}