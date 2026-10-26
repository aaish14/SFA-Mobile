// User-confirmed choices, 21 October 2026. Idempotent and limited to two outlets.
System.assertEquals('00DjV000004opjNUAQ', String.valueOf(UserInfo.getOrganizationId()));
Map<Id,Id> assignments = new Map<Id,Id>{
    'a05jV000002YaUXQA0' => 'a0TjV000001VqMjUAK',
    'a05jV000002fP1KQAU' => 'a0TjV000001VqRZUA0'
};
Map<Id,String> names = new Map<Id,String>{
    'a05jV000002YaUXQA0' => 'Lakshmi Stores',
    'a05jV000002fP1KQAU' => 'ABC'
};
Set<Id> distributorIds = new Set<Id>(assignments.values());
System.assertEquals(2,[SELECT COUNT() FROM DMS_Distributor__c
    WHERE Id IN :distributorIds AND Active__c=true]);
Map<Id,Retailer__c> original = new Map<Id,Retailer__c>([
    SELECT Id,Name,DMS_Distributor__c,Beat__c,Geography__c,Beat__r.Geography__c
    FROM Retailer__c WHERE Id IN :assignments.keySet() FOR UPDATE
]);
System.assertEquals(2,original.size());
List<Retailer__c> changes = new List<Retailer__c>();
for(Retailer__c outlet : original.values()) {
    System.assertEquals(names.get(outlet.Id),outlet.Name);
    System.assert(outlet.DMS_Distributor__c==null || outlet.DMS_Distributor__c==assignments.get(outlet.Id),
        'Assignment changed since review.');
    System.assert(outlet.Beat__c==null || outlet.Geography__c==outlet.Beat__r.Geography__c,
        'Review geography before updating.');
    if(outlet.DMS_Distributor__c==null)
        changes.add(new Retailer__c(Id=outlet.Id,DMS_Distributor__c=assignments.get(outlet.Id)));
}
update changes;
for(Retailer__c outlet : [SELECT Id,DMS_Distributor__c,Beat__c,Geography__c
    FROM Retailer__c WHERE Id IN :assignments.keySet()]) {
    System.assertEquals(assignments.get(outlet.Id),outlet.DMS_Distributor__c);
    System.assertEquals(original.get(outlet.Id).Beat__c,outlet.Beat__c);
    System.assertEquals(original.get(outlet.Id).Geography__c,outlet.Geography__c);
}
System.debug('Confirmed both outlet distributor assignments; updated '+changes.size());
