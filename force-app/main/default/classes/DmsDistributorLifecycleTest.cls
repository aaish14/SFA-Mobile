@IsTest
private class DmsDistributorLifecycleTest {
    /**
     * Regression scenario: discontinues and requires explicit reactivation. Arrange isolated
     * test data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void discontinuesAndRequiresExplicitReactivation() {
        DMS_Distributor__c row = new DMS_Distributor__c(Name = 'Lifecycle test', Active__c = true);
        insert row;
        System.assertEquals(
            'Active',
            [SELECT Distributor_Status__c FROM DMS_Distributor__c WHERE Id = :row.Id]
            .Distributor_Status__c
        );
        row.Discontinued__c = true;
        update row;
        row = [
            SELECT Name, Active__c, Discontinued__c, Distributor_Status__c
            FROM DMS_Distributor__c
            WHERE Id = :row.Id
        ];
        System.assertEquals(false, row.Active__c);
        System.assertEquals('Distributor is discontinued', row.Distributor_Status__c);
        System.assertEquals('Lifecycle test', row.Name);
        row.Active__c = true;
        update row;
        System.assertEquals(
            false,
            [SELECT Active__c FROM DMS_Distributor__c WHERE Id = :row.Id].Active__c
        );
        row.Active__c = false;
        row.Discontinued__c = false;
        update row;
        System.assertEquals(
            'Inactive',
            [SELECT Distributor_Status__c FROM DMS_Distributor__c WHERE Id = :row.Id]
            .Distributor_Status__c
        );
        row.Active__c = true;
        update row;
        System.assertEquals(
            'Active',
            [SELECT Distributor_Status__c FROM DMS_Distributor__c WHERE Id = :row.Id]
            .Distributor_Status__c
        );
    }
    /**
     * Regression scenario: bulk insert and update preserve other distributors. Arrange isolated
     * test data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void bulkInsertAndUpdatePreserveOtherDistributors() {
        List<DMS_Distributor__c> records = new List<DMS_Distributor__c>();
        for (Integer i = 0; i < 200; i++)
            records.add(
                new DMS_Distributor__c(
                    Name = 'Lifecycle ' + i,
                    Active__c = true,
                    Discontinued__c = Math.mod(i, 2) == 0
                )
            );
        Test.startTest();
        insert records;
        Set<Id> ids = new Map<Id, DMS_Distributor__c>(records).keySet();
        for (DMS_Distributor__c row : [
            SELECT Active__c, Discontinued__c, Distributor_Status__c
            FROM DMS_Distributor__c
            WHERE Id IN :ids
        ]) {
            System.assertEquals(!row.Discontinued__c, row.Active__c);
            System.assertEquals(
                row.Discontinued__c ? 'Distributor is discontinued' : 'Active',
                row.Distributor_Status__c
            );
        }
        for (DMS_Distributor__c row : records)
            row.Discontinued__c = true;
        update records;
        System.assertEquals(
            0,
            [SELECT COUNT() FROM DMS_Distributor__c WHERE Id IN :ids AND Active__c = TRUE]
        );
        Test.stopTest();
    }
}
