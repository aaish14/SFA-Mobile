@IsTest
private class DmsSecondaryRoutingTest {
    @TestSetup static void data() {
        DMS_Distributor__c distributor=new DMS_Distributor__c(Name='Supplier',Active__c=true);
        insert distributor;
        insert new List<Retailer__c>{
            new Retailer__c(Name='Mapped outlet',Active__c=true,DMS_Distributor__c=distributor.Id),
            new Retailer__c(Name='Unmapped outlet',Active__c=true)
        };
        Employee__c employee=new Employee__c(Name='Routing employee',Phone__c='9000000000',Active__c=true);
        insert employee;
        Beat__c beat=new Beat__c(Name='Routing test beat',Active__c=true,Assigned_Employee__c=employee.Id);
        insert beat;
        Permanent_Journey_Plan__c plan=new Permanent_Journey_Plan__c(
            Name='Routing test plan',Beat__c=beat.Id,Planned_Date__c=Date.today(),Status__c='Draft');
        insert plan;
        List<Visit__c> visits=new List<Visit__c>();
        for(Retailer__c outlet:[SELECT Id,Name FROM Retailer__c]) {
            visits.add(new Visit__c(Name=outlet.Name+' visit',Retailer__c=outlet.Id,
                Permanent_Journey_Plan__c=plan.Id,Visit_Date__c=Date.today(),Status__c='Checked In'));
        }
        insert visits;
        insert new Product__c(Name='Routing product',Product_Code__c='DMS-ROUTE',
            MRP__c=20,Retailer_Base_Price__c=15,Units_Per_Case__c=20);
    }
    private static Map<Id,Id> visitByOutlet;
    private static Sales_Order__c orderFor(Id outlet,Id distributor) {
        if(visitByOutlet==null) {
            visitByOutlet=new Map<Id,Id>();
            for(Visit__c visit:[SELECT Id,Retailer__c FROM Visit__c]) visitByOutlet.put(visit.Retailer__c,visit.Id);
        }
        return new Sales_Order__c(Retailer__c=outlet,Visit__c=visitByOutlet.get(outlet),
            Order_Date__c=Date.today(),DMS_Distributor__c=distributor);
    }
    @IsTest static void routesOrdersAndReturns() {
        Id outlet=[SELECT Id FROM Retailer__c WHERE Name='Mapped outlet'].Id;
        Id distributor=[SELECT Id FROM DMS_Distributor__c LIMIT 1].Id;
        List<Sales_Order__c> orders=new List<Sales_Order__c>();
        for(Integer i=0;i<200;i++) orders.add(orderFor(outlet,null));
        Test.startTest();
        insert orders;
        Product_Return__c returned=new Product_Return__c(Outlet__c=outlet,
            Product__c=[SELECT Id FROM Product__c LIMIT 1].Id,Quantity__c=2,Return_Reason__c='Damaged');
        insert returned;
        Test.stopTest();
        System.assertEquals(200,[SELECT COUNT() FROM Sales_Order__c WHERE DMS_Distributor__c=:distributor AND DMS_Status__c='Approved' AND DMS_Decided_At__c!=null]);
        System.assertEquals('Automatically approved secondary order.',
            [SELECT DMS_Decision_Notes__c FROM Sales_Order__c LIMIT 1].DMS_Decision_Notes__c);
        System.assertEquals(distributor,[SELECT DMS_Distributor__c FROM Product_Return__c WHERE Id=:returned.Id].DMS_Distributor__c);
        System.assertEquals('Pending',[SELECT DMS_Status__c FROM Product_Return__c WHERE Id=:returned.Id].DMS_Status__c);
    }
    @IsTest static void keepsUnmappedSfaRecordsAndRejectsWrongSupplier() {
        Id unmapped=[SELECT Id FROM Retailer__c WHERE Name='Unmapped outlet'].Id;
        Sales_Order__c legacy=orderFor(unmapped,null);
        insert legacy;
        System.assertEquals(null,[SELECT DMS_Distributor__c FROM Sales_Order__c WHERE Id=:legacy.Id].DMS_Distributor__c);
        System.assertNotEquals('Approved',[SELECT DMS_Status__c FROM Sales_Order__c WHERE Id=:legacy.Id].DMS_Status__c);
        Id supplier=[SELECT Id FROM DMS_Distributor__c LIMIT 1].Id;
        Database.SaveResult missingMapping=Database.insert(orderFor(unmapped,supplier),false);
        System.assertEquals(false,missingMapping.isSuccess());
        System.assert(missingMapping.getErrors()[0].getMessage().contains('Configure the outlet'));
        DMS_Distributor__c other=new DMS_Distributor__c(Name='Wrong supplier',Active__c=true);insert other;
        Id mapped=[SELECT Id FROM Retailer__c WHERE Name='Mapped outlet'].Id;
        Database.SaveResult wrongSupplier=Database.insert(orderFor(mapped,other.Id),false);
        System.assertEquals(false,wrongSupplier.isSuccess());
        System.assert(wrongSupplier.getErrors()[0].getMessage().contains('must match'));
    }
    @IsTest static void rejectsInactiveSupplier() {
        DMS_Distributor__c supplier=[SELECT Id FROM DMS_Distributor__c LIMIT 1];
        supplier.Active__c=false;update supplier;
        Id outlet=[SELECT Id FROM Retailer__c WHERE Name='Mapped outlet'].Id;
        Database.SaveResult inactive=Database.insert(orderFor(outlet,null),false);
        System.assertEquals(false,inactive.isSuccess());
        System.assert(inactive.getErrors()[0].getMessage().contains('inactive'));
    }
}