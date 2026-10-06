public with sharing class SfaRecordedScopeHandler {
    public static void copyBeatGeography(List<Retailer__c> outlets) {
        Set<Id> beatIds = new Set<Id>();
        for (Retailer__c outlet : outlets) {
            if (outlet.Beat__c != null) beatIds.add(outlet.Beat__c);
        }
        if (beatIds.isEmpty()) return;

        Map<Id, Beat__c> beats = new Map<Id, Beat__c>([
            SELECT Geography__c FROM Beat__c WHERE Id IN :beatIds
        ]);
        for (Retailer__c outlet : outlets) {
            Beat__c beat = beats.get(outlet.Beat__c);
            outlet.Geography__c = beat == null ? null : beat.Geography__c;
        }
    }

    public static void copyReportingManager(List<Permanent_Journey_Plan__c> plans) {
        Set<Id> employeeIds = new Set<Id>();
        for (Permanent_Journey_Plan__c plan : plans) {
            if (plan.Employee__c != null) employeeIds.add(plan.Employee__c);
        }
        if (employeeIds.isEmpty()) return;

        Map<Id, Employee__c> employees = new Map<Id, Employee__c>([
            SELECT Reporting_Manager__c FROM Employee__c WHERE Id IN :employeeIds
        ]);
        for (Permanent_Journey_Plan__c plan : plans) {
            Employee__c employee = employees.get(plan.Employee__c);
            plan.Approver__c = employee == null ? null : employee.Reporting_Manager__c;
        }
    }

    public static void refreshOutletCounts(List<Retailer__c> newRows, List<Retailer__c> oldRows) {
        Set<Id> beatIds = new Set<Id>();
        if (newRows != null) for (Retailer__c row : newRows) if (row.Beat__c != null) beatIds.add(row.Beat__c);
        if (oldRows != null) for (Retailer__c row : oldRows) if (row.Beat__c != null) beatIds.add(row.Beat__c);
        if (beatIds.isEmpty()) return;

        Map<Id, Integer> counts = new Map<Id, Integer>();
        for (AggregateResult result : [SELECT Beat__c beatId, COUNT(Id) outletCount FROM Retailer__c WHERE Beat__c IN :beatIds GROUP BY Beat__c]) {
            counts.put((Id) result.get('beatId'), (Integer) result.get('outletCount'));
        }
        Map<Id, List<String>> outletNamesByBeat = new Map<Id, List<String>>();
        for (Retailer__c outlet : [
            SELECT Name, Beat__c
            FROM Retailer__c
            WHERE Beat__c IN :beatIds
            ORDER BY Name
        ]) {
            if (!outletNamesByBeat.containsKey(outlet.Beat__c)) {
                outletNamesByBeat.put(outlet.Beat__c, new List<String>());
            }
            outletNamesByBeat.get(outlet.Beat__c).add(outlet.Name);
        }
        List<Beat__c> updates = new List<Beat__c>();
        for (Id beatId : beatIds) {
            String outletNames = outletNamesByBeat.containsKey(beatId)
                ? String.join(outletNamesByBeat.get(beatId), ', ')
                : '';
            if (outletNames.length() > 255) outletNames = outletNames.left(255);
            updates.add(new Beat__c(
                Id = beatId,
                Outlet_Count__c = counts.containsKey(beatId) ? counts.get(beatId) : 0,
                Outlet_Names__c = outletNames
            ));
        }
        update updates;
    }
}