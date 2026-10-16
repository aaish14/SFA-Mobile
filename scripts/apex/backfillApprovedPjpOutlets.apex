List<Permanent_Journey_Plan__c> approvedPlans = [
    SELECT Id, Beat__c, Approved_Outlet_Names__c,
           (SELECT Beat__c FROM Selected_Beats__r)
    FROM Permanent_Journey_Plan__c
    WHERE Status__c = 'Approved'
];

Map<Id, Set<Id>> beatIdsByPlan = new Map<Id, Set<Id>>();
Set<Id> allBeatIds = new Set<Id>();
for (Permanent_Journey_Plan__c plan : approvedPlans) {
    Set<Id> beatIds = new Set<Id>();
    for (PJP_Selected_Beat__c selection : plan.Selected_Beats__r) {
        if (selection.Beat__c != null) beatIds.add(selection.Beat__c);
    }
    if (beatIds.isEmpty() && plan.Beat__c != null) beatIds.add(plan.Beat__c);
    beatIdsByPlan.put(plan.Id, beatIds);
    allBeatIds.addAll(beatIds);
}

Map<Id, List<String>> outletNamesByBeat = new Map<Id, List<String>>();
for (Retailer__c outlet : [
    SELECT Name, Beat__c FROM Retailer__c
    WHERE Beat__c IN :allBeatIds AND Active__c = true
    ORDER BY Name
]) {
    if (!outletNamesByBeat.containsKey(outlet.Beat__c)) {
        outletNamesByBeat.put(outlet.Beat__c, new List<String>());
    }
    outletNamesByBeat.get(outlet.Beat__c).add(outlet.Name);
}

for (Permanent_Journey_Plan__c plan : approvedPlans) {
    List<String> outletNames = new List<String>();
    for (Id beatId : beatIdsByPlan.get(plan.Id)) {
        if (outletNamesByBeat.containsKey(beatId)) {
            outletNames.addAll(outletNamesByBeat.get(beatId));
        }
    }
    String joinedNames = String.join(outletNames, ', ');
    plan.Approved_Outlet_Names__c = joinedNames.length() > 255
        ? joinedNames.substring(0, 252) + '...'
        : joinedNames;
}

if (!approvedPlans.isEmpty()) update approvedPlans;
System.debug('Backfilled approved outlet names for ' + approvedPlans.size() + ' PJP records.');
