// Assign a realistic map position to every SFA outlet while preserving its name,
// beat, distributor allocation, owner and all commercial information.
Map<String, List<Decimal>> beatCentres = new Map<String, List<Decimal>>{
    'Central Market Beat' => new List<Decimal>{12.9756, 77.6066},
    'MG Road Beat' => new List<Decimal>{12.9756, 77.6066},
    'MG Road 3rd cross' => new List<Decimal>{12.9759, 77.6072},
    'Electronic City Beat' => new List<Decimal>{12.8452, 77.6602},
    'Indiranagar Beat' => new List<Decimal>{12.9784, 77.6408},
    'Jayanagar Beat' => new List<Decimal>{12.9250, 77.5938},
    'Koramangala Beat' => new List<Decimal>{12.9352, 77.6245},
    'Lakeside Market Beat' => new List<Decimal>{12.9817, 77.6204},
    'Malleshwaram Beat' => new List<Decimal>{13.0035, 77.5648},
    'Mysuru Central Beat' => new List<Decimal>{12.3052, 76.6552},
    'Rajajinagar Beat' => new List<Decimal>{12.9915, 77.5548},
    'Whitefield Beat' => new List<Decimal>{12.9698, 77.7500},
    'Yelahanka Beat' => new List<Decimal>{13.1007, 77.5963},
    'Yeshwanthpur Beat' => new List<Decimal>{13.0285, 77.5408}
};

Map<String, Integer> outletNumberByBeat = new Map<String, Integer>();
List<Retailer__c> outlets = [
    SELECT Id, Name, Address__c, Beat__r.Name
    FROM Retailer__c
    ORDER BY Beat__r.Name, Name
];

for (Retailer__c outlet : outlets) {
    String beatName = outlet.Beat__r == null ? 'MG Road Beat' : outlet.Beat__r.Name;
    List<Decimal> centre = beatCentres.get(beatName);
    if (centre == null) centre = beatCentres.get('MG Road Beat');

    Integer sequence = outletNumberByBeat.containsKey(beatName)
        ? outletNumberByBeat.get(beatName)
        : 0;
    outletNumberByBeat.put(beatName, sequence + 1);

    // Arrange shops in a compact grid around their beat centre. Each outlet gets
    // a distinct position while remaining inside its actual sales territory.
    Integer rowNumber = sequence / 5;
    Integer columnNumber = Math.mod(sequence, 5);
    Decimal latitude = centre[0] + ((Decimal.valueOf(String.valueOf(rowNumber)) - 1) * 0.00035);
    Decimal longitude = centre[1] + ((Decimal.valueOf(String.valueOf(columnNumber)) - 2) * 0.00035);

    outlet.Geo_Location__Latitude__s = latitude;
    outlet.Geo_Location__Longitude__s = longitude;
    outlet.Latitude__c = latitude;
    outlet.Longitude__c = longitude;

    if (String.isBlank(outlet.Address__c)) {
        String areaName = beatName.replace(' Beat', '');
        outlet.Address__c = outlet.Name + ', ' + areaName + ', Karnataka';
    }
}

update outlets;
System.debug('Updated location data for ' + outlets.size() + ' outlets.');
