@IsTest
private class DmsPrimaryWorkflowTest {
    @TestSetup static void setupData() {
        DMS_Distributor__c distributor=new DMS_Distributor__c(
            Name='Workflow test distributor',Active__c=true,Officer__c=UserInfo.getUserId());
        insert distributor;
        insert new Employee__c(Name='Workflow test employee',Phone__c='9000000000',
            Active__c=true,DMS_Distributor__c=distributor.Id);
        insert new Product__c(Name='Workflow test product',Product_Code__c='DMS-WF-TEST',
            MRP__c=20,Retailer_Base_Price__c=15,Units_Per_Case__c=20,
            DMS_Case_Price__c=100,GST_Percent__c=5,Active__c=true,Sellable__c=true);
    }
    private static DMS_Primary_Order__c order() {
        DMS_Primary_Order__c record=new DMS_Primary_Order__c(
            Distributor__c=[SELECT Id FROM DMS_Distributor__c LIMIT 1].Id,
            Employee__c=[SELECT Id FROM Employee__c LIMIT 1].Id);
        insert record;
        return record;
    }
    private static DMS_Primary_Order_Line__c orderLine(Id parent) {
        DMS_Primary_Order_Line__c line=new DMS_Primary_Order_Line__c(
            Order__c=parent,Product__c=[SELECT Id FROM Product__c LIMIT 1].Id,
            Cases__c=2,Free_Cases__c=1,Discount_Amount__c=10);
        insert line;
        return line;
    }
    private static DMS_Primary_Return__c returnRecord() {
        DMS_Primary_Return__c record=new DMS_Primary_Return__c(
            Distributor__c=[SELECT Id FROM DMS_Distributor__c LIMIT 1].Id,
            Employee__c=[SELECT Id FROM Employee__c LIMIT 1].Id);
        insert record;
        insert new DMS_Primary_Return_Line__c(Primary_Return__c=record.Id,
            Product__c=[SELECT Id FROM Product__c LIMIT 1].Id,Cases__c=1,Reason__c='Damaged');
        return record;
    }
    private static Approval.ProcessResult submit(Id recordId,String process) {
        Approval.ProcessSubmitRequest request=new Approval.ProcessSubmitRequest();
        request.setObjectId(recordId);
        request.setProcessDefinitionNameOrId(process);
        Approval.ProcessResult result=Approval.process(request);
        System.assert(result.isSuccess(), 'Approval submission must succeed.');
        System.assertEquals(UserInfo.getUserId(),[
            SELECT ActorId FROM ProcessInstanceWorkitem WHERE Id=:result.getNewWorkitemIds()[0]
        ].ActorId, 'Route to the distributor company officer.');
        return result;
    }
    private static void decide(Approval.ProcessResult submitted,String action) {
        Approval.ProcessWorkitemRequest request=new Approval.ProcessWorkitemRequest();
        request.setWorkitemId(submitted.getNewWorkitemIds()[0]);
        request.setAction(action);
        request.setComments('Workflow verification decision');
        System.assert(Approval.process(request).isSuccess());
    }
    @IsTest static void snapshotsAndRecalculatesDiscountedTotals() {
        DMS_Primary_Order__c parent=order();
        DMS_Primary_Order_Line__c line=orderLine(parent.Id);
        DMS_Primary_Order_Line__c saved=[SELECT Pieces_Per_Case__c,Case_Price__c,Tax_Percent__c,
            Total_Pieces__c FROM DMS_Primary_Order_Line__c WHERE Id=:line.Id];
        System.assertEquals(20,saved.Pieces_Per_Case__c);
        System.assertEquals(100,saved.Case_Price__c);
        System.assertEquals(5,saved.Tax_Percent__c);
        System.assertEquals(60,saved.Total_Pieces__c);
        System.assertEquals(199.50,[SELECT Total_Amount__c FROM DMS_Primary_Order__c WHERE Id=:parent.Id].Total_Amount__c);
        Product__c product=[SELECT Id FROM Product__c LIMIT 1];
        product.DMS_Case_Price__c=200; product.Units_Per_Case__c=30;
        update product;
        update new DMS_Primary_Order_Line__c(Id=line.Id,Cases__c=3);
        System.assertEquals(304.50,[SELECT Total_Amount__c FROM DMS_Primary_Order__c WHERE Id=:parent.Id].Total_Amount__c);
        delete line;
        System.assertEquals(0,[SELECT Total_Amount__c FROM DMS_Primary_Order__c WHERE Id=:parent.Id].Total_Amount__c);
        undelete line;
        System.assertEquals(304.50,[SELECT Total_Amount__c FROM DMS_Primary_Order__c WHERE Id=:parent.Id].Total_Amount__c);
    }
    @IsTest static void approvesPrimaryOrderAndProtectsLines() {
        DMS_Primary_Order__c parent=order();
        DMS_Primary_Order_Line__c line=orderLine(parent.Id);
        System.assertEquals(UserInfo.getUserId(),[SELECT Officer__c FROM DMS_Primary_Order__c WHERE Id=:parent.Id].Officer__c);
        Test.startTest();
        Approval.ProcessResult result=submit(parent.Id,'Company_Officer_Approval');
        System.assertEquals('Submitted',[SELECT Status__c FROM DMS_Primary_Order__c WHERE Id=:parent.Id].Status__c);
        System.assertEquals(false,Database.update(new DMS_Primary_Order_Line__c(Id=line.Id,Cases__c=3),false).isSuccess());
        decide(result,'Approve');
        Test.stopTest();
        System.assertEquals('Approved',[SELECT Status__c FROM DMS_Primary_Order__c WHERE Id=:parent.Id].Status__c);
        System.assertEquals(false,Database.delete(line,false).isSuccess());
    }
    @IsTest static void rejectsPrimaryOrder() {
        DMS_Primary_Order__c parent=order(); orderLine(parent.Id);
        decide(submit(parent.Id,'Company_Officer_Approval'),'Reject');
        System.assertEquals('Rejected',[SELECT Status__c FROM DMS_Primary_Order__c WHERE Id=:parent.Id].Status__c);
    }
    @IsTest static void approvesAndRejectsPrimaryReturns() {
        DMS_Primary_Return__c approved=returnRecord();
        DMS_Primary_Return__c rejected=returnRecord();
        // Store a business rejection reason as well as the approval audit comment.
        rejected.Rejection_Reason__c='Test return not eligible'; update rejected;
        Test.startTest();
        decide(submit(approved.Id,'Company_Officer_Return_Approval'),'Approve');
        decide(submit(rejected.Id,'Company_Officer_Return_Approval'),'Reject');
        Test.stopTest();
        System.assertEquals('Approved',[SELECT Status__c FROM DMS_Primary_Return__c WHERE Id=:approved.Id].Status__c);
        System.assertEquals('Rejected',[SELECT Status__c FROM DMS_Primary_Return__c WHERE Id=:rejected.Id].Status__c);
        System.assertEquals(100,[SELECT Total_Amount__c FROM DMS_Primary_Return__c WHERE Id=:approved.Id].Total_Amount__c);
        DMS_Primary_Return_Line__c line=[SELECT Id FROM DMS_Primary_Return_Line__c WHERE Primary_Return__c=:approved.Id];
        System.assertEquals(false,Database.delete(line,false).isSuccess());
    }
    @IsTest static void preventsEmptyOrMismatchedSubmission() {
        DMS_Primary_Order__c empty=order();
        empty.Status__c='Submitted';
        System.assertEquals(false,Database.update(empty,false).isSuccess());
        DMS_Distributor__c other=new DMS_Distributor__c(Name='Other distributor',Active__c=true);
        insert other;
        empty.Status__c='Draft'; empty.Distributor__c=other.Id;
        System.assertEquals(false,Database.update(empty,false).isSuccess());
        DMS_Primary_Order__c parent=order();
        DMS_Primary_Order_Line__c bad=new DMS_Primary_Order_Line__c(Order__c=parent.Id,
            Product__c=[SELECT Id FROM Product__c LIMIT 1].Id,Cases__c=0);
        System.assertEquals(false,Database.insert(bad,false).isSuccess());
        bad.Cases__c=1;bad.Order__c=null;
        System.assertEquals(false,Database.insert(bad,false).isSuccess());
    }
    @IsTest static void handlesBulkLinesAndReparenting() {
        DMS_Primary_Order__c first=order(), second=order();
        Id productId=[SELECT Id FROM Product__c LIMIT 1].Id;
        List<DMS_Primary_Order_Line__c> lines=new List<DMS_Primary_Order_Line__c>();
        for(Integer i=0;i<200;i++) lines.add(new DMS_Primary_Order_Line__c(Order__c=first.Id,Product__c=productId,Cases__c=1));
        Test.startTest();
        insert lines;
        System.assertEquals(21000,[SELECT Total_Amount__c FROM DMS_Primary_Order__c WHERE Id=:first.Id].Total_Amount__c);
        lines[0].Order__c=second.Id;update lines[0];
        System.assertEquals(20895,[SELECT Total_Amount__c FROM DMS_Primary_Order__c WHERE Id=:first.Id].Total_Amount__c);
        System.assertEquals(105,[SELECT Total_Amount__c FROM DMS_Primary_Order__c WHERE Id=:second.Id].Total_Amount__c);
        Test.stopTest();
    }
}