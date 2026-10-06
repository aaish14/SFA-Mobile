public with sharing class BeatOutletSelectorController {
    public class OutletOption {
        @AuraEnabled public Id value { get; set; }
        @AuraEnabled public String label { get; set; }

        public OutletOption(Retailer__c outlet) {
            value = outlet.Id;
            label = outlet.Name;
        }
    }

    public class SelectorData {
        @AuraEnabled public String beatName { get; set; }
        @AuraEnabled public String geographyName { get; set; }
        @AuraEnabled public List<OutletOption> options { get; set; }
        @AuraEnabled public List<Id> selectedOutletIds { get; set; }
    }

    @AuraEnabled(cacheable=true)
    public static SelectorData getSelectorData(Id beatId) {
        if (beatId == null) {
            throw new AuraHandledException('A Beat record is required.');
        }

        Beat__c beat = [
            SELECT Name, Geography__c, Geography__r.Name
            FROM Beat__c
            WHERE Id = :beatId
            LIMIT 1
        ];
        if (beat.Geography__c == null) {
            throw new AuraHandledException('Select a geography on the Beat before choosing outlets.');
        }

        List<Retailer__c> availableOutlets = [
            SELECT Id, Name, Beat__c
            FROM Retailer__c
            WHERE Geography__c = :beat.Geography__c
              AND Active__c = true
            ORDER BY Name
        ];

        SelectorData result = new SelectorData();
        result.beatName = beat.Name;
        result.geographyName = beat.Geography__r.Name;
        result.options = new List<OutletOption>();
        result.selectedOutletIds = new List<Id>();

        for (Retailer__c outlet : availableOutlets) {
            result.options.add(new OutletOption(outlet));
            if (outlet.Beat__c == beatId) {
                result.selectedOutletIds.add(outlet.Id);
            }
        }
        return result;
    }

    @AuraEnabled
    public static Integer saveSelection(Id beatId, List<Id> selectedOutletIds) {
        if (beatId == null) {
            throw new AuraHandledException('A Beat record is required.');
        }

        Set<Id> selectedIds = selectedOutletIds == null
            ? new Set<Id>()
            : new Set<Id>(selectedOutletIds);
        if (selectedIds.size() > 10) {
            throw new AuraHandledException('A Beat can contain a maximum of 10 outlets.');
        }

        Beat__c beat = [
            SELECT Geography__c
            FROM Beat__c
            WHERE Id = :beatId
            LIMIT 1
        ];
        if (beat.Geography__c == null) {
            throw new AuraHandledException('Select a geography on the Beat before choosing outlets.');
        }

        Map<Id, Retailer__c> selectedOutlets = new Map<Id, Retailer__c>();
        if (!selectedIds.isEmpty()) {
            selectedOutlets = new Map<Id, Retailer__c>([
                SELECT Id, Geography__c, Active__c, Beat__c
                FROM Retailer__c
                WHERE Id IN :selectedIds
            ]);
            if (selectedOutlets.size() != selectedIds.size()) {
                throw new AuraHandledException('One or more selected outlets could not be found.');
            }
            for (Retailer__c outlet : selectedOutlets.values()) {
                if (!outlet.Active__c || outlet.Geography__c != beat.Geography__c) {
                    throw new AuraHandledException('Only active outlets from the Beat geography can be selected.');
                }
            }
        }

        Map<Id, Retailer__c> recordsToUpdate = new Map<Id, Retailer__c>();
        for (Retailer__c currentOutlet : [
            SELECT Id, Beat__c
            FROM Retailer__c
            WHERE Beat__c = :beatId
        ]) {
            if (!selectedIds.contains(currentOutlet.Id)) {
                currentOutlet.Beat__c = null;
                recordsToUpdate.put(currentOutlet.Id, currentOutlet);
            }
        }

        for (Retailer__c selectedOutlet : selectedOutlets.values()) {
            if (selectedOutlet.Beat__c != beatId) {
                selectedOutlet.Beat__c = beatId;
                recordsToUpdate.put(selectedOutlet.Id, selectedOutlet);
            }
        }

        if (!recordsToUpdate.isEmpty()) {
            update recordsToUpdate.values();
        }
        return selectedIds.size();
    }
}
