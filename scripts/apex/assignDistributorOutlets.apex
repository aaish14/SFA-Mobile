// Assign the existing demo outlets to the two distributor Accounts used by the
// external mobile application. The script is idempotent and creates no Accounts.
Map<String, Account> distributorsByName = new Map<String, Account>();
for (Account distributor : [
    SELECT Id, Name
    FROM Account
    WHERE Name IN ('Edge Communications', 'Express Logistics and Transport')
]) {
    distributorsByName.put(distributor.Name, distributor);
}

if (!distributorsByName.containsKey('Edge Communications') ||
    !distributorsByName.containsKey('Express Logistics and Transport')) {
    throw new IllegalArgumentException('Both distributor Accounts must exist before outlet assignment.');
}

Set<String> edgeBeatNames = new Set<String>{
    'Central Market Beat',
    'Electronic City Beat',
    'Indiranagar Beat',
    'Koramangala Beat',
    'MG Road 3rd cross',
    'Whitefield Beat'
};

List<Retailer__c> outletsToUpdate = new List<Retailer__c>();
for (Retailer__c outlet : [
    SELECT Id, Beat__r.Name, Distributor__c
    FROM Retailer__c
]) {
    Id requiredDistributorId = outlet.Beat__r != null && edgeBeatNames.contains(outlet.Beat__r.Name)
        ? distributorsByName.get('Edge Communications').Id
        : distributorsByName.get('Express Logistics and Transport').Id;
    if (outlet.Distributor__c != requiredDistributorId) {
        outlet.Distributor__c = requiredDistributorId;
        outletsToUpdate.add(outlet);
    }
}

if (!outletsToUpdate.isEmpty()) {
    update outletsToUpdate;
}

System.debug(LoggingLevel.INFO, 'Distributor outlet assignments updated: ' + outletsToUpdate.size());
