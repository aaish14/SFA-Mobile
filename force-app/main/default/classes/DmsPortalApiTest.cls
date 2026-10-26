@IsTest
private class DmsPortalApiTest {
    /**
     * Assign the permission required for the test actor to exercise the protected workflow.
     */
    @TestSetup
    static void permission() {
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
     * Create the distributor test record needed by the portal command scenario.
     */
    private static DMS_Distributor__c distributor() {
        DMS_Distributor__c row = new DMS_Distributor__c(
            Name = 'Portal test',
            Active__c = true,
            Officer__c = UserInfo.getUserId()
        );
        insert row;
        return row;
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
     * Build a ticket request fixture for the command lifecycle/replay scenario.
     */
    private static DmsPortalApi.Command ticket(Id distributorId) {
        DmsPortalApi.Command cmd = new DmsPortalApi.Command();
        cmd.action = 'ticket';
        cmd.distributorId = distributorId;
        cmd.requestKey = 'ticket-1234567890';
        cmd.subject = 'Delivery issue';
        cmd.category = 'Delivery';
        cmd.description = 'Shipment arrived late.';
        return cmd;
    }
    /**
     * Regression scenario: ticket lifecycle and replay. Arrange isolated test data, exercise the
     * workflow and assert the expected outcome.
     */
    @IsTest
    static void ticketLifecycleAndReplay() {
        DmsPortalApi.Command cmd = ticket(distributor().Id);
        Test.startTest();
        Map<String, Object> created = call(cmd);
        System.assertNotEquals(null, created.get('id'), JSON.serialize(created));
        System.assertEquals(created.get('id'), call(cmd).get('id'));
        DMS_Support_Ticket__c row = [SELECT Id, Status__c, Officer__c FROM DMS_Support_Ticket__c];
        System.assertEquals('Open', row.Status__c);
        System.assertEquals(UserInfo.getUserId(), row.Officer__c);
        row.Status__c = 'Closed';
        System.assertEquals(false, Database.update(row, false).isSuccess());
        row.Status__c = 'In Progress';
        update row;
        row.Status__c = 'Closed';
        System.assertEquals(false, Database.update(row, false).isSuccess());
        row.Resolution__c = 'Replacement delivered';
        update row;
        System.assertEquals('Closed', call(cmd).get('status'));
        cmd.subject = 'Changed';
        System.assert(call(cmd).containsKey('error'));
        Test.stopTest();
        System.assertEquals(1, [SELECT COUNT() FROM DMS_Support_Ticket__c]);
    }
    /**
     * Regression scenario: bad inputs are atomic. Arrange isolated test data, exercise the
     * workflow and assert the expected outcome.
     */
    @IsTest
    static void badInputsAreAtomic() {
        DmsPortalApi.Command cmd = ticket(distributor().Id);
        cmd.category = 'Invalid';
        System.assert(call(cmd).containsKey('error'));
        cmd.category = 'Product';
        cmd.requestKey = 'bad';
        System.assert(call(cmd).containsKey('error'));
        cmd.action = 'unknown';
        System.assert(call(cmd).containsKey('error'));
        System.assertEquals(0, [SELECT COUNT() FROM DMS_Support_Ticket__c]);
        cmd.action = 'secondaryDecision';
        cmd.decision = 'Rejected';
        cmd.notes = null;
        System.assert(call(cmd).containsKey('error'));
        cmd.notes = 'Not needed';
        System.assert(call(cmd).containsKey('error'));
    }
    /**
     * Regression scenario: receives approved goods once without over receiving. Arrange isolated
     * test data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void receivesApprovedGoodsOnceWithoutOverReceiving() {
        DMS_Distributor__c supplier = distributor();
        Employee__c employee = new Employee__c(
            Name = 'Portal employee',
            Phone__c = '9000000000',
            Active__c = true,
            DMS_Distributor__c = supplier.Id
        );
        insert employee;
        Product__c product = new Product__c(
            Name = 'Portal product',
            Product_Code__c = 'PORTAL-1',
            MRP__c = 20,
            Retailer_Base_Price__c = 15,
            Units_Per_Case__c = 10,
            DMS_Case_Price__c = 100,
            Active__c = true,
            Sellable__c = true
        );
        insert product;
        DMS_Primary_Order__c order = new DMS_Primary_Order__c(
            Distributor__c = supplier.Id,
            Employee__c = employee.Id
        );
        insert order;
        DMS_Primary_Order_Line__c line = new DMS_Primary_Order_Line__c(
            Order__c = order.Id,
            Product__c = product.Id,
            Cases__c = 3
        );
        insert line;
        DmsPortalApi.Command cmd = new DmsPortalApi.Command();
        cmd.action = 'receiveGoods';
        cmd.distributorId = supplier.Id;
        cmd.recordId = line.Id;
        cmd.cases = 2;
        cmd.batch = 'BATCH-1';
        cmd.expiry = Date.today().addDays(90);
        cmd.requestKey = 'receipt-1234567890';
        System.assert(call(cmd).containsKey('error'), 'Draft orders must not create stock.');
        Approval.ProcessSubmitRequest submit = new Approval.ProcessSubmitRequest();
        submit.setObjectId(order.Id);
        submit.setProcessDefinitionNameOrId('Company_Officer_Approval');
        Approval.ProcessResult submission = Approval.process(submit);
        Approval.ProcessWorkitemRequest approve = new Approval.ProcessWorkitemRequest();
        approve.setWorkitemId(submission.getNewWorkitemIds()[0]);
        approve.setAction('Approve');
        Approval.process(approve);
        Test.startTest();
        Map<String, Object> receipt = call(cmd);
        System.assertNotEquals(null, receipt.get('id'), JSON.serialize(receipt));
        System.assertEquals(receipt.get('id'), call(cmd).get('id'));
        System.assertEquals(20, [SELECT On_Hand_Pieces__c FROM DMS_Inventory__c].On_Hand_Pieces__c);
        cmd.cases = 1;
        System.assert(call(cmd).containsKey('error'), 'Key reuse must not change payload.');
        cmd.requestKey = 'receipt-abcdefghij';
        cmd.cases = 2;
        System.assert(call(cmd).containsKey('error'), 'No over receipt.');
        cmd.cases = 1;
        System.assertNotEquals(null, call(cmd).get('id'));
        Test.stopTest();
        System.assertEquals(30, [SELECT On_Hand_Pieces__c FROM DMS_Inventory__c].On_Hand_Pieces__c);
        System.assertEquals(2, [SELECT COUNT() FROM DMS_Goods_Receipt__c]);
    }
    /**
     * Regression scenario: return decision is scoped and repeatable. Arrange isolated test data,
     * exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void returnDecisionIsScopedAndRepeatable() {
        DMS_Distributor__c supplier = distributor();
        DMS_Distributor__c other = distributor();
        Retailer__c outlet = new Retailer__c(
            Name = 'Portal outlet',
            Active__c = true,
            DMS_Distributor__c = supplier.Id
        );
        insert outlet;
        Product__c product = new Product__c(
            Name = 'Return product',
            Product_Code__c = 'PORTAL-R',
            MRP__c = 20,
            Retailer_Base_Price__c = 15,
            Units_Per_Case__c = 10
        );
        insert product;
        Product_Return__c returned = new Product_Return__c(
            Outlet__c = outlet.Id,
            Product__c = product.Id,
            Quantity__c = 2,
            Return_Reason__c = 'Damaged'
        );
        insert returned;
        DmsPortalApi.Command cmd = new DmsPortalApi.Command();
        cmd.action = 'returnDecision';
        cmd.recordId = returned.Id;
        cmd.distributorId = other.Id;
        cmd.decision = 'Approved';
        System.assert(call(cmd).containsKey('error'));
        cmd.distributorId = supplier.Id;
        System.assertEquals('Approved', call(cmd).get('status'));
        System.assertEquals('Approved', call(cmd).get('status'));
        cmd.decision = 'Rejected';
        cmd.notes = 'Changed';
        System.assert(call(cmd).containsKey('error'));
    }
    /**
     * Regression scenario: employee order uses salesforce prices and is idempotent. Arrange
     * isolated test data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void employeeOrderUsesSalesforcePricesAndIsIdempotent() {
        DMS_Distributor__c supplier = distributor();
        Employee__c employee = new Employee__c(
            Name = 'Primary employee',
            Phone__c = '9000000000',
            Active__c = true,
            DMS_Distributor__c = supplier.Id
        );
        insert employee;
        Product__c product = new Product__c(
            Name = 'Primary product',
            Product_Code__c = 'PRIMARY-1',
            MRP__c = 20,
            Retailer_Base_Price__c = 15,
            Units_Per_Case__c = 10,
            DMS_Case_Price__c = 100,
            Active__c = true,
            Sellable__c = true
        );
        insert product;
        DmsPortalApi.Command cmd = new DmsPortalApi.Command();
        cmd.action = 'primaryOrder';
        cmd.distributorId = supplier.Id;
        cmd.employeeId = employee.Id;
        cmd.requestKey = 'primary-1234567890';
        DmsEmployeeTransactions.LineInput input = new DmsEmployeeTransactions.LineInput();
        input.productId = product.Id;
        input.cases = 2;
        cmd.lines = new List<DmsEmployeeTransactions.LineInput>{ input };
        Test.startTest();
        Map<String, Object> order = call(cmd);
        System.assertNotEquals(null, order.get('id'), JSON.serialize(order));
        System.assertEquals('Submitted', order.get('status'));
        System.assertEquals(order.get('id'), call(cmd).get('id'));
        input.cases = 3;
        System.assert(call(cmd).containsKey('error'));
        Test.stopTest();
        System.assertEquals(1, [SELECT COUNT() FROM DMS_Primary_Order__c]);
        DMS_Primary_Order_Line__c line = [
            SELECT Case_Price__c, Pieces_Per_Case__c, Cases__c
            FROM DMS_Primary_Order_Line__c
        ];
        System.assertEquals(100, line.Case_Price__c);
        System.assertEquals(10, line.Pieces_Per_Case__c);
        System.assertEquals(2, line.Cases__c);
    }
    /**
     * Regression scenario: employee return uses receipt and cannot exceed receipt. Arrange
     * isolated test data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void employeeReturnUsesReceiptAndCannotExceedReceipt() {
        DMS_Distributor__c supplier = distributor();
        Employee__c employee = new Employee__c(
            Name = 'Return employee',
            Phone__c = '9000000000',
            Active__c = true,
            DMS_Distributor__c = supplier.Id
        );
        insert employee;
        Product__c product = new Product__c(
            Name = 'Received product',
            Product_Code__c = 'PRIMARY-R',
            MRP__c = 20,
            Retailer_Base_Price__c = 15,
            Units_Per_Case__c = 10,
            DMS_Case_Price__c = 100,
            Active__c = true,
            Sellable__c = true
        );
        insert product;
        DMS_Primary_Order__c original = new DMS_Primary_Order__c(
            Distributor__c = supplier.Id,
            Employee__c = employee.Id
        );
        insert original;
        DMS_Goods_Receipt__c receipt = new DMS_Goods_Receipt__c(
            Distributor__c = supplier.Id,
            Primary_Order__c = original.Id,
            Status__c = 'Received',
            Received_Date__c = Date.today()
        );
        insert receipt;
        DMS_Goods_Receipt_Line__c received = new DMS_Goods_Receipt_Line__c(
            Goods_Receipt__c = receipt.Id,
            Product__c = product.Id,
            Received_Cases__c = 3,
            Pieces_Per_Case__c = 10,
            Case_Cost__c = 100,
            Batch_Number__c = 'R1'
        );
        insert received;
        DmsPortalApi.Command cmd = new DmsPortalApi.Command();
        cmd.action = 'primaryReturn';
        cmd.distributorId = supplier.Id;
        cmd.employeeId = employee.Id;
        cmd.requestKey = 'return-1234567890';
        DmsEmployeeTransactions.LineInput input = new DmsEmployeeTransactions.LineInput();
        input.receiptLineId = received.Id;
        input.cases = 2;
        input.reason = 'Damaged';
        cmd.lines = new List<DmsEmployeeTransactions.LineInput>{ input };
        Test.startTest();
        Map<String, Object> returned = call(cmd);
        System.assertNotEquals(null, returned.get('id'), JSON.serialize(returned));
        System.assertEquals(returned.get('id'), call(cmd).get('id'));
        cmd.requestKey = 'return-abcdefghij';
        System.assert(call(cmd).containsKey('error'));
        Test.stopTest();
        System.assertEquals(1, [SELECT COUNT() FROM DMS_Primary_Return__c]);
    }
    /**
     * Regression scenario: employee cannot order for another distributor. Arrange isolated test
     * data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void employeeCannotOrderForAnotherDistributor() {
        DMS_Distributor__c supplier = distributor(), other = distributor();
        Employee__c employee = new Employee__c(
            Name = 'Scoped employee',
            Phone__c = '9000000000',
            Active__c = true,
            DMS_Distributor__c = supplier.Id
        );
        insert employee;
        DmsPortalApi.Command cmd = new DmsPortalApi.Command();
        cmd.action = 'primaryOrder';
        cmd.employeeId = employee.Id;
        cmd.distributorId = other.Id;
        System.assert(call(cmd).containsKey('error'));
        System.assertEquals(0, [SELECT COUNT() FROM DMS_Primary_Order__c]);
    }
    /**
     * Regression scenario: primary schemes and free receipts. Arrange isolated test data,
     * exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void primarySchemesAndFreeReceipts() {
        DMS_Distributor__c supplier = distributor();
        Employee__c employee = new Employee__c(
            Name = 'Scheme employee',
            Phone__c = '9000000000',
            Active__c = true,
            DMS_Distributor__c = supplier.Id
        );
        insert employee;
        Product__c paid = new Product__c(
            Name = 'Paid',
            Product_Code__c = 'PROMO-P',
            MRP__c = 20,
            Retailer_Base_Price__c = 15,
            Units_Per_Case__c = 10,
            DMS_Case_Price__c = 2000,
            Active__c = true,
            Sellable__c = true
        );
        Product__c bonus = new Product__c(
            Name = 'Bonus',
            Product_Code__c = 'PROMO-F',
            MRP__c = 10,
            Retailer_Base_Price__c = 8,
            Units_Per_Case__c = 20,
            DMS_Case_Price__c = 100,
            Active__c = true,
            Sellable__c = true
        );
        insert new List<Product__c>{ paid, bonus };
        Scheme__c scheme = new Scheme__c(
            Name = 'Buy one get two',
            Scheme_Type__c = 'Different Listed Product Free',
            Sales_Channel__c = 'Primary',
            Active__c = true,
            Minimum_Cases__c = 1,
            Free_Cases__c = 2,
            Free_Product__c = bonus.Id,
            Discount_Percent__c = 10
        );
        scheme.Scheme_Code__c = 'PRIMARY-FREE';
        scheme.Start_Date__c = Date.today().addDays(-30);
        scheme.End_Date__c = Date.today().addDays(30);
        insert scheme;
        insert new Scheme_Product__c(Scheme__c = scheme.Id, Product__c = paid.Id, Active__c = true);
        DMS_Primary_Order__c order = new DMS_Primary_Order__c(
            Distributor__c = supplier.Id,
            Employee__c = employee.Id
        );
        insert order;
        DMS_Primary_Order_Line__c line = new DMS_Primary_Order_Line__c(
            Order__c = order.Id,
            Product__c = paid.Id,
            Cases__c = 3,
            Scheme__c = scheme.Id
        );
        insert line;
        line = [
            SELECT
                Id,
                Free_Cases__c,
                Free_Product__c,
                Free_Pieces_Per_Case__c,
                Discount_Amount__c,
                Total_Pieces__c
            FROM DMS_Primary_Order_Line__c
            WHERE Id = :line.Id
        ];
        System.assertEquals(6, line.Free_Cases__c);
        System.assertEquals(bonus.Id, line.Free_Product__c);
        System.assertEquals(20, line.Free_Pieces_Per_Case__c);
        System.assertEquals(600, line.Discount_Amount__c);
        System.assertEquals(150, line.Total_Pieces__c);
        Approval.ProcessSubmitRequest submit = new Approval.ProcessSubmitRequest();
        submit.setObjectId(order.Id);
        submit.setProcessDefinitionNameOrId('Company_Officer_Approval');
        Approval.ProcessResult submission = Approval.process(submit);
        Approval.ProcessWorkitemRequest approve = new Approval.ProcessWorkitemRequest();
        approve.setWorkitemId(submission.getNewWorkitemIds()[0]);
        approve.setAction('Approve');
        Approval.process(approve);
        DmsPortalApi.Command cmd = new DmsPortalApi.Command();
        cmd.action = 'receiveGoods';
        cmd.distributorId = supplier.Id;
        cmd.recordId = line.Id;
        cmd.receiptKind = 'Free';
        cmd.cases = 6;
        cmd.batch = 'FREE1';
        cmd.expiry = Date.today().addMonths(6);
        cmd.requestKey = 'free-receipt-123456';
        Test.startTest();
        Map<String, Object> result = call(cmd);
        System.assertNotEquals(null, result.get('id'), JSON.serialize(result));
        System.assertEquals(result.get('id'), call(cmd).get('id'));
        cmd.requestKey = 'free-receipt-654321';
        cmd.cases = 1;
        System.assert(call(cmd).containsKey('error'));
        Test.stopTest();
        DMS_Inventory__c stock = [SELECT Product__c, On_Hand_Pieces__c FROM DMS_Inventory__c];
        System.assertEquals(bonus.Id, stock.Product__c);
        System.assertEquals(120, stock.On_Hand_Pieces__c);
        System.assertEquals(
            0,
            [SELECT Received_Value__c FROM DMS_Goods_Receipt_Line__c].Received_Value__c
        );
    }
    /**
     * Regression scenario: invalid schemes and survey ownership. Arrange isolated test data,
     * exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void invalidSchemesAndSurveyOwnership() {
        DMS_Distributor__c supplier = distributor();
        Product__c product = new Product__c(
            Name = 'Scheme check',
            Product_Code__c = 'SCHEME-CHECK',
            MRP__c = 20,
            Retailer_Base_Price__c = 15,
            Units_Per_Case__c = 10,
            DMS_Case_Price__c = 100,
            Active__c = true,
            Sellable__c = true
        );
        insert product;
        DMS_Primary_Order__c order = new DMS_Primary_Order__c(Distributor__c = supplier.Id);
        insert order;
        Scheme__c scheme = new Scheme__c(
            Name = 'Minimum two',
            Scheme_Code__c = 'PRIMARY-MIN',
            Start_Date__c = Date.today().addDays(-30),
            End_Date__c = Date.today().addDays(30),
            Scheme_Type__c = 'Same Product Free',
            Sales_Channel__c = 'Primary',
            Product__c = product.Id,
            Active__c = true,
            Minimum_Cases__c = 2,
            Free_Cases__c = 1,
            Discount_Amount__c = 5,
            Free_Gift__c = 'Display',
            Gift_Quantity__c = 1
        );
        insert scheme;
        DMS_Primary_Order_Line__c line = new DMS_Primary_Order_Line__c(
            Order__c = order.Id,
            Product__c = product.Id,
            Cases__c = 1,
            Scheme__c = scheme.Id
        );
        System.assertEquals(false, Database.insert(line, false).isSuccess());
        line.Cases__c = 5;
        insert line;
        line = [
            SELECT Id, Free_Cases__c, Gift_Quantity__c, Discount_Amount__c, Scheme__c
            FROM DMS_Primary_Order_Line__c
            WHERE Id = :line.Id
        ];
        System.assertEquals(2, line.Free_Cases__c);
        System.assertEquals(10, line.Discount_Amount__c);
        System.assertEquals(2, line.Gift_Quantity__c);
        line.Scheme__c = null;
        update line;
        System.assertEquals(
            0,
            [SELECT Free_Cases__c FROM DMS_Primary_Order_Line__c WHERE Id = :line.Id].Free_Cases__c
        );
        scheme.Active__c = false;
        update scheme;
        line.Scheme__c = scheme.Id;
        System.assertEquals(false, Database.update(line, false).isSuccess());
        scheme.Active__c = true;
        scheme.End_Date__c = Date.today().addDays(-1);
        update scheme;
        System.assertEquals(false, Database.update(line, false).isSuccess());
        scheme.End_Date__c = Date.today().addDays(30);
        scheme.Discount_Percent__c = 100;
        scheme.Discount_Amount__c = 50;
        update scheme;
        System.assertEquals(false, Database.update(line, false).isSuccess());
        DMS_Distributor_Survey__c survey = new DMS_Distributor_Survey__c(
            Distributor__c = supplier.Id,
            Product__c = product.Id,
            Visit_Date__c = Date.today(),
            Stock_Cases__c = 5,
            Movement__c = 'Slow Moving',
            Demand_Notes__c = 'Review demand next month.'
        );
        insert survey;
        System.assertEquals(
            UserInfo.getUserId(),
            [SELECT Officer__c FROM DMS_Distributor_Survey__c WHERE Id = :survey.Id].Officer__c
        );
        supplier.Officer__c = null;
        update supplier;
        survey.Stock_Cases__c = 6;
        System.assertEquals(false, Database.update(survey, false).isSuccess());
    }
    /**
     * Regression scenario: denies untrusted user. Arrange isolated test data, exercise the
     * workflow and assert the expected outcome.
     */
    @IsTest
    static void deniesUntrustedUser() {
        User user = new User(
            Alias = 'notrust',
            Email = 'no@example.invalid',
            EmailEncodingKey = 'UTF-8',
            LastName = 'No API Access',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            TimeZoneSidKey = 'Asia/Kolkata',
            ProfileId = [SELECT Id FROM Profile WHERE Name = 'Standard Platform User' LIMIT 1]
            .Id,
            Username = 'no-dms-' + System.now().getTime() + '@example.invalid'
        );
        insert user;
        System.runAs(user) {
            System.assert(call(new DmsPortalApi.Command()).containsKey('error'));
            System.assertEquals(403, RestContext.response.statusCode);
        }
    }
}
