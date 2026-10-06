public with sharing class SfaPhaseOnePjpController {
    public class ContextRow {
        @AuraEnabled public Id employeeId;
        @AuraEnabled public String employeeName;
        @AuraEnabled public Boolean active;
        @AuraEnabled public Id managerId;
        @AuraEnabled public String managerName;
    }

    public class PjpRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String employeeName;
        @AuraEnabled public Date startDate;
        @AuraEnabled public Date endDate;
        @AuraEnabled public String status;
        @AuraEnabled public String approverName;
        @AuraEnabled public Datetime submittedDate;
        @AuraEnabled public Datetime approvedDate;
        @AuraEnabled public Datetime rejectedDate;
        @AuraEnabled public String rejectionReason;
        @AuraEnabled public List<Id> beatIds = new List<Id>();
        @AuraEnabled public List<String> beatNames = new List<String>();
    }

    @AuraEnabled(cacheable=true)
    public static ContextRow getMyContext() {
        Employee__c employee = currentEmployee();
        ContextRow row = new ContextRow();
        row.employeeId = employee.Id;
        row.employeeName = employee.Name;
        row.active = employee.Active__c;
        row.managerId = employee.Reporting_Manager__c;
        row.managerName = employee.Reporting_Manager__r == null ? null : employee.Reporting_Manager__r.Name;
        return row;
    }

    @AuraEnabled(cacheable=true)
    public static List<Beat__c> getMyBeats() {
        Employee__c employee = currentEmployee();
        return [
            SELECT Id, Name, Beat_ID__c, Geography__r.Name
            FROM Beat__c
            WHERE Assigned_Employee__c = :employee.Id AND Active__c = true
            ORDER BY Name
        ];
    }

    @AuraEnabled
    public static List<PjpRow> getMyPjps() {
        Employee__c employee = currentEmployee();
        return toRows([
            SELECT Id, Name, Employee__r.Name, Planning_Start_Date__c, Planning_End_Date__c,
                   Status__c, Approver__r.Name, Submitted_Date__c, Approved_Date__c,
                   Rejected_Date__c, Rejection_Reason__c,
                   (SELECT Beat__c, Beat__r.Name FROM Selected_Beats__r ORDER BY Beat__r.Name)
            FROM Permanent_Journey_Plan__c
            WHERE Employee__c = :employee.Id AND Planning_Start_Date__c != null
            ORDER BY CreatedDate DESC
        ]);
    }

    @AuraEnabled
    public static List<PjpRow> getMyApprovals() {
        Employee__c manager = currentEmployee();
        return toRows([
            SELECT Id, Name, Employee__r.Name, Planning_Start_Date__c, Planning_End_Date__c,
                   Status__c, Approver__r.Name, Submitted_Date__c, Approved_Date__c,
                   Rejected_Date__c, Rejection_Reason__c,
                   (SELECT Beat__c, Beat__r.Name FROM Selected_Beats__r ORDER BY Beat__r.Name)
            FROM Permanent_Journey_Plan__c
            WHERE Approver__c = :manager.Id AND Status__c = 'Submitted'
            ORDER BY Submitted_Date__c
        ]);
    }

    @AuraEnabled
    public static Id saveDraft(Id pjpId, Date startDate, Date endDate, List<Id> beatIds) {
        Employee__c employee = currentEmployee();
        validateEmployeeAndDates(employee, startDate, endDate);
        Set<Id> requestedBeatIds = new Set<Id>(beatIds == null ? new List<Id>() : beatIds);
        if (requestedBeatIds.isEmpty()) {
            throw new AuraHandledException('Select at least one Beat.');
        }

        Id employeeId = employee.Id;
        List<Beat__c> authorizedBeats = Database.query(
            'SELECT Id FROM Beat__c WHERE Id IN :requestedBeatIds ' +
            'AND Assigned_Employee__c = :employeeId AND Active__c = true',
            AccessLevel.SYSTEM_MODE
        );
        if (authorizedBeats.size() != requestedBeatIds.size()) {
            throw new AuraHandledException('Only active Beats assigned to the logged-in employee can be selected.');
        }

        Permanent_Journey_Plan__c plan;
        if (pjpId == null) {
            plan = new Permanent_Journey_Plan__c(Employee__c = employee.Id);
        } else {
            plan = [
                SELECT Id, Employee__c, Status__c FROM Permanent_Journey_Plan__c
                WHERE Id = :pjpId AND Employee__c = :employee.Id LIMIT 1 FOR UPDATE
            ];
            if (plan.Status__c != 'Draft' && plan.Status__c != 'Rejected') {
                throw new AuraHandledException('Only Draft or Rejected PJPs can be edited.');
            }
        }

        plan.Name = employee.Name + ' ' + monthName(startDate.month()) + ' PJP';
        plan.Planning_Start_Date__c = startDate;
        plan.Planning_End_Date__c = endDate;
        plan.Plan_Date__c = startDate;
        plan.Planned_Date__c = startDate;
        plan.Employee__c = employee.Id;
        // Keep the original required Beat lookup populated for compatibility.
        // The complete multi-beat selection is stored in PJP_Selected_Beat__c.
        plan.Beat__c = authorizedBeats[0].Id;
        plan.Approver__c = employee.Reporting_Manager__c;
        plan.Status__c = 'Draft';
        plan.Rejection_Reason__c = null;
        upsert plan;

        Id savedPlanId = plan.Id;
        List<PJP_Selected_Beat__c> previousSelections = Database.query(
            'SELECT Id FROM PJP_Selected_Beat__c WHERE PJP__c = :savedPlanId',
            AccessLevel.SYSTEM_MODE
        );
        if (!previousSelections.isEmpty()) {
            Database.delete(previousSelections, AccessLevel.SYSTEM_MODE);
        }
        List<PJP_Selected_Beat__c> selections = new List<PJP_Selected_Beat__c>();
        for (Id beatId : requestedBeatIds) {
            selections.add(new PJP_Selected_Beat__c(
                PJP__c = plan.Id,
                Beat__c = beatId,
                Unique_Key__c = String.valueOf(plan.Id) + '-' + String.valueOf(beatId)
            ));
        }
        // The required junction fields do not expose separate field permissions.
        // Authorization was already enforced above, so write the child records in
        // system mode while the controller continues to run with sharing.
        Database.insert(selections, AccessLevel.SYSTEM_MODE);
        return plan.Id;
    }

    @AuraEnabled
    public static void submitPjp(Id pjpId) {
        Employee__c employee = currentEmployee();
        Permanent_Journey_Plan__c plan = [
            SELECT Id, Name, Employee__c, Employee__r.Name, Employee__r.Active__c,
                   Planning_Start_Date__c, Planning_End_Date__c, Status__c,
                   Approver__c, Approver__r.Salesforce_User__c,
                   (SELECT Id FROM Selected_Beats__r)
            FROM Permanent_Journey_Plan__c
            WHERE Id = :pjpId AND Employee__c = :employee.Id LIMIT 1 FOR UPDATE
        ];
        validateEmployeeAndDates(employee, plan.Planning_Start_Date__c, plan.Planning_End_Date__c);
        if (plan.Status__c != 'Draft' && plan.Status__c != 'Rejected') {
            throw new AuraHandledException('Only a Draft or Rejected PJP can be submitted.');
        }
        if (plan.Selected_Beats__r.isEmpty()) throw new AuraHandledException('Select at least one Beat.');
        if (plan.Approver__c == null || plan.Approver__r.Salesforce_User__c == null) {
            throw new AuraHandledException('The employee must have a reporting manager linked to a Salesforce user.');
        }
        if (plan.Approver__r.Salesforce_User__c == UserInfo.getUserId()) {
            throw new AuraHandledException('An employee cannot approve their own PJP.');
        }
        plan.Status__c = 'Submitted';
        plan.Submitted_Date__c = System.now();
        plan.Submitted_By__c = UserInfo.getUserId();
        plan.Approved_By__c = null;
        plan.Approved_Date__c = null;
        plan.Rejected_By__c = null;
        plan.Rejected_Date__c = null;
        // Audit fields are intentionally read-only to mobile users. Only this
        // validated server transition writes them.
        Database.update(plan, AccessLevel.SYSTEM_MODE);
        notifyManager(plan, plan.Selected_Beats__r.size());
    }

    @AuraEnabled
    public static void decidePjp(Id pjpId, Boolean approve, String rejectionReason) {
        Employee__c manager = currentEmployee();
        Permanent_Journey_Plan__c plan = [
            SELECT Id, Employee__c, Employee__r.Salesforce_User__c, Approver__c, Status__c
            FROM Permanent_Journey_Plan__c WHERE Id = :pjpId LIMIT 1 FOR UPDATE
        ];
        if (plan.Status__c != 'Submitted') throw new AuraHandledException('This PJP is no longer Submitted.');
        if (plan.Approver__c != manager.Id) throw new AuraHandledException('Only the configured approver can decide this PJP.');
        if (plan.Employee__r.Salesforce_User__c == UserInfo.getUserId()) {
            throw new AuraHandledException('An employee cannot approve their own PJP.');
        }
        if (!approve && String.isBlank(rejectionReason)) throw new AuraHandledException('Rejection reason is required.');

        if (approve) {
            plan.Status__c = 'Approved';
            plan.Approved_By__c = UserInfo.getUserId();
            plan.Approved_Date__c = System.now();
            plan.Rejection_Reason__c = null;
        } else {
            plan.Status__c = 'Rejected';
            plan.Rejected_By__c = UserInfo.getUserId();
            plan.Rejected_Date__c = System.now();
            plan.Rejection_Reason__c = rejectionReason.trim();
        }
        // Approval audit fields are protected from direct user edits.
        Database.update(plan, AccessLevel.SYSTEM_MODE);
    }

    private static Employee__c currentEmployee() {
        // Run this identity lookup in system mode. Access is still constrained by
        // the current user's Employee mapping and all returned business records
        // are filtered by that Employee id.
        Id currentUserId = UserInfo.getUserId();
        List<Employee__c> employees = Database.query(
            'SELECT Id, Name, Active__c, Reporting_Manager__c, Reporting_Manager__r.Name, ' +
            'Reporting_Manager__r.Salesforce_User__c FROM Employee__c ' +
            'WHERE Salesforce_User__c = :currentUserId LIMIT 1',
            AccessLevel.SYSTEM_MODE
        );
        if (employees.isEmpty()) throw new AuraHandledException('The logged-in user is not linked to an Employee record.');
        return employees[0];
    }

    private static void validateEmployeeAndDates(Employee__c employee, Date startDate, Date endDate) {
        if (employee.Active__c != true) throw new AuraHandledException('The employee is inactive.');
        if (startDate == null || endDate == null) throw new AuraHandledException('Planning Start Date and End Date are required.');
        if (endDate < startDate) throw new AuraHandledException('Planning End Date cannot be before Start Date.');
        if (employee.Reporting_Manager__c == null) throw new AuraHandledException('A reporting manager is required.');
    }

    private static List<PjpRow> toRows(List<Permanent_Journey_Plan__c> plans) {
        List<PjpRow> rows = new List<PjpRow>();
        for (Permanent_Journey_Plan__c plan : plans) {
            PjpRow row = new PjpRow();
            row.id = plan.Id; row.name = plan.Name; row.employeeName = plan.Employee__r.Name;
            row.startDate = plan.Planning_Start_Date__c; row.endDate = plan.Planning_End_Date__c;
            row.status = plan.Status__c; row.approverName = plan.Approver__r == null ? null : plan.Approver__r.Name;
            row.submittedDate = plan.Submitted_Date__c; row.approvedDate = plan.Approved_Date__c;
            row.rejectedDate = plan.Rejected_Date__c; row.rejectionReason = plan.Rejection_Reason__c;
            for (PJP_Selected_Beat__c selection : plan.Selected_Beats__r) {
                row.beatIds.add(selection.Beat__c); row.beatNames.add(selection.Beat__r.Name);
            }
            rows.add(row);
        }
        return rows;
    }

    private static void notifyManager(Permanent_Journey_Plan__c plan, Integer beatCount) {
        List<CustomNotificationType> types = [SELECT Id FROM CustomNotificationType WHERE DeveloperName = 'PJP_Approval_Notification' LIMIT 1];
        if (types.isEmpty()) return;
        Messaging.CustomNotification notification = new Messaging.CustomNotification();
        notification.setNotificationTypeId(types[0].Id);
        notification.setTitle('PJP Approval Required');
        notification.setBody(plan.Employee__r.Name + ' submitted a PJP for ' + plan.Planning_Start_Date__c.format()
            + ' to ' + plan.Planning_End_Date__c.format() + ' with ' + beatCount + ' selected Beat(s).');
        notification.setTargetId(plan.Id);
        notification.send(new Set<String>{ String.valueOf(plan.Approver__r.Salesforce_User__c) });
    }

    private static String monthName(Integer monthNumber) {
        return new List<String>{'January','February','March','April','May','June','July','August','September','October','November','December'}[monthNumber - 1];
    }
}