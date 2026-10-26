@IsTest
private class BeatOutletSelectorControllerTest {
    @TestSetup
    static void createData() {
        Geography__c mgRoad = new Geography__c(
            Name = 'MG Road Geography',
            Nation__c = 'India',
            State__c = 'Karnataka',
            District__c = 'Bengaluru Urban'
        );
        Geography__c whitefield = new Geography__c(
            Name = 'Whitefield Geography',
            Nation__c = 'India',
            State__c = 'Karnataka',
            District__c = 'Bengaluru Urban'
        );
        insert new List<Geography__c>{ mgRoad, whitefield };

        Beat__c beat = new Beat__c(
            Name = 'MG Road Test Beat',
            Geography__c = mgRoad.Id,
            Active__c = false
        );
        insert beat;

        List<Retailer__c> outlets = new List<Retailer__c>();
        for (Integer index = 1; index <= 11; index++) {
            outlets.add(new Retailer__c(
                Name = 'MG Outlet ' + index,
                Geography__c = mgRoad.Id,
                Active__c = true
            ));
        }
        outlets.add(new Retailer__c(
            Name = 'Whitefield Outlet',
            Geography__c = whitefield.Id,
            Active__c = true
        ));
        insert outlets;
    }

    @IsTest
    static void filtersByGeographyAndMaintainsTheCount() {
        Beat__c beat = [SELECT Id FROM Beat__c WHERE Name = 'MG Road Test Beat'];
        List<Retailer__c> mgOutlets = [
            SELECT Id FROM Retailer__c
            WHERE Geography__r.Name = 'MG Road Geography'
            ORDER BY Name
            LIMIT 10
        ];
        List<Id> outletIds = new List<Id>();
        for (Retailer__c outlet : mgOutlets) outletIds.add(outlet.Id);

        Test.startTest();
        BeatOutletSelectorController.SelectorData data =
            BeatOutletSelectorController.getSelectorData(beat.Id);
        Integer savedCount = BeatOutletSelectorController.saveSelection(beat.Id, outletIds);
        Test.stopTest();

        System.assertEquals(11, data.options.size(), 'Only MG Road outlets should be available.');
        System.assertEquals(10, savedCount);
        Beat__c refreshedBeat = [SELECT Outlet_Count__c FROM Beat__c WHERE Id = :beat.Id];
        System.assertEquals(10, refreshedBeat.Outlet_Count__c);
    }

    @IsTest
    static void rejectsMoreThanTenOutlets() {
        Beat__c beat = [SELECT Id FROM Beat__c WHERE Name = 'MG Road Test Beat'];
        List<Id> outletIds = new List<Id>();
        for (Retailer__c outlet : [
            SELECT Id FROM Retailer__c
            WHERE Geography__r.Name = 'MG Road Geography'
        ]) outletIds.add(outlet.Id);

        Test.startTest();
        Boolean limitWasEnforced = false;
        try {
            BeatOutletSelectorController.saveSelection(beat.Id, outletIds);
        } catch (AuraHandledException expected) {
            limitWasEnforced = true;
        }
        Test.stopTest();
        System.assert(limitWasEnforced, 'Expected the maximum outlet validation.');
    }
}