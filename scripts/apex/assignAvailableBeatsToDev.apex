// Authorize Dev to plan visits on beats that are not assigned to anyone.
// Existing assignments for Aishwarya, Dhanush, Ram and Poorvi are preserved.

Employee__c dev = [
    SELECT Id, Name
    FROM Employee__c
    WHERE Name = 'Dev' AND Active__c = true
    LIMIT 1
];

List<Beat__c> availableBeats = [
    SELECT Id, Name, Assigned_Employee__c
    FROM Beat__c
    WHERE Active__c = true AND Assigned_Employee__c = null
    ORDER BY Name
];

for (Beat__c beat : availableBeats) {
    beat.Assigned_Employee__c = dev.Id;
}

if (!availableBeats.isEmpty()) {
    update availableBeats;
}

System.debug('Assigned ' + availableBeats.size() + ' available beats to ' + dev.Name + '.');
