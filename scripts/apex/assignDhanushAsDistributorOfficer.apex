System.assertEquals('00DjV000004opjNUAQ', String.valueOf(UserInfo.getOrganizationId()));
User officer=[SELECT Id,Name,IsActive FROM User WHERE Id='005jV000002aNRZQA2'];
System.assert(officer.IsActive && officer.Name=='Dhanush SFA', 'Expected the active Dhanush Salesforce user.');
Set<Id> distributorIds=new Set<Id>{'a0TjV000001VqMjUAK','a0TjV000001VqRZUA0','a0TjV000001VpYkUAK'};
List<DMS_Distributor__c> distributors=[SELECT Id,Officer__c FROM DMS_Distributor__c WHERE Id IN :distributorIds];
System.assertEquals(3,distributors.size());
for(DMS_Distributor__c distributor:distributors) distributor.Officer__c=officer.Id;
update distributors;
Set<Id> sharedIds=new Set<Id>();
for(DMS_Distributor__Share existing:[SELECT ParentId FROM DMS_Distributor__Share
    WHERE ParentId IN :distributorIds AND UserOrGroupId=:officer.Id]) sharedIds.add(existing.ParentId);
List<DMS_Distributor__Share> shares=new List<DMS_Distributor__Share>();
for(Id distributorId:distributorIds) {
    if(!sharedIds.contains(distributorId)) shares.add(new DMS_Distributor__Share(
        ParentId=distributorId,UserOrGroupId=officer.Id,AccessLevel='Read',RowCause='Manual'));
}
insert shares;
System.debug('DMS_OFFICER_VERIFIED: Dhanush SFA assigned to all three distributors.');
