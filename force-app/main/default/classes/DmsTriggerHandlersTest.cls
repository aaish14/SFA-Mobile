@IsTest
private class DmsTriggerHandlersTest {
    /**
     * Regression scenario: target keys preserve null scopes in bulk. Arrange isolated test data,
     * exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void targetKeysPreserveNullScopesInBulk() {
        List<DMS_Sales_Target__c> targets = new List<DMS_Sales_Target__c>();
        for (Integer index = 0; index < 200; index++) {
            targets.add(new DMS_Sales_Target__c(Month__c = Date.newInstance(2026, 10, 1)));
        }
        Test.startTest();
        DmsSalesTargetHandler.populateScopeKeys(targets);
        Test.stopTest();
        for (DMS_Sales_Target__c target : targets) {
            System.assertEquals(
                'null:2026-10-01:null:null:null',
                target.Unique_Key__c,
                'Preserve the stored key format, including absent scope values.'
            );
        }
    }

    /**
     * Regression scenario: surveys validate each row with one query. Arrange isolated test data,
     * exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void surveysValidateEachRowWithOneQuery() {
        DMS_Distributor__c assigned = new DMS_Distributor__c(
            Name = 'Survey assigned fixture',
            Active__c = true,
            Officer__c = UserInfo.getUserId()
        );
        DMS_Distributor__c inactive = new DMS_Distributor__c(
            Name = 'Survey inactive fixture',
            Active__c = false,
            Officer__c = UserInfo.getUserId()
        );
        DMS_Distributor__c unassigned = new DMS_Distributor__c(
            Name = 'Survey unassigned fixture',
            Active__c = true
        );
        insert new List<DMS_Distributor__c>{ assigned, inactive, unassigned };
        List<DMS_Distributor_Survey__c> surveys = new List<DMS_Distributor_Survey__c>();
        for (Integer index = 0; index < 200; index++) {
            surveys.add(new DMS_Distributor_Survey__c(Distributor__c = assigned.Id));
        }
        surveys[197].Distributor__c = inactive.Id;
        surveys[198].Distributor__c = unassigned.Id;
        surveys[199].Distributor__c = null;
        Test.startTest();
        Integer queriesBefore = Limits.getQueries();
        DmsDistributorSurveyHandler.validateOfficer(surveys, null);
        System.assertEquals(1, Limits.getQueries() - queriesBefore, 'Query once for the batch.');
        Test.stopTest();
        for (Integer index = 0; index < surveys.size(); index++) {
            System.assertEquals(
                index >= 197,
                surveys[index].hasErrors(),
                'Validate every distributor.'
            );
            System.assertEquals(
                UserInfo.getUserId(),
                surveys[index].Officer__c,
                'Stamp the author.'
            );
        }
    }

    /**
     * Regression scenario: editing survey preserves original officer. Arrange isolated test
     * data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void editingSurveyPreservesOriginalOfficer() {
        DMS_Distributor__c distributor = new DMS_Distributor__c(
            Name = 'Survey edit fixture',
            Active__c = true,
            Officer__c = UserInfo.getUserId()
        );
        insert distributor;
        // Exercise the update branch without creating a real survey or sending mail.
        Id surveyId = (Id) (DMS_Distributor_Survey__c.SObjectType.getDescribe().getKeyPrefix() +
        '000000000001');
        DMS_Distributor_Survey__c previous = new DMS_Distributor_Survey__c(
            Id = surveyId,
            Distributor__c = distributor.Id,
            Officer__c = null
        );
        DMS_Distributor_Survey__c edited = new DMS_Distributor_Survey__c(
            Id = surveyId,
            Distributor__c = distributor.Id,
            Officer__c = UserInfo.getUserId()
        );
        Test.startTest();
        DmsDistributorSurveyHandler.validateOfficer(
            new List<DMS_Distributor_Survey__c>{ edited },
            new Map<Id, DMS_Distributor_Survey__c>{ surveyId => previous }
        );
        Test.stopTest();
        System.assertEquals(false, edited.hasErrors(), 'The assigned officer may edit.');
        System.assertEquals(null, edited.Officer__c, 'Preserve the historical author value.');
    }
}
