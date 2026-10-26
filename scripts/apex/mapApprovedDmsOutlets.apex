// Approved one-time backfill: only outlets with exactly one employee distributor.
// Ambiguous/unallocated outlets and existing assignments are never overwritten.
System.assertEquals('00DjV000004opjNUAQ', String.valueOf(UserInfo.getOrganizationId()));
Set<Id> approvedSuppliers = new Set<Id>{
    'a0TjV000001VqMjUAK', 'a0TjV000001VqRZUA0', 'a0TjV000001VpYkUAK'
};
Set<Id> approvedOutlets = new Set<Id>{
    'a05jV000002aKIaQAM','a05jV000002aKIbQAM','a05jV000002aKIcQAM',
    'a05jV000002aKIdQAM','a05jV000002aKIeQAM','a05jV000002aKIfQAM',
    'a05jV000002aKIgQAM','a05jV000002aKIhQAM','a05jV000002aKIiQAM',
    'a05jV000002aKIQQA2','a05jV000002aKIRQA2','a05jV000002aKISQA2',
    'a05jV000002aKITQA2','a05jV000002aKIUQA2','a05jV000002aKIWQA2',
    'a05jV000002aKIXQA2','a05jV000002aKIYQA2','a05jV000002aKIZQA2',
    'a05jV000002aKK6QAM','a05jV000002aKK7QAM','a05jV000002aKK8QAM',
    'a05jV000002aKK9QAM','a05jV000002aKKAQA2','a05jV000002aKKBQA2',
    'a05jV000002aKKCQA2','a05jV000002aKKDQA2','a05jV000002aKKEQA2',
    'a05jV000002aKKFQA2','a05jV000002aKNFQA2','a05jV000002aKNGQA2',
    'a05jV000002aKNHQA2','a05jV000002aKNIQA2','a05jV000002aKNJQA2',
    'a05jV000002aKNKQA2','a05jV000002aKNLQA2','a05jV000002aKNMQA2',
    'a05jV000002aKNNQA2','a05jV000002aKNOQA2','a05jV000002aKP3QAM',
    'a05jV000002aKP5QAM','a05jV000002YacbQAC','a05jV000002YamHQAS'
};
System.assertEquals(42, approvedOutlets.size());
System.assertEquals(3, [SELECT COUNT() FROM DMS_Distributor__c
    WHERE Id IN :approvedSuppliers AND Active__c=true]);
Map<Id,Set<Id>> suppliersByOutlet = new Map<Id,Set<Id>>();
for(Distributor_Outlet_Allocation__c allocation : [
    SELECT Outlet__c, Employee__r.DMS_Distributor__c
    FROM Distributor_Outlet_Allocation__c
    WHERE Allocation_Status__c='Active' AND Outlet__c IN :approvedOutlets
]) {
    System.assertNotEquals(null, allocation.Employee__r.DMS_Distributor__c,
        'An employee mapping changed; review before running.');
    if(!suppliersByOutlet.containsKey(allocation.Outlet__c))
        suppliersByOutlet.put(allocation.Outlet__c,new Set<Id>());
    suppliersByOutlet.get(allocation.Outlet__c).add(allocation.Employee__r.DMS_Distributor__c);
}
Map<Id,Retailer__c> originals = new Map<Id,Retailer__c>([
    SELECT Id,Name,DMS_Distributor__c,Beat__c,Geography__c,Beat__r.Geography__c
    FROM Retailer__c WHERE Id IN :approvedOutlets FOR UPDATE
]);
System.assertEquals(42, originals.size());
List<Retailer__c> updates = new List<Retailer__c>();
for(Retailer__c outlet : originals.values()) {
    Set<Id> suppliers = suppliersByOutlet.get(outlet.Id);
    System.assert(suppliers!=null && suppliers.size()==1,'Ambiguous mapping: '+outlet.Name);
    Id supplier = new List<Id>(suppliers)[0];
    System.assert(approvedSuppliers.contains(supplier),'Unexpected distributor.');
    System.assert(outlet.DMS_Distributor__c==null || outlet.DMS_Distributor__c==supplier,
        'Existing supplier differs: '+outlet.Name);
    // Existing org automation copies geography from the beat on every outlet update.
    System.assert(outlet.Beat__c==null || outlet.Geography__c==outlet.Beat__r.Geography__c,
        'Geography needs separate review: '+outlet.Name);
    if(outlet.DMS_Distributor__c==null)
        updates.add(new Retailer__c(Id=outlet.Id,DMS_Distributor__c=supplier));
}
update updates;
for(Retailer__c outlet : [SELECT Id,DMS_Distributor__c,Beat__c,Geography__c
    FROM Retailer__c WHERE Id IN :approvedOutlets]) {
    System.assert(suppliersByOutlet.get(outlet.Id).contains(outlet.DMS_Distributor__c));
    System.assertEquals(originals.get(outlet.Id).Beat__c,outlet.Beat__c);
    System.assertEquals(originals.get(outlet.Id).Geography__c,outlet.Geography__c);
}
System.debug('Verified 42 approved outlet mappings; newly updated: '+updates.size());
