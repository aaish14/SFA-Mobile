@IsTest
private class DmsInvoiceServiceTest {
    @TestSetup static void setup() {
        DMS_Distributor__c distributor = new DMS_Distributor__c(Name='Invoice test distributor', Active__c=true, Officer__c=UserInfo.getUserId());
        insert distributor;
        Employee__c employee = new Employee__c(Name='Invoice test employee', Phone__c='9000000000', Active__c=true, DMS_Distributor__c=distributor.Id);
        insert employee;
        Retailer__c outlet = new Retailer__c(Name='Invoice test outlet', Active__c=true, DMS_Distributor__c=distributor.Id);
        insert outlet;
        Beat__c beat = new Beat__c(Name='Invoice test beat', Active__c=true, Assigned_Employee__c=employee.Id);
        insert beat;
        Permanent_Journey_Plan__c plan = new Permanent_Journey_Plan__c(Name='Invoice plan',Beat__c=beat.Id,Planned_Date__c=Date.today(),Status__c='Draft');
        insert plan;
        insert new Visit__c(Name='Invoice visit',Retailer__c=outlet.Id,Permanent_Journey_Plan__c=plan.Id,Visit_Date__c=Date.today(),Status__c='Checked In');
        insert new Product__c(Name='Invoice product',Product_Code__c='INV-TEST',MRP__c=20,Retailer_Base_Price__c=15,Units_Per_Case__c=20,DMS_Case_Price__c=100,GST_Percent__c=5,Active__c=true,Sellable__c=true);
    }
    private static DMS_Primary_Order__c primaryOrder() {
        DMS_Primary_Order__c order = new DMS_Primary_Order__c(Distributor__c=[SELECT Id FROM DMS_Distributor__c LIMIT 1].Id,Order_Source__c='Distributor DMS');
        insert order;
        insert new DMS_Primary_Order_Line__c(Order__c=order.Id,Product__c=[SELECT Id FROM Product__c LIMIT 1].Id,Cases__c=2);
        return order;
    }
    @IsTest static void approvalIssuesOnceWithExactCasePrice() {
        DMS_Primary_Order__c order=primaryOrder();
        System.assertEquals(0,[SELECT COUNT() FROM DMS_Invoice__c]);
        Test.startTest();
        Approval.ProcessSubmitRequest submission = new Approval.ProcessSubmitRequest();
        submission.setObjectId(order.Id);
        submission.setProcessDefinitionNameOrId('Company_Officer_Approval');
        Approval.ProcessResult pending=Approval.process(submission);
        System.assert(pending.isSuccess());
        System.assertEquals(0,[SELECT COUNT() FROM DMS_Invoice__c],'No final invoice while pending.');
        Approval.ProcessWorkitemRequest decision = new Approval.ProcessWorkitemRequest();
        decision.setWorkitemId(pending.getNewWorkitemIds()[0]); decision.setAction('Approve');
        System.assert(Approval.process(decision).isSuccess());
        Test.stopTest();
        DMS_Invoice__c invoice=[SELECT Id,Status__c,Total_Amount__c,Balance_Due__c,Primary_Order__c FROM DMS_Invoice__c];
        System.assertEquals('Issued',invoice.Status__c);
        System.assertEquals(210,invoice.Total_Amount__c);
        System.assertEquals(210,invoice.Balance_Due__c);
        DMS_Invoice_Line__c line=[SELECT Cases__c,Case_Price__c,Quantity_Pieces__c,Total_Amount__c FROM DMS_Invoice_Line__c];
        System.assertEquals(2,line.Cases__c); System.assertEquals(100,line.Case_Price__c); System.assertEquals(40,line.Quantity_Pieces__c);
        DmsInvoiceService.primary(new List<DMS_Primary_Order__c>{new DMS_Primary_Order__c(Id=order.Id,Status__c='Approved')},null);
        System.assertEquals(1,[SELECT COUNT() FROM DMS_Invoice__c],'Replay must not duplicate.');
        System.assertEquals(0,[SELECT COUNT() FROM DMS_Inventory__c],'Invoicing is not a stock movement.');
    }
    @IsTest static void rejectedPrimaryHasNoInvoice() {
        DMS_Primary_Order__c order=primaryOrder();
        order.Status__c='Rejected'; update order;
        System.assertEquals(0,[SELECT COUNT() FROM DMS_Invoice__c]);
    }
    private static Sales_Order__c secondaryOrder() {
        Sales_Order__c order=new Sales_Order__c(Retailer__c=[SELECT Id FROM Retailer__c LIMIT 1].Id,Visit__c=[SELECT Id FROM Visit__c LIMIT 1].Id,Order_Date__c=Date.today(),Status__c='Submitted',Total_Amount__c=94.5);
        insert order;
        insert new Order_Item__c(Sales_Order__c=order.Id,Product__c=[SELECT Id FROM Product__c LIMIT 1].Id,Piece_Quantity__c=10,Total_Pieces__c=10,Unit_Price__c=10,Line_Amount__c=94.5,Invoice_Tax_Amount__c=4.5);
        return order;
    }
    @IsTest static void confirmedSecondaryPostsAfterAllLinesAndReplays() {
        Sales_Order__c order=secondaryOrder();
        System.assertEquals(0,[SELECT COUNT() FROM DMS_Invoice__c]);
        Test.startTest();
        order.Invoice_Ready__c=true; update order; update order;
        Test.stopTest();
        DMS_Invoice__c invoice=[SELECT Status__c,Gross_Amount__c,Discount_Amount__c,Tax_Amount__c,Total_Amount__c FROM DMS_Invoice__c];
        System.assertEquals('Issued',invoice.Status__c); System.assertEquals(100,invoice.Gross_Amount__c);
        System.assertEquals(10,invoice.Discount_Amount__c); System.assertEquals(4.5,invoice.Tax_Amount__c); System.assertEquals(94.5,invoice.Total_Amount__c);
        System.assertEquals(1,[SELECT COUNT() FROM DMS_Invoice__c]);
    }
    @IsTest static void inconsistentTotalRollsBackInvoice() {
        Sales_Order__c order=secondaryOrder();
        order.Invoice_Ready__c=true; order.Total_Amount__c=999;
        Database.SaveResult result=Database.update(order,false);
        System.assert(!result.isSuccess());
        System.assertEquals(0,[SELECT COUNT() FROM DMS_Invoice__c]);
    }
    @IsTest static void bulkConfirmedSecondaryOrders() {
        Id outlet=[SELECT Id FROM Retailer__c LIMIT 1].Id, visit=[SELECT Id FROM Visit__c LIMIT 1].Id, product=[SELECT Id FROM Product__c LIMIT 1].Id;
        List<Sales_Order__c> orders=new List<Sales_Order__c>();
        for (Integer i=0;i<200;i++) orders.add(new Sales_Order__c(Retailer__c=outlet,Visit__c=visit,Order_Date__c=Date.today(),Status__c='Submitted',Total_Amount__c=10.5));
        insert orders;
        List<Order_Item__c> lines=new List<Order_Item__c>();
        for (Sales_Order__c order:orders) lines.add(new Order_Item__c(Sales_Order__c=order.Id,Product__c=product,Piece_Quantity__c=1,Total_Pieces__c=1,Unit_Price__c=10,Line_Amount__c=10.5,Invoice_Tax_Amount__c=.5));
        insert lines;
        for (Sales_Order__c order:orders) order.Invoice_Ready__c=true;
        Test.startTest(); update orders; Test.stopTest();
        System.assertEquals(200,[SELECT COUNT() FROM DMS_Invoice__c WHERE Status__c='Issued']);
        System.assertEquals(200,[SELECT COUNT() FROM DMS_Invoice_Line__c]);
    }
    @IsTest static void missingTaxIsNotGuessed() {
        Sales_Order__c order=secondaryOrder();
        Order_Item__c line=[SELECT Id,Invoice_Tax_Amount__c FROM Order_Item__c LIMIT 1];
        line.Invoice_Tax_Amount__c=null; update line;
        order.Invoice_Ready__c=true;
        System.assert(!Database.update(order,false).isSuccess());
        System.assertEquals(0,[SELECT COUNT() FROM DMS_Invoice__c]);
    }
}