@IsTest
private class DmsPrimaryWorkflowTest {
    /**
     * Create the shared isolated records required by the test scenarios.
     */
    @TestSetup
    static void setupData() {
        DMS_Distributor__c distributor = new DMS_Distributor__c(
            Name = 'Workflow test distributor',
            Active__c = true,
            Officer__c = UserInfo.getUserId()
        );
        insert distributor;
        insert new Employee__c(
            Name = 'Workflow test employee',
            Phone__c = '9000000000',
            Active__c = true,
            DMS_Distributor__c = distributor.Id
        );
        insert new Product__c(
            Name = 'Workflow test product',
            Product_Code__c = 'DMS-WF-TEST',
            MRP__c = 20,
            Retailer_Base_Price__c = 15,
            Units_Per_Case__c = 20,
            DMS_Case_Price__c = 100,
            GST_Percent__c = 5,
            Active__c = true,
            Sellable__c = true
        );
    }
    /**
     * Build the primary order test record used to exercise workflow transitions.
     */
    private static DMS_Primary_Order__c order() {
        DMS_Primary_Order__c record = new DMS_Primary_Order__c(
            Distributor__c = [SELECT Id FROM DMS_Distributor__c LIMIT 1]
            .Id,
            Employee__c = [SELECT Id FROM Employee__c LIMIT 1]
            .Id
        );
        insert record;
        return record;
    }
    /**
     * Build a primary order line with the product and quantity used by the scenario.
     */
    private static DMS_Primary_Order_Line__c orderLine(Id parent) {
        DMS_Primary_Order_Line__c line = new DMS_Primary_Order_Line__c(
            Order__c = parent,
            Product__c = [SELECT Id FROM Product__c LIMIT 1]
            .Id,
            Cases__c = 2,
            Free_Cases__c = 1,
            Discount_Amount__c = 10
        );
        insert line;
        return line;
    }
    /**
     * Build a primary return record for workflow decision tests.
     */
    private static DMS_Primary_Return__c returnRecord() {
        DMS_Primary_Return__c record = new DMS_Primary_Return__c(
            Distributor__c = [SELECT Id FROM DMS_Distributor__c LIMIT 1]
            .Id,
            Employee__c = [SELECT Id FROM Employee__c LIMIT 1]
            .Id
        );
        insert record;
        insert new DMS_Primary_Return_Line__c(
            Primary_Return__c = record.Id,
            Product__c = [SELECT Id FROM Product__c LIMIT 1]
            .Id,
            Cases__c = 1,
            Reason__c = 'Damaged'
        );
        return record;
    }
    /**
     * Submit the test transaction through the workflow under test and return its result where
     * applicable.
     */
    private static Approval.ProcessResult submit(Id recordId, String process) {
        Approval.ProcessSubmitRequest request = new Approval.ProcessSubmitRequest();
        request.setObjectId(recordId);
        request.setProcessDefinitionNameOrId(process);
        Approval.ProcessResult result = Approval.process(request);
        System.assert(result.isSuccess(), 'Approval submission must succeed.');
        System.assertEquals(
            UserInfo.getUserId(),
            [SELECT ActorId FROM ProcessInstanceWorkitem WHERE Id = :result.getNewWorkitemIds()[0]]
            .ActorId,
            'Route to the distributor company officer.'
        );
        return result;
    }
    /**
     * Apply the test workflow decision so the scenario can assert approval or rejection effects.
     */
    private static void decide(Approval.ProcessResult submitted, String action) {
        Approval.ProcessWorkitemRequest request = new Approval.ProcessWorkitemRequest();
        request.setWorkitemId(submitted.getNewWorkitemIds()[0]);
        request.setAction(action);
        request.setComments('Workflow verification decision');
        System.assert(Approval.process(request).isSuccess());
    }
    /**
     * Regression scenario: snapshots and recalculates discounted totals. Arrange isolated test
     * data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void snapshotsAndRecalculatesDiscountedTotals() {
        DMS_Primary_Order__c parent = order();
        DMS_Primary_Order_Line__c line = orderLine(parent.Id);
        DMS_Primary_Order_Line__c saved = [
            SELECT Pieces_Per_Case__c, Case_Price__c, Tax_Percent__c, Total_Pieces__c
            FROM DMS_Primary_Order_Line__c
            WHERE Id = :line.Id
        ];
        System.assertEquals(20, saved.Pieces_Per_Case__c);
        System.assertEquals(100, saved.Case_Price__c);
        System.assertEquals(5, saved.Tax_Percent__c);
        System.assertEquals(60, saved.Total_Pieces__c);
        System.assertEquals(
            199.50,
            [SELECT Total_Amount__c FROM DMS_Primary_Order__c WHERE Id = :parent.Id].Total_Amount__c
        );
        Product__c product = [SELECT Id FROM Product__c LIMIT 1];
        product.DMS_Case_Price__c = 200;
        product.Units_Per_Case__c = 30;
        update product;
        update new DMS_Primary_Order_Line__c(Id = line.Id, Cases__c = 3);
        System.assertEquals(
            304.50,
            [SELECT Total_Amount__c FROM DMS_Primary_Order__c WHERE Id = :parent.Id].Total_Amount__c
        );
        delete line;
        System.assertEquals(
            0,
            [SELECT Total_Amount__c FROM DMS_Primary_Order__c WHERE Id = :parent.Id].Total_Amount__c
        );
        undelete line;
        System.assertEquals(
            304.50,
            [SELECT Total_Amount__c FROM DMS_Primary_Order__c WHERE Id = :parent.Id].Total_Amount__c
        );
    }
    /**
     * Regression scenario: approves primary order and protects lines. Arrange isolated test
     * data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void approvesPrimaryOrderAndProtectsLines() {
        DMS_Primary_Order__c parent = order();
        DMS_Primary_Order_Line__c line = orderLine(parent.Id);
        System.assertEquals(
            UserInfo.getUserId(),
            [SELECT Officer__c FROM DMS_Primary_Order__c WHERE Id = :parent.Id].Officer__c
        );
        Test.startTest();
        Approval.ProcessResult result = submit(parent.Id, 'Company_Officer_Approval');
        System.assertEquals(
            'Submitted',
            [SELECT Status__c FROM DMS_Primary_Order__c WHERE Id = :parent.Id].Status__c
        );
        System.assertEquals(
            false,
            Database.update(new DMS_Primary_Order_Line__c(Id = line.Id, Cases__c = 3), false)
                .isSuccess()
        );
        decide(result, 'Approve');
        Test.stopTest();
        System.assertEquals(
            'Approved',
            [SELECT Status__c FROM DMS_Primary_Order__c WHERE Id = :parent.Id].Status__c
        );
        System.assertEquals(false, Database.delete(line, false).isSuccess());
    }
    /**
     * Regression scenario: rejects primary order. Arrange isolated test data, exercise the
     * workflow and assert the expected outcome.
     */
    @IsTest
    static void rejectsPrimaryOrder() {
        DMS_Primary_Order__c parent = order();
        orderLine(parent.Id);
        decide(submit(parent.Id, 'Company_Officer_Approval'), 'Reject');
        System.assertEquals(
            'Rejected',
            [SELECT Status__c FROM DMS_Primary_Order__c WHERE Id = :parent.Id].Status__c
        );
    }
    /**
     * Regression scenario: approves and rejects primary returns. Arrange isolated test data,
     * exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void approvesAndRejectsPrimaryReturns() {
        DMS_Primary_Return__c approved = returnRecord();
        DMS_Primary_Return__c rejected = returnRecord();
        // Standard approval comments are stored in approval history; reject
        // must work without editing a locked record's Rejection Reason first.
        Test.startTest();
        decide(submit(approved.Id, 'Company_Officer_Return_Approval'), 'Approve');
        decide(submit(rejected.Id, 'Company_Officer_Return_Approval'), 'Reject');
        Test.stopTest();
        System.assertEquals(
            'Approved',
            [SELECT Status__c FROM DMS_Primary_Return__c WHERE Id = :approved.Id].Status__c
        );
        System.assertEquals(
            'Rejected',
            [SELECT Status__c FROM DMS_Primary_Return__c WHERE Id = :rejected.Id].Status__c
        );
        System.assertEquals(
            100,
            [SELECT Total_Amount__c FROM DMS_Primary_Return__c WHERE Id = :approved.Id]
            .Total_Amount__c
        );
        DMS_Primary_Return_Line__c line = [
            SELECT Id
            FROM DMS_Primary_Return_Line__c
            WHERE Primary_Return__c = :approved.Id
        ];
        System.assertEquals(false, Database.delete(line, false).isSuccess());
    }
    /**
     * Regression scenario: prevents empty or mismatched submission. Arrange isolated test data,
     * exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void preventsEmptyOrMismatchedSubmission() {
        DMS_Primary_Order__c empty = order();
        Approval.ProcessSubmitRequest emptyRequest = new Approval.ProcessSubmitRequest();
        emptyRequest.setObjectId(empty.Id);
        emptyRequest.setProcessDefinitionNameOrId('Company_Officer_Approval');
        System.assertEquals(
            false,
            Approval.process(emptyRequest, false).isSuccess(),
            'Actual approval submission must reject orders without products.'
        );
        empty.Status__c = 'Submitted';
        System.assertEquals(false, Database.update(empty, false).isSuccess());
        DMS_Distributor__c other = new DMS_Distributor__c(
            Name = 'Other distributor',
            Active__c = true
        );
        insert other;
        empty.Status__c = 'Draft';
        empty.Distributor__c = other.Id;
        System.assertEquals(false, Database.update(empty, false).isSuccess());
        DMS_Primary_Order__c parent = order();
        DMS_Primary_Order_Line__c bad = new DMS_Primary_Order_Line__c(
            Order__c = parent.Id,
            Product__c = [SELECT Id FROM Product__c LIMIT 1]
            .Id,
            Cases__c = 0
        );
        System.assertEquals(false, Database.insert(bad, false).isSuccess());
        bad.Cases__c = 1;
        bad.Order__c = null;
        System.assertEquals(false, Database.insert(bad, false).isSuccess());
    }
    /**
     * Regression scenario: handles bulk lines and reparenting. Arrange isolated test data,
     * exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void handlesBulkLinesAndReparenting() {
        DMS_Primary_Order__c first = order(), second = order();
        Id productId = [SELECT Id FROM Product__c LIMIT 1].Id;
        List<DMS_Primary_Order_Line__c> lines = new List<DMS_Primary_Order_Line__c>();
        for (Integer i = 0; i < 200; i++)
            lines.add(
                new DMS_Primary_Order_Line__c(
                    Order__c = first.Id,
                    Product__c = productId,
                    Cases__c = 1
                )
            );
        Test.startTest();
        insert lines;
        System.assertEquals(
            21000,
            [SELECT Total_Amount__c FROM DMS_Primary_Order__c WHERE Id = :first.Id].Total_Amount__c
        );
        lines[0].Order__c = second.Id;
        update lines[0];
        System.assertEquals(
            20895,
            [SELECT Total_Amount__c FROM DMS_Primary_Order__c WHERE Id = :first.Id].Total_Amount__c
        );
        System.assertEquals(
            105,
            [SELECT Total_Amount__c FROM DMS_Primary_Order__c WHERE Id = :second.Id].Total_Amount__c
        );
        Test.stopTest();
    }
    /**
     * Regression scenario: shares only with designated officer. Arrange isolated test data,
     * exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void sharesOnlyWithDesignatedOfficer() {
        User officer = new User(
            LastName = 'DMS Test Officer',
            Alias = 'dmstesto',
            Email = 'dms-officer@example.invalid',
            Username = 'dms.officer.' +
                UserInfo.getOrganizationId() +
                '.' +
                System.now().getTime() +
                '@example.invalid',
            TimeZoneSidKey = 'Asia/Kolkata',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US',
            ProfileId = [SELECT Id FROM Profile WHERE Name = 'Standard Platform User' LIMIT 1]
            .Id
        );
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert officer;
            insert new PermissionSetAssignment(
                AssigneeId = officer.Id,
                PermissionSetId = [
                    SELECT Id
                    FROM PermissionSet
                    WHERE Name = 'DMS_Distributor_Officer'
                ]
                .Id
            );
        }
        DMS_Distributor__c distributor = [SELECT Id, Officer__c FROM DMS_Distributor__c LIMIT 1];
        distributor.Officer__c = officer.Id;
        update distributor;
        DMS_Primary_Order__c parent = order();
        DMS_Primary_Order_Line__c line = orderLine(parent.Id);
        DMS_Primary_Return__c returned = returnRecord();
        System.assertEquals(
            1,
            [
                SELECT COUNT()
                FROM DMS_Primary_Order__Share
                WHERE
                    ParentId = :parent.Id
                    AND UserOrGroupId = :officer.Id
                    AND RowCause = 'Officer_Access__c'
            ]
        );
        System.assertEquals(
            1,
            [
                SELECT COUNT()
                FROM DMS_Primary_Order_Line__Share
                WHERE
                    ParentId = :line.Id
                    AND UserOrGroupId = :officer.Id
                    AND RowCause = 'Officer_Access__c'
            ]
        );
        System.assertEquals(
            1,
            [
                SELECT COUNT()
                FROM DMS_Primary_Return__Share
                WHERE
                    ParentId = :returned.Id
                    AND UserOrGroupId = :officer.Id
                    AND RowCause = 'Officer_Access__c'
            ]
        );
        // A real non-admin, licensed officer must be able to approve the routed work item.
        Approval.ProcessSubmitRequest request = new Approval.ProcessSubmitRequest();
        request.setObjectId(parent.Id);
        request.setProcessDefinitionNameOrId('Company_Officer_Approval');
        Approval.ProcessResult submitted = Approval.process(request);
        System.runAs(officer) {
            decide(submitted, 'Approve');
        }
        System.assertEquals(
            'Approved',
            [SELECT Status__c FROM DMS_Primary_Order__c WHERE Id = :parent.Id].Status__c
        );
        // Draft reassignment removes only our managed shares, not other manual grants.
        distributor.Officer__c = UserInfo.getUserId();
        update distributor;
        update new DMS_Primary_Return__c(Id = returned.Id, Notes__c = 'Refresh draft approver');
        System.assertEquals(
            0,
            [
                SELECT COUNT()
                FROM DMS_Primary_Return__Share
                WHERE ParentId = :returned.Id AND RowCause = 'Officer_Access__c'
            ]
        );
        DmsOfficerSharing.synchronize('DMS_Primary_Order__c', new Set<Id>());
        try {
            DmsOfficerSharing.synchronize('Employee__c', new Set<Id>{ parent.Id });
            System.assert(false, 'Unsupported objects must be rejected.');
        } catch (DmsOfficerSharing.SharingConfigurationException expected) {
        }
    }
}
