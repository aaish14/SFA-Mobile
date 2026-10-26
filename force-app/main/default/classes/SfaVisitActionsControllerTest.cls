@IsTest
private class SfaVisitActionsControllerTest {
    @TestSetup
    static void setupData() {
        User currentUser = [SELECT Id FROM User WHERE Id = :UserInfo.getUserId()];
        Employee__c manager = new Employee__c(Name='Demo Manager', Employee_Code__c='MGR-900', Phone__c='9000000900', Active__c=true, Salesforce_User__c=currentUser.Id);
        insert manager;
        Employee__c employee = new Employee__c(Name='Demo Representative', Employee_Code__c='REP-900', Phone__c='9000000901', Active__c=true, Reporting_Manager__c=manager.Id);
        insert employee;
        Beat__c beat = new Beat__c(Name='Creative Demo Beat', Active__c=true, Assigned_Employee__c=employee.Id);
        insert beat;
        Retailer__c outlet = new Retailer__c(Name='Nandi Daily Mart', Address__c='12 Lake View Road, Bengaluru', Beat__c=beat.Id, Active__c=true);
        insert outlet;
        Product__c product = new Product__c(Name='Sunrise Millet Bites', Product_Code__c='SMB-100', Active__c=true, Available_Stock__c=100, Units_Per_Case__c=20, MRP__c=22, Retailer_Base_Price__c=18);
        insert product;
        Permanent_Journey_Plan__c plan = new Permanent_Journey_Plan__c(Name='Creative Demo Plan', Beat__c=beat.Id, Planned_Date__c=Date.today(), Status__c='Approved');
        insert plan;
        Visit__c visit = new Visit__c(Name='Nandi Daily Mart Visit', Retailer__c=outlet.Id, Permanent_Journey_Plan__c=plan.Id, Visit_Date__c=Date.today(), Status__c='Checked In');
        insert visit;
    }

    @IsTest static void savesEveryVisitAction() {
        Visit__c visit = [SELECT Id FROM Visit__c LIMIT 1];
        Product__c product = [SELECT Id FROM Product__c LIMIT 1];
        Map<String,Object> common = new Map<String,Object>{'dateValue'=>String.valueOf(Date.today()), 'imageUrl'=>'https://example.com/evidence.jpg'};
        common.put('assetName','Chiller'); common.put('assetCode','CH-101'); common.put('status','Working');
        Test.startTest();
        System.assertNotEquals(null, SfaVisitActionsController.saveVisitAction('asset', visit.Id, JSON.serialize(common)));
        System.assertNotEquals(null, SfaVisitActionsController.saveVisitAction('competitor', visit.Id, '{"competitorName":"Fresh Foods","company":"Fresh Foods Ltd","mrp":30,"rbp":25,"schemeDetails":"Buy 5 get 1"}'));
        String productPayload = JSON.serialize(new Map<String,Object>{'productId'=>product.Id,'quantity'=>8,'dateValue'=>String.valueOf(Date.today())});
        System.assertNotEquals(null, SfaVisitActionsController.saveVisitAction('stock', visit.Id, productPayload));
        System.assertNotEquals(null, SfaVisitActionsController.saveVisitAction('return', visit.Id, productPayload.replace('}', ',"returnReason":"Damaged"}')));
        System.assertNotEquals(null, SfaVisitActionsController.saveVisitAction('ticket', visit.Id, '{"subject":"Display rack issue","description":"Rack needs repair"}'));
        Test.stopTest();
    }
}