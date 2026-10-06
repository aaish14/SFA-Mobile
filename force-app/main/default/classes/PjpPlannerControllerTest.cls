@IsTest
private class PjpPlannerControllerTest {
    @TestSetup
    static void setupData() {
        Geography__c geography = new Geography__c(
            Name = 'MG Road', Nation__c = 'India', State__c = 'Karnataka',
            District__c = 'Bengaluru Urban', Town__c = 'MG Road'
        );
        insert geography;
        Employee__c manager = new Employee__c(
            Name = 'Dinesh', Aadhaar_Number__c = '123456789001', PAN_Number__c = 'DINAA0001A',
            Phone__c = '9000000001', Emergency_Contact__c = '9000000011',
            Geography__c = geography.Id, Hierarchy_Level__c = 'L2'
        );
        insert manager;
        Employee__c representative = new Employee__c(
            Name = 'Dhanush', Aadhaar_Number__c = '123456789002', PAN_Number__c = 'DHANU0002A',
            Phone__c = '9000000002', Emergency_Contact__c = '9000000012',
            Geography__c = geography.Id, Reporting_Manager__c = manager.Id, Hierarchy_Level__c = 'L1'
        );
        insert representative;
        insert new Beat__c(Name = 'MG Road Beat', Active__c = true, Geography__c = geography.Id, Assigned_Employee__c = representative.Id);
    }

    @IsTest
    static void savesSubmitsAndApprovesPlan() {
        Employee__c representative = [SELECT Id FROM Employee__c WHERE Name = 'Dhanush'];
        Beat__c beat = [SELECT Id FROM Beat__c LIMIT 1];
        Date planDate = Date.newInstance(2026, 10, 6);
        Test.startTest();
        Id planId = PjpPlannerController.saveDay(representative.Id, beat.Id, planDate);
        Integer submitted = PjpPlannerController.submitMonth(representative.Id, Date.newInstance(2026, 10, 1));
        PjpPlannerController.decidePlan(planId, true, null);
        Test.stopTest();
        Permanent_Journey_Plan__c plan = [SELECT Status__c, Approver__c FROM Permanent_Journey_Plan__c WHERE Id = :planId];
        System.assertEquals(1, submitted);
        System.assertEquals('Approved', plan.Status__c);
        System.assertNotEquals(null, plan.Approver__c);
        System.assertEquals(1, PjpPlannerController.getMonthPlans(representative.Id, Date.newInstance(2026, 10, 1)).size());
    }

    @IsTest
    static void copiesBeatGeographyToOutlet() {
        Beat__c beat = [SELECT Id, Geography__c FROM Beat__c LIMIT 1];
        Retailer__c outlet = new Retailer__c(
            Name = 'Balaji Stores', Beat__c = beat.Id, Phone__c = '9111111111',
            Aadhaar_Number__c = '223456789001', PAN_Number__c = 'BALAJ0001A'
        );
        insert outlet;
        outlet = [SELECT Geography__c FROM Retailer__c WHERE Id = :outlet.Id];
        System.assertEquals(beat.Geography__c, outlet.Geography__c);
    }
}