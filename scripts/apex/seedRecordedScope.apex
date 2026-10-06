// Sample data requested in the 6 October recording.
List<Geography__c> geographySeed = new List<Geography__c>{
    new Geography__c(Name='MG Road Geography', Nation__c='India', State__c='Karnataka', District__c='Bengaluru Urban'),
    new Geography__c(Name='Indiranagar Geography', Nation__c='India', State__c='Karnataka', District__c='Bengaluru Urban'),
    new Geography__c(Name='Jayanagar Geography', Nation__c='India', State__c='Karnataka', District__c='Bengaluru Urban'),
    new Geography__c(Name='Mysuru Geography', Nation__c='India', State__c='Karnataka', District__c='Mysuru')
};
Map<String, Geography__c> geographiesByName = new Map<String, Geography__c>();
for (Geography__c item : [SELECT Id, Name FROM Geography__c WHERE Name IN :new Map<String, Geography__c>{
    'MG Road Geography' => null, 'Indiranagar Geography' => null,
    'Jayanagar Geography' => null, 'Mysuru Geography' => null
}.keySet()]) geographiesByName.put(item.Name, item);
List<Geography__c> newGeographies = new List<Geography__c>();
for (Geography__c item : geographySeed) if (!geographiesByName.containsKey(item.Name)) newGeographies.add(item);
insert newGeographies;
for (Geography__c item : [SELECT Id, Name FROM Geography__c WHERE Name LIKE '% Geography']) geographiesByName.put(item.Name, item);

Map<String, Employee__c> employeesByName = new Map<String, Employee__c>();
for (Employee__c item : [SELECT Id, Name FROM Employee__c WHERE Name IN ('Dhanush','Dinesh','Aishwarya','Ram')]) employeesByName.put(item.Name, item);
if (!employeesByName.containsKey('Ram')) {
    Employee__c item = new Employee__c(Name='Ram');
    item.put('Aadhaar_Number__c','400000000004'); item.put('PAN_Number__c','RAMAA0004A'); item.put('Phone__c','9000000004'); item.put('Emergency_Contact__c','9100000004'); item.put('Geography__c',geographiesByName.get('MG Road Geography').Id); item.put('Hierarchy_Level__c','L4');
    insert item; employeesByName.put(item.Name, item);
}
if (!employeesByName.containsKey('Aishwarya')) {
    Employee__c item = new Employee__c(Name='Aishwarya');
    item.put('Aadhaar_Number__c','400000000003'); item.put('PAN_Number__c','AISHW0003A'); item.put('Phone__c','9000000003'); item.put('Emergency_Contact__c','9100000003'); item.put('Geography__c',geographiesByName.get('MG Road Geography').Id); item.put('Hierarchy_Level__c','L3'); item.put('Reporting_Manager__c',employeesByName.get('Ram').Id);
    insert item; employeesByName.put(item.Name, item);
}
if (!employeesByName.containsKey('Dinesh')) {
    Employee__c item = new Employee__c(Name='Dinesh');
    item.put('Aadhaar_Number__c','400000000002'); item.put('PAN_Number__c','DINAA0002A'); item.put('Phone__c','9000000002'); item.put('Emergency_Contact__c','9100000002'); item.put('Geography__c',geographiesByName.get('MG Road Geography').Id); item.put('Hierarchy_Level__c','L2'); item.put('Reporting_Manager__c',employeesByName.get('Aishwarya').Id); item.put('Salesforce_User__c',UserInfo.getUserId());
    insert item; employeesByName.put(item.Name, item);
}
if (!employeesByName.containsKey('Dhanush')) {
    Employee__c item = new Employee__c(Name='Dhanush');
    item.put('Aadhaar_Number__c','400000000001'); item.put('PAN_Number__c','DHANU0001A'); item.put('Phone__c','9000000001'); item.put('Emergency_Contact__c','9100000001'); item.put('Geography__c',geographiesByName.get('MG Road Geography').Id); item.put('Hierarchy_Level__c','L1'); item.put('Reporting_Manager__c',employeesByName.get('Dinesh').Id);
    insert item; employeesByName.put(item.Name, item);
}

List<String> beatNames = new List<String>{'MG Road Beat','Indiranagar Beat','Jayanagar Beat','Koramangala Beat','Whitefield Beat','Malleshwaram Beat','Rajajinagar Beat','Yelahanka Beat','Electronic City Beat','Mysuru Central Beat'};
Map<String, Beat__c> beatsByName = new Map<String, Beat__c>();
for (Beat__c item : [SELECT Id, Name FROM Beat__c WHERE Name IN :beatNames]) beatsByName.put(item.Name, item);
List<Beat__c> newBeats = new List<Beat__c>();
for (Integer index = 0; index < beatNames.size(); index++) {
    String beatName = beatNames[index];
    if (!beatsByName.containsKey(beatName)) {
        String geographyName = index == 9 ? 'Mysuru Geography' : (index < 3 ? new List<String>{'MG Road Geography','Indiranagar Geography','Jayanagar Geography'}[index] : 'MG Road Geography');
        Beat__c beat = new Beat__c(Name=beatName, Active__c=true);
        beat.put('Assigned_Employee__c',employeesByName.get('Dhanush').Id); beat.put('Distributor__c','Demo Distributor'); beat.put('Geography__c',geographiesByName.get(geographyName).Id);
        newBeats.add(beat);
    }
}
insert newBeats;
for (Beat__c item : [SELECT Id, Name FROM Beat__c WHERE Name IN :beatNames]) beatsByName.put(item.Name, item);

Map<Id, Integer> existingOutletCounts = new Map<Id, Integer>();
for (AggregateResult result : [SELECT Beat__c beatId, COUNT(Id) total FROM Retailer__c WHERE Beat__c IN :beatsByName.values() GROUP BY Beat__c]) {
    existingOutletCounts.put((Id)result.get('beatId'), (Integer)result.get('total'));
}
List<Retailer__c> outlets = new List<Retailer__c>();
Integer serial = 1;
for (String beatName : beatNames) {
    Beat__c beat = beatsByName.get(beatName);
    Integer existingCount = existingOutletCounts.containsKey(beat.Id) ? existingOutletCounts.get(beat.Id) : 0;
    for (Integer numberInBeat = existingCount + 1; numberInBeat <= 10; numberInBeat++) {
        String serial4 = String.valueOf(serial).leftPad(4, '0');
        String serial6 = String.valueOf(serial).leftPad(6, '0');
        Retailer__c outlet = new Retailer__c(Name=(serial == 1 ? 'Balaji Stores' : 'Outlet ' + serial4), Beat__c=beat.Id, Address__c=beatName + ', Karnataka', Active__c=true);
        outlet.put('Outlet_Owner_Name__c',(serial == 1 ? 'Mukul' : 'Owner ' + serial4)); outlet.put('Phone__c','92' + String.valueOf(10000000 + serial)); outlet.put('Email__c','outlet' + serial + '@example.com'); outlet.put('Aadhaar_Number__c','500000' + serial6); outlet.put('PAN_Number__c','OUTLT' + serial4 + 'A');
        outlets.add(outlet);
        serial++;
    }
}
insert outlets;

System.debug('Recording scope seed complete: 4 geographies, 4 employees, 10 beats, and at least 10 outlets per beat.');
