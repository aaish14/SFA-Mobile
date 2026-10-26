@IsTest
private class DmsDistributorOrderTest {
    /**
     * Assign the permissions required for the test actor to exercise the protected workflow.
     */
    @TestSetup
    static void permissions() {
        Id permissionId = [SELECT Id FROM PermissionSet WHERE Name = 'DMS_Backend_Transactions'].Id;
        if (
            [
                SELECT COUNT()
                FROM PermissionSetAssignment
                WHERE AssigneeId = :UserInfo.getUserId() AND PermissionSetId = :permissionId
            ] == 0
        )
            insert new PermissionSetAssignment(
                AssigneeId = UserInfo.getUserId(),
                PermissionSetId = permissionId
            );
    }
    /**
     * Build the records and test dependencies needed to exercise this module without relying on
     * production data.
     */
    private static DmsPortalApi.Command fixture() {
        DMS_Distributor__c distributor = new DMS_Distributor__c(
            Name = 'Self service test',
            Active__c = true,
            Officer__c = UserInfo.getUserId()
        );
        insert distributor;
        Product__c product = new Product__c(
            Name = 'Test cases',
            Product_Code__c = 'SELF-TEST',
            MRP__c = 20,
            Retailer_Base_Price__c = 15,
            Units_Per_Case__c = 10,
            DMS_Case_Price__c = 100,
            GST_Percent__c = 5,
            Active__c = true,
            Sellable__c = true
        );
        insert product;
        Scheme__c scheme = new Scheme__c(
            Name = 'Primary test offer',
            Scheme_Code__c = 'SELF-OFFER',
            Start_Date__c = Date.today(),
            End_Date__c = Date.today().addDays(5),
            Scheme_Type__c = 'Same Product Free',
            Sales_Channel__c = 'Primary',
            Product__c = product.Id,
            Active__c = true,
            Minimum_Cases__c = 2,
            Free_Cases__c = 1,
            Discount_Percent__c = 10
        );
        insert scheme;
        DmsPortalApi.Command cmd = new DmsPortalApi.Command();
        cmd.action = 'distributorPrimaryOrder';
        cmd.distributorId = distributor.Id;
        cmd.requestKey = 'distributor-order-123456';
        DmsEmployeeTransactions.LineInput line = new DmsEmployeeTransactions.LineInput();
        line.productId = product.Id;
        line.cases = 4;
        line.schemeId = scheme.Id;
        cmd.lines = new List<DmsEmployeeTransactions.LineInput>{ line };
        return cmd;
    }
    /**
     * Invoke the command entry point with the test request and return its response for
     * assertions.
     */
    private static Map<String, Object> call(DmsPortalApi.Command cmd) {
        RestContext.request = new RestRequest();
        RestContext.response = new RestResponse();
        RestContext.request.requestBody = Blob.valueOf(JSON.serialize(cmd));
        System.runAs(new User(Id = UserInfo.getUserId())) {
            DmsPortalApi.execute();
        }
        return (Map<String, Object>) JSON.deserializeUntyped(
            RestContext.response.responseBody.toString()
        );
    }
    /**
     * Regression scenario: distributor order schemes approval and replay. Arrange isolated test
     * data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void distributorOrderSchemesApprovalAndReplay() {
        DmsPortalApi.Command cmd = fixture();
        Test.startTest();
        Map<String, Object> result = call(cmd);
        System.assertNotEquals(null, result.get('id'), JSON.serialize(result));
        System.assertEquals('Submitted', result.get('status'));
        Id orderId = (Id) result.get('id');
        DMS_Primary_Order__c order = [
            SELECT Employee__c, Order_Source__c, Officer__c, Total_Amount__c
            FROM DMS_Primary_Order__c
            WHERE Id = :orderId
        ];
        System.assertEquals(null, order.Employee__c);
        System.assertEquals('Distributor DMS', order.Order_Source__c);
        System.assertEquals(378, order.Total_Amount__c);
        System.assertEquals(UserInfo.getUserId(), order.Officer__c);
        DMS_Primary_Order_Line__c line = [
            SELECT Free_Cases__c, Discount_Amount__c, Scheme__c
            FROM DMS_Primary_Order_Line__c
            WHERE Order__c = :orderId
        ];
        System.assertEquals(2, line.Free_Cases__c);
        System.assertEquals(40, line.Discount_Amount__c);
        ProcessInstanceWorkitem work = [
            SELECT Id, ActorId
            FROM ProcessInstanceWorkitem
            WHERE ProcessInstance.TargetObjectId = :orderId
        ];
        System.assertEquals(
            order.Officer__c,
            work.ActorId,
            'Uses the assigned company officer, not the distributor.'
        );
        System.assertEquals(orderId, call(cmd).get('id'));
        cmd.notes = 'Changed payload';
        System.assert(call(cmd).containsKey('error'));
        cmd.notes = null;
        Approval.ProcessWorkitemRequest decision = new Approval.ProcessWorkitemRequest();
        decision.setWorkitemId(work.Id);
        decision.setAction('Approve');
        System.assert(Approval.process(decision).isSuccess());
        System.assertEquals('Approved', call(cmd).get('status'));
        System.assertEquals(
            false,
            Database.update(
                    new DMS_Primary_Order__c(Id = orderId, Order_Source__c = 'Employee SFA'),
                    false
                )
                .isSuccess()
        );
        Test.stopTest();
        System.assertEquals(1, [SELECT COUNT() FROM DMS_Primary_Order__c]);
        System.assertEquals(
            0,
            [SELECT COUNT() FROM DMS_Inventory__c],
            'Approval is not a goods receipt.'
        );
    }
    /**
     * Regression scenario: rejects invalid and keeps employee identity required. Arrange
     * isolated test data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void rejectsInvalidAndKeepsEmployeeIdentityRequired() {
        DmsPortalApi.Command cmd = fixture();
        cmd.lines[0].cases = 1;
        System.assert(call(cmd).containsKey('error'), 'Below scheme minimum');
        System.assertEquals(0, [SELECT COUNT() FROM DMS_Primary_Order__c]);
        System.assertEquals(0, [SELECT COUNT() FROM DMS_Primary_Order_Line__c]);
        cmd.lines[0].cases = 2;
        cmd.action = 'primaryOrder';
        System.assert(call(cmd).containsKey('error'), 'SFA still requires an employee');
        cmd.action = 'distributorPrimaryOrder';
        Employee__c employee = new Employee__c(
            Name = 'Test employee',
            Phone__c = '9000000000',
            Active__c = true,
            DMS_Distributor__c = cmd.distributorId
        );
        insert employee;
        cmd.employeeId = employee.Id;
        System.assert(call(cmd).containsKey('error'), 'No impersonation');
        cmd.employeeId = null;
        update new DMS_Distributor__c(Id = cmd.distributorId, Officer__c = null);
        System.assert(call(cmd).containsKey('error'), 'No unassigned approvals');
        System.assertEquals(0, [SELECT COUNT() FROM DMS_Primary_Order__c]);
        System.assertEquals(0, [SELECT COUNT() FROM DMS_Primary_Order_Line__c]);
    }
}
