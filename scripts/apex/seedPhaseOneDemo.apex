// Phase 1 demonstration setup. Existing employee and geography names are preserved.
Map<String, String> employeeCodes = new Map<String, String>{
    'Dhanush' => 'EMP-0001',
    'Dinesh' => 'EMP-0002',
    'Aishwarya' => 'EMP-0003',
    'Ram' => 'EMP-0004'
};

List<Employee__c> employeesToUpdate = new List<Employee__c>();
for (Employee__c employee : [
    SELECT Id, Name, Active__c, Employee_Code__c
    FROM Employee__c
    WHERE Name IN :employeeCodes.keySet()
]) {
    employee.Active__c = true;
    employee.Employee_Code__c = employeeCodes.get(employee.Name);
    employeesToUpdate.add(employee);
}
update employeesToUpdate;

// Recalculate outlet totals without renaming or removing any existing Beat.
Map<Id, Integer> outletCountByBeat = new Map<Id, Integer>();
for (AggregateResult resultRow : [
    SELECT Beat__c beatId, COUNT(Id) outletCount
    FROM Retailer__c
    WHERE Beat__c != null
    GROUP BY Beat__c
]) {
    outletCountByBeat.put((Id) resultRow.get('beatId'), (Integer) resultRow.get('outletCount'));
}
List<Beat__c> beatsToUpdate = new List<Beat__c>();
for (Beat__c beat : [
    SELECT Id, Outlet_Count__c
    FROM Beat__c
    WHERE Assigned_Employee__c != null OR Active__c = false
]) {
    beat.Outlet_Count__c = outletCountByBeat.containsKey(beat.Id)
        ? outletCountByBeat.get(beat.Id)
        : 0;
    beatsToUpdate.add(beat);
}
update beatsToUpdate;

Employee__c dhanush = [
    SELECT Id, Salesforce_User__c, Reporting_Manager__c
    FROM Employee__c
    WHERE Name = 'Dhanush'
    LIMIT 1
];
List<Beat__c> demonstrationBeats = [
    SELECT Id, Name
    FROM Beat__c
    WHERE Beat_ID__c IN ('BEAT-0001', 'BEAT-0002')
      AND Assigned_Employee__c = :dhanush.Id
    ORDER BY Beat_ID__c
];
if (demonstrationBeats.size() != 2) {
    throw new IllegalArgumentException('The two demonstration Beats were not found for Dhanush.');
}

List<Permanent_Journey_Plan__c> existingPlans = [
    SELECT Id
    FROM Permanent_Journey_Plan__c
    WHERE Name = 'Dhanush October PJP'
    LIMIT 1
];
Permanent_Journey_Plan__c plan = existingPlans.isEmpty()
    ? new Permanent_Journey_Plan__c(Name = 'Dhanush October PJP')
    : existingPlans[0];
plan.Employee__c = dhanush.Id;
plan.Approver__c = dhanush.Reporting_Manager__c;
plan.Sales_Representative__c = dhanush.Salesforce_User__c;
plan.Beat__c = demonstrationBeats[0].Id;
plan.Plan_Date__c = Date.newInstance(2026, 10, 1);
plan.Planned_Date__c = Date.newInstance(2026, 10, 1);
plan.Planning_Start_Date__c = Date.newInstance(2026, 10, 1);
plan.Planning_End_Date__c = Date.newInstance(2026, 10, 30);
plan.Status__c = 'Draft';
plan.Rejection_Reason__c = null;
upsert plan;

delete [SELECT Id FROM PJP_Selected_Beat__c WHERE PJP__c = :plan.Id];
List<PJP_Selected_Beat__c> selections = new List<PJP_Selected_Beat__c>();
for (Beat__c beat : demonstrationBeats) {
    selections.add(new PJP_Selected_Beat__c(
        PJP__c = plan.Id,
        Beat__c = beat.Id,
        Unique_Key__c = plan.Id + '-' + beat.Id
    ));
}
insert selections;

System.debug('Phase 1 demonstration PJP prepared: ' + plan.Id);
