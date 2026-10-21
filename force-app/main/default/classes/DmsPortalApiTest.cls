@IsTest private class DmsPortalApiTest {
    @TestSetup static void permission() {
        insert new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(),
            PermissionSetId=[SELECT Id FROM PermissionSet WHERE Name='DMS_Backend_Transactions'].Id);
    }
    private static DMS_Distributor__c distributor() {
        DMS_Distributor__c row=new DMS_Distributor__c(Name='Portal test',Active__c=true,Officer__c=UserInfo.getUserId());
        insert row;return row;
    }
    private static Map<String,Object> call(DmsPortalApi.Command cmd) {
        RestContext.request=new RestRequest();RestContext.response=new RestResponse();
        RestContext.request.requestBody=Blob.valueOf(JSON.serialize(cmd));
        System.runAs(new User(Id=UserInfo.getUserId())) { DmsPortalApi.execute(); }
        return (Map<String,Object>)JSON.deserializeUntyped(RestContext.response.responseBody.toString());
    }
    private static DmsPortalApi.Command ticket(Id distributorId) {
        DmsPortalApi.Command cmd=new DmsPortalApi.Command();
        cmd.action='ticket';cmd.distributorId=distributorId;cmd.requestKey='ticket-1234567890';
        cmd.subject='Delivery issue';cmd.category='Delivery';cmd.description='Shipment arrived late.';return cmd;
    }
    @IsTest static void ticketLifecycleAndReplay() {
        DmsPortalApi.Command cmd=ticket(distributor().Id);
        Test.startTest();
        Map<String,Object> created=call(cmd);
        System.assertNotEquals(null,created.get('id'),JSON.serialize(created));
        System.assertEquals(created.get('id'),call(cmd).get('id'));
        DMS_Support_Ticket__c row=[SELECT Id,Status__c,Officer__c FROM DMS_Support_Ticket__c];
        System.assertEquals('Open',row.Status__c);System.assertEquals(UserInfo.getUserId(),row.Officer__c);
        row.Status__c='Closed';System.assertEquals(false,Database.update(row,false).isSuccess());
        row.Status__c='In Progress';update row;
        row.Status__c='Closed';System.assertEquals(false,Database.update(row,false).isSuccess());
        row.Resolution__c='Replacement delivered';update row;
        System.assertEquals('Closed',call(cmd).get('status'));
        cmd.subject='Changed';System.assert(call(cmd).containsKey('error'));
        Test.stopTest();
        System.assertEquals(1,[SELECT COUNT() FROM DMS_Support_Ticket__c]);
    }
    @IsTest static void badInputsAreAtomic() {
        DmsPortalApi.Command cmd=ticket(distributor().Id);
        cmd.category='Invalid';System.assert(call(cmd).containsKey('error'));
        cmd.category='Product';cmd.requestKey='bad';System.assert(call(cmd).containsKey('error'));
        cmd.action='unknown';System.assert(call(cmd).containsKey('error'));
        System.assertEquals(0,[SELECT COUNT() FROM DMS_Support_Ticket__c]);
        cmd.action='secondaryDecision';cmd.decision='Rejected';cmd.notes=null;
        System.assert(call(cmd).containsKey('error'));
        cmd.notes='Not needed';System.assert(call(cmd).containsKey('error'));
    }
    @IsTest static void receivesApprovedGoodsOnceWithoutOverReceiving() {
        DMS_Distributor__c supplier=distributor();
        Employee__c employee=new Employee__c(Name='Portal employee',Phone__c='9000000000',Active__c=true,DMS_Distributor__c=supplier.Id);insert employee;
        Product__c product=new Product__c(Name='Portal product',Product_Code__c='PORTAL-1',MRP__c=20,
            Retailer_Base_Price__c=15,Units_Per_Case__c=10,DMS_Case_Price__c=100,Active__c=true,Sellable__c=true);insert product;
        DMS_Primary_Order__c order=new DMS_Primary_Order__c(Distributor__c=supplier.Id,Employee__c=employee.Id);insert order;
        DMS_Primary_Order_Line__c line=new DMS_Primary_Order_Line__c(Order__c=order.Id,Product__c=product.Id,Cases__c=3);insert line;
        DmsPortalApi.Command cmd=new DmsPortalApi.Command();cmd.action='receiveGoods';cmd.distributorId=supplier.Id;
        cmd.recordId=line.Id;cmd.cases=2;cmd.batch='BATCH-1';cmd.expiry=Date.today().addDays(90);cmd.requestKey='receipt-1234567890';
        System.assert(call(cmd).containsKey('error'),'Draft orders must not create stock.');
        Approval.ProcessSubmitRequest submit=new Approval.ProcessSubmitRequest();submit.setObjectId(order.Id);
        submit.setProcessDefinitionNameOrId('Company_Officer_Approval');
        Approval.ProcessResult submission=Approval.process(submit);
        Approval.ProcessWorkitemRequest approve=new Approval.ProcessWorkitemRequest();
        approve.setWorkitemId(submission.getNewWorkitemIds()[0]);approve.setAction('Approve');Approval.process(approve);
        Test.startTest();
        Map<String,Object> receipt=call(cmd);System.assertNotEquals(null,receipt.get('id'),JSON.serialize(receipt));
        System.assertEquals(receipt.get('id'),call(cmd).get('id'));
        System.assertEquals(20,[SELECT On_Hand_Pieces__c FROM DMS_Inventory__c].On_Hand_Pieces__c);
        cmd.cases=1;System.assert(call(cmd).containsKey('error'),'Key reuse must not change payload.');
        cmd.requestKey='receipt-abcdefghij';cmd.cases=2;System.assert(call(cmd).containsKey('error'),'No over receipt.');
        cmd.cases=1;System.assertNotEquals(null,call(cmd).get('id'));
        Test.stopTest();
        System.assertEquals(30,[SELECT On_Hand_Pieces__c FROM DMS_Inventory__c].On_Hand_Pieces__c);
        System.assertEquals(2,[SELECT COUNT() FROM DMS_Goods_Receipt__c]);
    }
    @IsTest static void returnDecisionIsScopedAndRepeatable() {
        DMS_Distributor__c supplier=distributor();DMS_Distributor__c other=distributor();
        Retailer__c outlet=new Retailer__c(Name='Portal outlet',Active__c=true,DMS_Distributor__c=supplier.Id);insert outlet;
        Product__c product=new Product__c(Name='Return product',Product_Code__c='PORTAL-R',MRP__c=20,Retailer_Base_Price__c=15,Units_Per_Case__c=10);insert product;
        Product_Return__c returned=new Product_Return__c(Outlet__c=outlet.Id,Product__c=product.Id,Quantity__c=2,Return_Reason__c='Damaged');insert returned;
        DmsPortalApi.Command cmd=new DmsPortalApi.Command();cmd.action='returnDecision';cmd.recordId=returned.Id;
        cmd.distributorId=other.Id;cmd.decision='Approved';System.assert(call(cmd).containsKey('error'));
        cmd.distributorId=supplier.Id;System.assertEquals('Approved',call(cmd).get('status'));
        System.assertEquals('Approved',call(cmd).get('status'));
        cmd.decision='Rejected';cmd.notes='Changed';System.assert(call(cmd).containsKey('error'));
    }
    @IsTest static void deniesUntrustedUser() {
        User user=new User(Alias='notrust',Email='no@example.invalid',EmailEncodingKey='UTF-8',LastName='No API Access',
            LanguageLocaleKey='en_US',LocaleSidKey='en_US',TimeZoneSidKey='Asia/Kolkata',
            ProfileId=[SELECT Id FROM Profile WHERE Name='Standard Platform User' LIMIT 1].Id,
            Username='no-dms-'+System.now().getTime()+'@example.invalid');insert user;
        System.runAs(user) {
            System.assert(call(new DmsPortalApi.Command()).containsKey('error'));
            System.assertEquals(403,RestContext.response.statusCode);
        }
    }
}