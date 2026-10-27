@IsTest
private class DmsDistributorReturnsTest {
    @TestSetup
    static void permissions() {
        Id permissionId = [SELECT Id FROM PermissionSet WHERE Name='DMS_Backend_Transactions'].Id;
        if ([SELECT COUNT() FROM PermissionSetAssignment WHERE AssigneeId=:UserInfo.getUserId() AND PermissionSetId=:permissionId] == 0)
            insert new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(), PermissionSetId=permissionId);
    }
    private static DMS_Distributor__c supplier() {
        DMS_Distributor__c row = new DMS_Distributor__c(Name='Return fixture', Active__c=true, Officer__c=UserInfo.getUserId());
        insert row; return row;
    }
    private static Product__c product() {
        Product__c row = new Product__c(Name='Return product', Product_Code__c='RETURN-FIXTURE', MRP__c=20,
            Retailer_Base_Price__c=15, Units_Per_Case__c=10, DMS_Case_Price__c=100, Active__c=true, Sellable__c=true);
        insert row; return row;
    }
    private static Map<String,Object> call(Object cmd) {
        RestContext.request=new RestRequest(); RestContext.response=new RestResponse();
        RestContext.request.requestBody=Blob.valueOf(JSON.serialize(cmd));
        DmsPortalApi.execute();
        return (Map<String,Object>)JSON.deserializeUntyped(RestContext.response.responseBody.toString());
    }
    /** Verify distributor primary entry, actual officer work item, replay and approval. */
    @IsTest static void primaryReturnRoutesToOfficer() {
        DMS_Distributor__c distributor=supplier(); Product__c item=product();
        DMS_Primary_Order__c original=new DMS_Primary_Order__c(Distributor__c=distributor.Id, Order_Source__c='Distributor DMS');
        insert original;
        DMS_Goods_Receipt__c receipt=new DMS_Goods_Receipt__c(Distributor__c=distributor.Id,
            Primary_Order__c=original.Id, Status__c='Received', Received_Date__c=Date.today());
        insert receipt;
        DMS_Goods_Receipt_Line__c source=new DMS_Goods_Receipt_Line__c(Goods_Receipt__c=receipt.Id,
            Product__c=item.Id, Received_Cases__c=3, Pieces_Per_Case__c=10, Case_Cost__c=100, Batch_Number__c='TEST');
        insert source;
        DmsPortalApi.Command cmd=new DmsPortalApi.Command(); cmd.action='distributorPrimaryReturn';
        cmd.distributorId=distributor.Id; cmd.requestKey='primary-return-fixture-1';
        DmsEmployeeTransactions.LineInput line=new DmsEmployeeTransactions.LineInput();
        line.receiptLineId=source.Id; line.cases=2; line.reason='Damaged';
        cmd.lines=new List<DmsEmployeeTransactions.LineInput>{line};
        Test.startTest();
        Map<String,Object> saved=call(cmd);
        System.assertEquals('Submitted',saved.get('status'),JSON.serialize(saved));
        Id savedId=(Id)saved.get('id');
        System.assertEquals(savedId,call(cmd).get('id'));
        ProcessInstanceWorkitem work=[SELECT Id,ActorId FROM ProcessInstanceWorkitem WHERE ProcessInstance.TargetObjectId=:savedId];
        System.assertEquals(distributor.Officer__c,work.ActorId);
        Approval.ProcessWorkitemRequest decision=new Approval.ProcessWorkitemRequest();
        decision.setWorkitemId(work.Id); decision.setAction('Approve');
        System.assert(Approval.process(decision).isSuccess());
        System.assertEquals('Approved',call(cmd).get('status'));
        cmd.requestKey='primary-return-fixture-2';
        System.assert(call(cmd).containsKey('error'),'Pending/approved cases cannot be returned again.');
        cmd.distributorId=supplier().Id;
        System.assert(call(cmd).containsKey('error'),'Foreign receipts cannot be returned.');
        Test.stopTest();
        DMS_Primary_Return__c savedRow=[SELECT Employee__c,Return_Source__c,Primary_Order__c FROM DMS_Primary_Return__c WHERE Id=:savedId];
        System.assertEquals(null,savedRow.Employee__c);
        System.assertEquals('Distributor DMS',savedRow.Return_Source__c);
        System.assertEquals(original.Id,savedRow.Primary_Order__c);
        System.assertEquals(1,[SELECT COUNT() FROM DMS_Primary_Return__c]);
    }
    /** Reject foreign/unapproved lines and excessive pieces; preserve manual return decisions. */
    @IsTest static void secondaryReturnTracksOrderAndDecision() {
        DMS_Distributor__c distributor=supplier(); Product__c item=product();
        Retailer__c outlet=new Retailer__c(Name='Return outlet',Active__c=true,DMS_Distributor__c=distributor.Id); insert outlet;
        Employee__c employee=new Employee__c(Name='Return employee',Phone__c='9000000000',Active__c=true,DMS_Distributor__c=distributor.Id); insert employee;
        Beat__c beat=new Beat__c(Name='Return beat',Active__c=true,Assigned_Employee__c=employee.Id); insert beat;
        Permanent_Journey_Plan__c plan=new Permanent_Journey_Plan__c(Name='Return plan',Beat__c=beat.Id,Planned_Date__c=Date.today(),Status__c='Draft'); insert plan;
        Visit__c visit=new Visit__c(Name='Return visit',Retailer__c=outlet.Id,Permanent_Journey_Plan__c=plan.Id,Visit_Date__c=Date.today(),Status__c='Checked In'); insert visit;
        Sales_Order__c order=new Sales_Order__c(Retailer__c=outlet.Id,Visit__c=visit.Id,Order_Date__c=Date.today()); insert order;
        Order_Item__c source=new Order_Item__c(Sales_Order__c=order.Id,Product__c=item.Id,Piece_Quantity__c=10); insert source;
        DmsDistributorReturns.Command cmd=new DmsDistributorReturns.Command(); cmd.action='distributorSecondaryReturn';
        cmd.distributorId=distributor.Id; cmd.requestKey='secondary-return-fixture-1';
        DmsDistributorReturns.ReturnLine line=new DmsDistributorReturns.ReturnLine();
        line.orderItemId=source.Id; line.pieces=4; line.reason='No Demand';
        cmd.lines=new List<DmsDistributorReturns.ReturnLine>{line};
        Test.startTest();
        Map<String,Object> saved=call(cmd);
        System.assertEquals('Pending',saved.get('status'),JSON.serialize(saved));
        Id savedId=(Id)saved.get('id');
        System.assertEquals(savedId,call(cmd).get('id'));
        line.pieces=5; System.assert(call(cmd).containsKey('error'),'A replay cannot change the quantity.');
        cmd.requestKey='secondary-return-fixture-2'; line.pieces=7;
        System.assert(call(cmd).containsKey('error'),'Pending returns reserve the ordered quantity.');
        cmd.distributorId=supplier().Id; line.pieces=1;
        System.assert(call(cmd).containsKey('error'),'Cross-distributor orders are forbidden.');
        cmd.distributorId=distributor.Id;
        cmd.lines.add(line); System.assert(call(cmd).containsKey('error'),'Duplicate lines are forbidden.'); cmd.lines.remove(1);
        line.reason='Other'; System.assert(call(cmd).containsKey('error'),'Other requires notes.'); line.reason='Damaged';
        DmsPortalApi.Command decision=new DmsPortalApi.Command(); decision.action='returnDecision';
        decision.distributorId=distributor.Id; decision.recordId=savedId; decision.decision='Rejected'; decision.notes='Incorrect quantity';
        System.assertEquals('Rejected',call(decision).get('status'));
        line.pieces=10; Map<String,Object> replacement=call(cmd);
        System.assertEquals('Pending',replacement.get('status'),JSON.serialize(replacement));
        decision.recordId=(Id)replacement.get('id'); decision.decision='Approved';
        System.assertEquals('Approved',call(decision).get('status'));
        Test.stopTest();
        Product_Return__c returned=[SELECT Order_Item__c,Outlet__c,Product__c FROM Product_Return__c WHERE Id=:savedId];
        System.assertEquals(source.Id,returned.Order_Item__c); System.assertEquals(outlet.Id,returned.Outlet__c);
        System.assertEquals(item.Id,returned.Product__c);
        System.assertEquals(2,[SELECT COUNT() FROM Product_Return__c]);
    }
}