@IsTest
private class DmsEmployeeAllocatorTest {
    /**
     * Configure the ordered distributor pool and cursor records used by allocator tests.
     */
    private static List<DMS_Distributor__c> configurePool() {
        insert new DMS_Allocation_State__c(
            Name = 'Employee distributor allocation',
            Allocation_Key__c = 'EmployeeDistributor',
            Last_Allocated_Order__c = 0
        );
        List<DMS_Distributor__c> pool = new List<DMS_Distributor__c>();
        for (Integer i = 1; i <= 3; i++) {
            pool.add(
                new DMS_Distributor__c(
                    Name = 'Distributor ' + i,
                    Active__c = true,
                    Employee_Allocation_Order__c = i,
                    Partner_Type__c = 'Distributor'
                )
            );
        }
        insert pool;
        return pool;
    }
    /**
     * Build employee test records for the requested allocation scenario.
     */
    private static List<Employee__c> employees(Integer count) {
        List<Employee__c> records = new List<Employee__c>();
        for (Integer i = 0; i < count; i++) {
            records.add(
                new Employee__c(
                    Name = 'Allocation employee ' + i,
                    Phone__c = '9000000000',
                    Active__c = true
                )
            );
        }
        return records;
    }
    /**
     * Read the allocation cursor so the test can assert round-robin progress or rollback.
     */
    private static Decimal cursor() {
        return [
            SELECT Last_Allocated_Order__c
            FROM DMS_Allocation_State__c
            WHERE Allocation_Key__c = 'EmployeeDistributor'
        ]
        .Last_Allocated_Order__c;
    }
    /**
     * Regression scenario: rotates and continues without reassigning. Arrange isolated test
     * data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void rotatesAndContinuesWithoutReassigning() {
        List<DMS_Distributor__c> pool = configurePool();
        Test.startTest();
        List<Employee__c> records = employees(7);
        insert records;
        List<Employee__c> saved = [
            SELECT Id, DMS_Distributor__c
            FROM Employee__c
            ORDER BY CreatedDate, Id
        ];
        for (Integer i = 0; i < 7; i++) {
            System.assertEquals(pool[Math.mod(i, 3)].Id, saved[i].DMS_Distributor__c);
        }
        DmsEmployeeAllocator.allocate(new Map<Id, Employee__c>(saved).keySet());
        System.assertEquals(1, cursor(), 'Retry must not consume another turn.');
        List<Employee__c> next = employees(1);
        insert next;
        System.assertEquals(
            pool[1].Id,
            [SELECT DMS_Distributor__c FROM Employee__c WHERE Id = :next[0].Id].DMS_Distributor__c
        );
        saved[0].Name = 'Edited employee';
        update saved[0];
        System.assertEquals(2, cursor(), 'Normal edits do not reallocate.');
        Test.stopTest();
    }
    /**
     * Regression scenario: supports bulk and preserves manual assignment. Arrange isolated test
     * data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void supportsBulkAndPreservesManualAssignment() {
        List<DMS_Distributor__c> pool = configurePool();
        List<Employee__c> records = employees(200);
        records[0].DMS_Distributor__c = pool[2].Id;
        Test.startTest();
        insert records;
        Test.stopTest();
        System.assertEquals(
            200,
            [SELECT COUNT() FROM Employee__c WHERE DMS_Distributor__c != NULL]
        );
        System.assertEquals(
            pool[2].Id,
            [SELECT DMS_Distributor__c FROM Employee__c WHERE Id = :records[0].Id]
            .DMS_Distributor__c
        );
        System.assertEquals(1, cursor(), 'Only 199 automatic assignments consume turns.');
        List<Employee__c> automatic = [
            SELECT DMS_Distributor__c
            FROM Employee__c
            WHERE Id != :records[0].Id
            ORDER BY CreatedDate, Id
        ];
        for (Integer i = 0; i < automatic.size(); i++) {
            System.assertEquals(pool[Math.mod(i, 3)].Id, automatic[i].DMS_Distributor__c);
        }
    }
    /**
     * Regression scenario: skips inactive and unconfigured distributors. Arrange isolated test
     * data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void skipsInactiveAndUnconfiguredDistributors() {
        List<DMS_Distributor__c> pool = configurePool();
        pool[1].Active__c = false;
        update pool[1];
        insert new DMS_Distributor__c(Name = 'Not in pool', Active__c = true);
        insert employees(4);
        List<Employee__c> saved = [
            SELECT DMS_Distributor__c
            FROM Employee__c
            ORDER BY CreatedDate, Id
        ];
        for (Integer i = 0; i < 4; i++) {
            System.assertEquals(pool[Math.mod(i, 2) == 0 ? 0 : 2].Id, saved[i].DMS_Distributor__c);
        }
    }
    /**
     * Regression scenario: backfills and rolls back cursor. Arrange isolated test data, exercise
     * the workflow and assert the expected outcome.
     */
    @IsTest
    static void backfillsAndRollsBackCursor() {
        List<Employee__c> records = employees(4);
        insert records;
        configurePool();
        Set<Id> ids = new Map<Id, Employee__c>(records).keySet();
        Savepoint beforeAllocation = Database.setSavepoint();
        DmsEmployeeAllocator.allocate(ids);
        System.assertEquals(1, cursor());
        Database.rollback(beforeAllocation);
        System.assertEquals(0, cursor());
        System.assertEquals(0, [SELECT COUNT() FROM Employee__c WHERE DMS_Distributor__c != NULL]);
        DmsEmployeeAllocator.allocate(ids);
        System.assertEquals(4, [SELECT COUNT() FROM Employee__c WHERE DMS_Distributor__c != NULL]);
        DmsEmployeeAllocator.allocate(null);
        DmsEmployeeAllocator.allocate(new Set<Id>());
    }
    /**
     * Regression scenario: reports missing state and rejects duplicate slots. Arrange isolated
     * test data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void reportsMissingStateAndRejectsDuplicateSlots() {
        configurePool();
        Database.SaveResult duplicate = Database.insert(
            new DMS_Distributor__c(
                Name = 'Duplicate slot',
                Active__c = true,
                Employee_Allocation_Order__c = 1
            ),
            false
        );
        System.assertEquals(false, duplicate.isSuccess());
        delete [SELECT Id FROM DMS_Allocation_State__c];
        Database.SaveResult result = Database.insert(employees(1)[0], false);
        System.assertEquals(false, result.isSuccess());
        System.assert(result.getErrors()[0].getMessage().contains('not initialized'));
    }
}
