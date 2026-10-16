/** Materializes approved PJP beats into the allocations consumed by the mobile API. */
public without sharing class SfaPjpAllocationService {
    public static void afterSave(List<Permanent_Journey_Plan__c> plans, Map<Id, Permanent_Journey_Plan__c> oldPlans) {
        Set<Id> approvedIds = new Set<Id>();
        for (Permanent_Journey_Plan__c plan : plans) {
            Permanent_Journey_Plan__c previous = oldPlans == null ? null : oldPlans.get(plan.Id);
            if (plan.Status__c == 'Approved' && plan.Employee__c != null &&
                (previous == null || previous.Status__c != 'Approved' ||
                 previous.Employee__c != plan.Employee__c || previous.Beat__c != plan.Beat__c)) {
                approvedIds.add(plan.Id);
            }
        }
        syncApprovedPlans(approvedIds);
    }

    // Also used by the one-time backfill. No approval state is changed here.
    // This is trigger-only system work, not an Aura/REST entry point.
    public static void syncApprovedPlans(Set<Id> planIds) {
        if (planIds == null || planIds.isEmpty()) return;
        List<Permanent_Journey_Plan__c> plans = [
            SELECT Id, Name, Employee__c, Beat__c,
                   (SELECT Beat__c FROM Selected_Beats__r)
            FROM Permanent_Journey_Plan__c
            WHERE Id IN :planIds AND Status__c = 'Approved'
              AND Employee__c != null AND Employee__r.Active__c = true
            WITH SYSTEM_MODE
        ];
        Map<Id, Set<Id>> employeesByBeat = new Map<Id, Set<Id>>();
        Set<Id> employeeIds = new Set<Id>();
        for (Permanent_Journey_Plan__c plan : plans) {
            employeeIds.add(plan.Employee__c);
            Set<Id> selectedBeats = new Set<Id>();
            for (PJP_Selected_Beat__c selection : plan.Selected_Beats__r) {
                if (selection.Beat__c != null) selectedBeats.add(selection.Beat__c);
            }
            // Older single-beat plans do not have junction records.
            if (selectedBeats.isEmpty() && plan.Beat__c != null) selectedBeats.add(plan.Beat__c);
            for (Id beatId : selectedBeats) {
                if (!employeesByBeat.containsKey(beatId)) employeesByBeat.put(beatId, new Set<Id>());
                employeesByBeat.get(beatId).add(plan.Employee__c);
            }
        }
        if (employeesByBeat.isEmpty()) return;

        // Serialize overlapping approvals for the same employee before looking up
        // existing allocations, so concurrent approvals cannot insert duplicates.
        List<Employee__c> lockedEmployees = [SELECT Id FROM Employee__c WHERE Id IN :employeeIds WITH SYSTEM_MODE FOR UPDATE];
        Set<Id> beatIds = employeesByBeat.keySet();
        List<Retailer__c> outlets = [
            SELECT Id, Beat__c FROM Retailer__c
            WHERE Beat__c IN :beatIds AND Active__c = true
            WITH SYSTEM_MODE
        ];
        Map<String, Distributor_Outlet_Allocation__c> existingByPair = new Map<String, Distributor_Outlet_Allocation__c>();
        Set<Id> outletIds = new Map<Id, Retailer__c>(outlets).keySet();
        for (Distributor_Outlet_Allocation__c allocation : [
            SELECT Id, Employee__c, Outlet__c, Beat__c, Allocation_Status__c
            FROM Distributor_Outlet_Allocation__c
            WHERE Employee__c IN :employeeIds AND Outlet__c IN :outletIds
            WITH SYSTEM_MODE
            ORDER BY CreatedDate
        ]) {
            String key = pairKey(allocation.Employee__c, allocation.Outlet__c);
            if (!existingByPair.containsKey(key) || allocation.Allocation_Status__c == 'Active') {
                existingByPair.put(key, allocation);
            }
        }
        List<Distributor_Outlet_Allocation__c> inserts = new List<Distributor_Outlet_Allocation__c>();
        List<Distributor_Outlet_Allocation__c> updates = new List<Distributor_Outlet_Allocation__c>();
        for (Retailer__c outlet : outlets) {
            for (Id employeeId : employeesByBeat.get(outlet.Beat__c)) {
                String key = pairKey(employeeId, outlet.Id);
                Distributor_Outlet_Allocation__c existing = existingByPair.get(key);
                if (existing == null) {
                    inserts.add(new Distributor_Outlet_Allocation__c(
                        Employee__c = employeeId, Outlet__c = outlet.Id, Beat__c = outlet.Beat__c,
                        Allocation_Status__c = 'Active', Allocation_Date__c = Date.today(),
                        Remarks__c = 'Automatically allocated from an approved Permanent Journey Plan.'
                    ));
                } else if (existing.Allocation_Status__c != 'Active' || existing.Beat__c != outlet.Beat__c) {
                    existing.Allocation_Status__c = 'Active';
                    existing.Beat__c = outlet.Beat__c;
                    updates.add(existing);
                }
            }
        }
        // Fail the approval transaction if allocation fails; do not silently approve
        // a plan whose outlets cannot be made available to its employee.
        if (!inserts.isEmpty()) Database.insert(inserts, AccessLevel.SYSTEM_MODE);
        if (!updates.isEmpty()) Database.update(updates, AccessLevel.SYSTEM_MODE);
    }

    private static String pairKey(Id employeeId, Id outletId) {
        return String.valueOf(employeeId) + ':' + String.valueOf(outletId);
    }
}