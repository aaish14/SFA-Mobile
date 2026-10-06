// Give the ten outlets under every core beat a clear, business-friendly name.
// Short area codes keep all ten names visible in Salesforce's 255-character
// Beat summary field.

List<String> storeTypes = new List<String>{
    'Fresh Mart',
    'Daily Needs',
    'Super Store',
    'Provision House',
    'Family Mart',
    'City Bazaar',
    'Value Store',
    'Green Grocers',
    'Corner Shop',
    'Traders'
};

Map<String, String> areaCodeByBeatId = new Map<String, String>{
    'BEAT-0001' => 'MG',
    'BEAT-0002' => 'IND',
    'BEAT-0003' => 'JAY',
    'BEAT-0004' => 'KOR',
    'BEAT-0005' => 'WFD',
    'BEAT-0006' => 'MLS',
    'BEAT-0007' => 'RAJ',
    'BEAT-0008' => 'YEL',
    'BEAT-0009' => 'EC',
    'BEAT-0010' => 'MYC'
};

List<Beat__c> coreBeats = [
    SELECT Id, Name, Beat_ID__c,
        (SELECT Id, Name FROM Retailers__r ORDER BY Name)
    FROM Beat__c
    WHERE Beat_ID__c != null
    ORDER BY Beat_ID__c
];

List<Retailer__c> outletsToRename = new List<Retailer__c>();

for (Beat__c beat : coreBeats) {
    if (beat.Retailers__r.size() != 10) {
        throw new IllegalArgumentException(
            beat.Name + ' must have exactly 10 outlets. Current count: ' +
            beat.Retailers__r.size()
        );
    }

    List<String> desiredNames = new List<String>();
    for (String storeType : storeTypes) {
        desiredNames.add(areaCodeByBeatId.get(beat.Beat_ID__c) + ' ' + storeType);
    }

    // Balaji Stores is existing business data, so keep it in MG Road Beat.
    if (beat.Beat_ID__c == 'BEAT-0001') {
        desiredNames[0] = 'Balaji Stores';
    }

    for (Integer index = 0; index < beat.Retailers__r.size(); index++) {
        Retailer__c outlet = beat.Retailers__r[index];
        String newName = desiredNames[index];
        if (outlet.Name != newName) {
            outlet.Name = newName;
            outletsToRename.add(outlet);
        }
    }
}

if (!outletsToRename.isEmpty()) {
    update outletsToRename;
}

System.debug('Renamed ' + outletsToRename.size() + ' generated outlet names.');
