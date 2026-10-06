@IsTest
private class SfaAdminControllerTest {
    @IsTest
    static void returnsDistributorSummaryAndAttendance() {
        Attendance__c attendance = new Attendance__c(
            Sales_Representative__c = UserInfo.getUserId(), Attendance_Date__c = Date.today(),
            Start_Time__c = System.now().addHours(-8), End_Time__c = System.now(),
            Start_Latitude__c = 12.9716, Start_Longitude__c = 77.5946,
            End_Latitude__c = 12.9720, End_Longitude__c = 77.5950, Status__c = 'Completed'
        );
        insert attendance;
        Test.startTest();
        SfaAdminController.AdminDashboard dashboard = SfaAdminController.getAdminDashboard();
        Test.stopTest();
        System.assertEquals(1, dashboard.representativesLoggedIn);
        System.assertEquals(1, dashboard.representativesLoggedOut);
        System.assertEquals(1, dashboard.attendance.size());
        System.assertEquals('Completed', dashboard.attendance[0].status);
    }
}