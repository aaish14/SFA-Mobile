public with sharing class PjpPlannerController {
    public class PlanRow {
        @AuraEnabled public Id id;
        @AuraEnabled public Date planDate;
        @AuraEnabled public Id employeeId;
        @AuraEnabled public Id beatId;
        @AuraEnabled public String beatName;
        @AuraEnabled public String status;
    }

    @AuraEnabled(cacheable=true)
    public static List<Beat__c> getBeats() {
        return [SELECT Id, Name FROM Beat__c WHERE Active__c = true ORDER BY Name];
    }

    @AuraEnabled(cacheable=true)
    public static List<PlanRow> getMonthPlans(Id employeeId, Date monthStart) {
        List<PlanRow> result = new List<PlanRow>();
        if (employeeId == null || monthStart == null) return result;
        Date firstDay = Date.newInstance(monthStart.year(), monthStart.month(), 1);
        Date nextMonth = firstDay.addMonths(1);
        for (Permanent_Journey_Plan__c plan : [
            SELECT Id, Plan_Date__c, Employee__c, Beat__c, Beat__r.Name, Status__c
            FROM Permanent_Journey_Plan__c
            WHERE Employee__c = :employeeId
              AND Plan_Date__c >= :firstDay AND Plan_Date__c < :nextMonth
            ORDER BY Plan_Date__c
        ]) {
            PlanRow row = new PlanRow();
            row.id = plan.Id;
            row.planDate = plan.Plan_Date__c;
            row.employeeId = plan.Employee__c;
            row.beatId = plan.Beat__c;
            row.beatName = plan.Beat__r.Name;
            row.status = plan.Status__c;
            result.add(row);
        }
        return result;
    }

    @AuraEnabled
    public static Id saveDay(Id employeeId, Id beatId, Date planDate) {
        if (employeeId == null || beatId == null || planDate == null) {
            throw new AuraHandledException('Employee, beat and date are required.');
        }
        List<Permanent_Journey_Plan__c> existing = [
            SELECT Id, Status__c FROM Permanent_Journey_Plan__c
            WHERE Employee__c = :employeeId AND Plan_Date__c = :planDate LIMIT 1
        ];
        Permanent_Journey_Plan__c plan = existing.isEmpty()
            ? new Permanent_Journey_Plan__c(
                Name = 'PJP ' + String.valueOf(planDate),
                Employee__c = employeeId,
                Plan_Date__c = planDate,
                Planned_Date__c = planDate,
                Status__c = 'Draft'
              )
            : existing[0];
        if (plan.Status__c != 'Draft' && plan.Status__c != 'Rejected') {
            throw new AuraHandledException('Only Draft or Rejected plans can be changed.');
        }
        plan.Beat__c = beatId;
        plan.Status__c = 'Draft';
        upsert plan;
        return plan.Id;
    }

    @AuraEnabled
    public static Integer submitMonth(Id employeeId, Date monthStart) {
        if (employeeId == null || monthStart == null) {
            throw new AuraHandledException('Select an employee and month first.');
        }
        Date firstDay = Date.newInstance(monthStart.year(), monthStart.month(), 1);
        Date nextMonth = firstDay.addMonths(1);
        List<Permanent_Journey_Plan__c> plans = [
            SELECT Id, Status__c, Approver__c, Approver__r.Salesforce_User__c
            FROM Permanent_Journey_Plan__c
            WHERE Employee__c = :employeeId AND Plan_Date__c >= :firstDay
              AND Plan_Date__c < :nextMonth AND Status__c IN ('Draft', 'Rejected')
        ];
        if (plans.isEmpty()) throw new AuraHandledException('Add at least one beat before submitting.');
        for (Permanent_Journey_Plan__c plan : plans) {
            if (plan.Approver__c == null) throw new AuraHandledException('The employee does not have a reporting manager.');
            plan.Status__c = 'Pending';
            plan.Rejection_Reason__c = null;
        }
        update plans;
        sendManagerNotification(plans, employeeId, firstDay);
        return plans.size();
    }

    @AuraEnabled(cacheable=true)
    public static List<Permanent_Journey_Plan__c> getPendingApprovals() {
        List<Employee__c> managers = [SELECT Id FROM Employee__c WHERE Salesforce_User__c = :UserInfo.getUserId() LIMIT 1];
        if (managers.isEmpty()) return new List<Permanent_Journey_Plan__c>();
        return [
            SELECT Id, Name, Plan_Date__c, Employee__r.Name, Beat__r.Name, Status__c
            FROM Permanent_Journey_Plan__c
            WHERE Approver__c = :managers[0].Id AND Status__c = 'Pending'
            ORDER BY Plan_Date__c
        ];
    }

    @AuraEnabled
    public static void decidePlan(Id planId, Boolean approve, String rejectionReason) {
        Permanent_Journey_Plan__c plan = [
            SELECT Id, Status__c FROM Permanent_Journey_Plan__c WHERE Id = :planId LIMIT 1 FOR UPDATE
        ];
        if (plan.Status__c != 'Pending') throw new AuraHandledException('This plan is no longer pending approval.');
        if (!approve && String.isBlank(rejectionReason)) throw new AuraHandledException('Enter a rejection reason.');
        plan.Status__c = approve ? 'Approved' : 'Rejected';
        plan.Rejection_Reason__c = approve ? null : rejectionReason.trim();
        update plan;
    }

    private static void sendManagerNotification(List<Permanent_Journey_Plan__c> plans, Id employeeId, Date monthStart) {
        Set<String> recipients = new Set<String>();
        for (Permanent_Journey_Plan__c plan : plans) {
            if (plan.Approver__r.Salesforce_User__c != null) recipients.add(String.valueOf(plan.Approver__r.Salesforce_User__c));
        }
        if (recipients.isEmpty()) return;
        List<CustomNotificationType> types = [SELECT Id FROM CustomNotificationType WHERE DeveloperName = 'PJP_Approval_Notification' LIMIT 1];
        if (types.isEmpty()) return;
        Messaging.CustomNotification notice = new Messaging.CustomNotification();
        notice.setNotificationTypeId(types[0].Id);
        notice.setTitle('PJP approval required');
        notice.setBody('A monthly journey plan has been submitted for approval.');
        notice.setTargetId(plans[0].Id);
        notice.send(recipients);
    }
}