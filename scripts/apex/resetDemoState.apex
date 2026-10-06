// Reset only the named SFA demonstration records for a clean walkthrough.
List<Attendance__c> attendance = [
    SELECT Id, Start_Time__c, End_Time__c, Status__c
    FROM Attendance__c
    WHERE Sales_Representative__c = :UserInfo.getUserId()
      AND Attendance_Date__c = :Date.today()
    ORDER BY CreatedDate DESC
    LIMIT 1
];
if (!attendance.isEmpty()) {
    attendance[0].Start_Time__c = System.now();
    attendance[0].End_Time__c = null;
    attendance[0].Status__c = 'Started';
    update attendance[0];
}

List<Visit__c> visits = [
    SELECT Id, Status__c, Check_In_Time__c, Check_Out_Time__c, Missed_Reason__c
    FROM Visit__c
    WHERE Name = 'Lakshmi Stores Visit'
      AND Visit_Date__c = :Date.today()
    LIMIT 1
];
if (!visits.isEmpty()) {
    visits[0].Status__c = 'Planned';
    visits[0].Check_In_Time__c = null;
    visits[0].Check_Out_Time__c = null;
    visits[0].Missed_Reason__c = null;
    update visits[0];
}
