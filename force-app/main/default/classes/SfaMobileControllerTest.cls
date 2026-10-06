@IsTest
private class SfaMobileControllerTest {
    @TestSetup
    static void createData() {
        // This legacy journey test does not need employee ownership. Keep the beat
        // inactive so it does not violate the Phase 1 rule for active beats.
        Beat__c beat = new Beat__c(Name = 'Central Route', Active__c = false); insert beat;
        Retailer__c retailer = new Retailer__c(Name = 'Lakshmi Stores', Address__c = 'MG Road', Beat__c = beat.Id); insert retailer;
        Permanent_Journey_Plan__c plan = new Permanent_Journey_Plan__c(
            Name = 'Today Plan',
            Plan_Date__c = Date.today(),
            Planned_Date__c = Date.today(),
            Sales_Representative__c = UserInfo.getUserId(),
            Beat__c = beat.Id
        );
        insert plan;
        insert new Visit__c(Name = 'Visit 1', Visit_Date__c = Date.today(), Permanent_Journey_Plan__c = plan.Id, Retailer__c = retailer.Id, Status__c = 'Planned');
        insert new Product__c(Name = 'Parle-G', Product_Code__c = 'PG-001', Brand__c = 'Parle', MRP__c = 5, Retailer_Base_Price__c = 4.5, Available_Stock__c = 500, Units_Per_Case__c = 50, Active__c = true);
        insert new Scheme__c(Name = 'Buy 2 Get 1', Scheme_Code__c = 'B2G1', Scheme_Type__c = 'Same Product Free', Start_Date__c = Date.today(), End_Date__c = Date.today().addDays(7), Active__c = true);
    }

    @IsTest
    static void runsCompleteDailyJourney() {
        Id attendanceId = SfaMobileController.startDay(12.9716, 77.5946);
        System.assertEquals(attendanceId, SfaMobileController.startDay(12.9716, 77.5946), 'Start must be idempotent.');
        Visit__c visit = [SELECT Id FROM Visit__c LIMIT 1];
        Product__c product = [SELECT Id FROM Product__c LIMIT 1];
        SfaMobileController.checkIn(visit.Id);
        String lines = JSON.serialize(new List<Map<String, Object>>{ new Map<String, Object>{ 'productId' => product.Id, 'cases' => 1, 'pieces' => 2 } });
        Id orderId = SfaMobileController.saveOrder(visit.Id, lines);
        System.assertNotEquals(null, orderId);
        SfaMobileController.completeVisit(visit.Id);
        SfaMobileController.EndDaySummary summary = SfaMobileController.endDay(attendanceId, 12.9720, 77.5950);
        System.assertEquals(1, summary.completedVisits);
        System.assertEquals(1, summary.ordersCaptured);
        Test.startTest(); SfaMobileController.Dashboard dashboard = SfaMobileController.getDashboard(); Test.stopTest();
        System.assertEquals(1, dashboard.visits.size());
        System.assertEquals('Completed', dashboard.visits[0].status);
    }

    @IsTest
    static void seedsDemoDataIdempotently() {
        Test.startTest();
        SfaDemoDataFactory.seed();
        SfaDemoDataFactory.seed();
        Test.stopTest();

        System.assertEquals(1, [SELECT COUNT() FROM Beat__c WHERE Name = 'Central Market Beat']);
        System.assertEquals(1, [SELECT COUNT() FROM Retailer__c WHERE Name = 'Lakshmi Stores Demo']);
        System.assertEquals(1, [SELECT COUNT() FROM Product__c WHERE Product_Code__c = 'PG-DEMO-001']);
        System.assertEquals(1, [SELECT COUNT() FROM Scheme__c WHERE Scheme_Code__c = 'B2G1-DEMO']);
    }
}