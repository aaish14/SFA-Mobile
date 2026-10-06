public with sharing class SfaAdminController {
    public class AdminDashboard {
        @AuraEnabled public Date businessDate;
        @AuraEnabled public Integer representativesLoggedIn = 0;
        @AuraEnabled public Integer representativesLoggedOut = 0;
        @AuraEnabled public Integer visitsPlanned = 0;
        @AuraEnabled public Integer visitsCompleted = 0;
        @AuraEnabled public Integer ordersCaptured = 0;
        @AuraEnabled public Decimal salesValue = 0;
        @AuraEnabled public List<AttendanceRow> attendance = new List<AttendanceRow>();
    }

    public class AttendanceRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String salesRepresentative;
        @AuraEnabled public Datetime loginTime;
        @AuraEnabled public Decimal loginLatitude;
        @AuraEnabled public Decimal loginLongitude;
        @AuraEnabled public Datetime logoutTime;
        @AuraEnabled public Decimal logoutLatitude;
        @AuraEnabled public Decimal logoutLongitude;
        @AuraEnabled public String status;
        @AuraEnabled public Integer completedVisits = 0;
        @AuraEnabled public Integer ordersCaptured = 0;
        @AuraEnabled public Decimal salesValue = 0;
    }

    @AuraEnabled(cacheable=true)
    public static AdminDashboard getAdminDashboard() {
        AdminDashboard result = new AdminDashboard();
        result.businessDate = Date.today();

        Map<Id, AttendanceRow> rowsByUser = new Map<Id, AttendanceRow>();
        for (Attendance__c item : [
            SELECT Id, Sales_Representative__c, Sales_Representative__r.Name, Start_Time__c,
                   Start_Latitude__c, Start_Longitude__c, End_Time__c, End_Latitude__c,
                   End_Longitude__c, Status__c
            FROM Attendance__c WHERE Attendance_Date__c = :Date.today()
            ORDER BY Start_Time__c DESC
        ]) {
            AttendanceRow row = new AttendanceRow();
            row.id = item.Id;
            row.salesRepresentative = item.Sales_Representative__r.Name;
            row.loginTime = item.Start_Time__c;
            row.loginLatitude = item.Start_Latitude__c;
            row.loginLongitude = item.Start_Longitude__c;
            row.logoutTime = item.End_Time__c;
            row.logoutLatitude = item.End_Latitude__c;
            row.logoutLongitude = item.End_Longitude__c;
            row.status = item.Status__c;
            result.attendance.add(row);
            rowsByUser.put(item.Sales_Representative__c, row);
            result.representativesLoggedIn++;
            if (item.End_Time__c != null) result.representativesLoggedOut++;
        }

        for (AggregateResult visitTotal : [
            SELECT Permanent_Journey_Plan__r.Sales_Representative__c repId, Status__c status, COUNT(Id) total
            FROM Visit__c WHERE Permanent_Journey_Plan__r.Plan_Date__c = :Date.today()
            GROUP BY Permanent_Journey_Plan__r.Sales_Representative__c, Status__c
        ]) {
            Integer countValue = (Integer) visitTotal.get('total');
            result.visitsPlanned += countValue;
            if ((String) visitTotal.get('status') == 'Completed') {
                result.visitsCompleted += countValue;
                AttendanceRow row = rowsByUser.get((Id) visitTotal.get('repId'));
                if (row != null) row.completedVisits = countValue;
            }
        }

        for (AggregateResult orderTotal : [
            SELECT Visit__r.Permanent_Journey_Plan__r.Sales_Representative__c repId,
                   COUNT(Id) total, SUM(Total_Amount__c) value
            FROM Sales_Order__c WHERE Order_Date__c = :Date.today()
            GROUP BY Visit__r.Permanent_Journey_Plan__r.Sales_Representative__c
        ]) {
            Integer countValue = (Integer) orderTotal.get('total');
            Decimal salesValue = (Decimal) orderTotal.get('value');
            if (salesValue == null) salesValue = 0;
            result.ordersCaptured += countValue;
            result.salesValue += salesValue;
            AttendanceRow row = rowsByUser.get((Id) orderTotal.get('repId'));
            if (row != null) {
                row.ordersCaptured = countValue;
                row.salesValue = salesValue;
            }
        }
        return result;
    }
}