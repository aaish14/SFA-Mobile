public without sharing class SfaDemoDataFactory {
    public static void seed() {
        Beat__c beat;
        List<Beat__c> beats = [SELECT Id, Name FROM Beat__c WHERE Name = 'Central Market Beat' LIMIT 1];
        if (beats.isEmpty()) {
            // The general demo factory has no employee context. Keep this legacy
            // beat inactive; active beats must be owned by an employee.
            beat = new Beat__c(Name = 'Central Market Beat', Active__c = false);
            insert beat;
        } else {
            beat = beats[0];
        }

        Retailer__c retailer;
        List<Retailer__c> retailers = [SELECT Id, Name FROM Retailer__c WHERE Name = 'Lakshmi Stores Demo' LIMIT 1];
        if (retailers.isEmpty()) {
            retailer = new Retailer__c(Name = 'Lakshmi Stores Demo', Address__c = 'MG Road, Bengaluru', Beat__c = beat.Id);
            insert retailer;
        } else {
            retailer = retailers[0];
        }

        Permanent_Journey_Plan__c plan;
        List<Permanent_Journey_Plan__c> plans = [
            SELECT Id FROM Permanent_Journey_Plan__c
            WHERE Name = 'Today SFA Demo Plan' AND Plan_Date__c = :Date.today()
            LIMIT 1
        ];
        if (plans.isEmpty()) {
            plan = new Permanent_Journey_Plan__c(
                Name = 'Today SFA Demo Plan', Plan_Date__c = Date.today(), Planned_Date__c = Date.today(),
                Sales_Representative__c = UserInfo.getUserId(), Beat__c = beat.Id
            );
            insert plan;
        } else {
            plan = plans[0];
        }

        if ([SELECT COUNT() FROM Visit__c WHERE Permanent_Journey_Plan__c = :plan.Id AND Retailer__c = :retailer.Id] == 0) {
            insert new Visit__c(
                Name = 'Lakshmi Stores Visit', Visit_Date__c = Date.today(),
                Permanent_Journey_Plan__c = plan.Id, Retailer__c = retailer.Id, Status__c = 'Planned'
            );
        }

        if ([SELECT COUNT() FROM Product__c WHERE Product_Code__c = 'PG-DEMO-001'] == 0) {
            insert new Product__c(
                Name = 'Parle-G Demo Pack', Product_Code__c = 'PG-DEMO-001', Brand__c = 'Parle',
                MRP__c = 10, Retailer_Base_Price__c = 8.5, Selling_Price__c = 9,
                Available_Stock__c = 500, Units_Per_Case__c = 50, Sellable__c = true, Returnable__c = true
            );
        }

        if ([SELECT COUNT() FROM Scheme__c WHERE Scheme_Code__c = 'B2G1-DEMO'] == 0) {
            insert new Scheme__c(
                Name = 'Buy 2 Get 1 Demo', Scheme_Code__c = 'B2G1-DEMO', Scheme_Type__c = 'Same Product Free',
                Description__c = 'Buy two cases and receive one case free.', Start_Date__c = Date.today(),
                End_Date__c = Date.today().addDays(7), Active__c = true
            );
        }
    }
}