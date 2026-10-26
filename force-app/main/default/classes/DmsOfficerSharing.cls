/**
 * Gives only the designated company officer read access to primary records.
 * Custom sharing reasons preserve other manual shares and survive owner changes.
 */
public without sharing class DmsOfficerSharing {
    /**
     * Maintain Officer_Access shares for the configured company officer: remove obsolete shares
     * and create missing read access for supported DMS objects.
     */
    public static void synchronize(String objectName, Set<Id> recordIds) {
        if (recordIds == null || recordIds.isEmpty())
            return;
        if (
            !new Set<String>{
                    'DMS_Primary_Order__c',
                    'DMS_Primary_Order_Line__c',
                    'DMS_Primary_Return__c'
                }
                .contains(objectName)
        )
            throw new SharingConfigurationException('Unsupported DMS sharing object.');
        String officerPath = objectName == 'DMS_Primary_Order_Line__c'
            ? 'Order__r.Officer__c'
            : 'Officer__c';
        Map<Id, Id> desired = new Map<Id, Id>();
        for (
            SObject record : Database.query(
                'SELECT Id,OwnerId,' +
                    officerPath +
                    ' FROM ' +
                    objectName +
                    ' WHERE Id IN :recordIds'
            )
        ) {
            SObject parent = objectName == 'DMS_Primary_Order_Line__c'
                ? record.getSObject('Order__r')
                : record;
            Id officer = parent == null ? null : (Id) parent.get('Officer__c');
            if (officer != null && officer != record.get('OwnerId'))
                desired.put(record.Id, officer);
        }
        String shareName = objectName.substringBeforeLast('__c') + '__Share';
        List<SObject> obsolete = new List<SObject>();
        for (
            SObject share : Database.query(
                'SELECT Id,ParentId,UserOrGroupId FROM ' +
                    shareName +
                    ' WHERE ParentId IN :recordIds AND RowCause = \'Officer_Access__c\''
            )
        ) {
            Id parentId = (Id) share.get('ParentId');
            if (desired.get(parentId) == share.get('UserOrGroupId'))
                desired.remove(parentId);
            else
                obsolete.add(share);
        }
        if (!obsolete.isEmpty())
            delete obsolete;
        List<SObject> additions = new List<SObject>();
        Schema.SObjectType shareType = Schema.getGlobalDescribe().get(shareName);
        for (Id parentId : desired.keySet()) {
            SObject share = shareType.newSObject();
            share.put('ParentId', parentId);
            share.put('UserOrGroupId', desired.get(parentId));
            share.put('AccessLevel', 'Read');
            share.put('RowCause', 'Officer_Access__c');
            additions.add(share);
        }
        if (!additions.isEmpty())
            insert additions;
        // Order approver changes must also update existing private order lines.
        if (objectName == 'DMS_Primary_Order__c') {
            Set<Id> lineIds = new Map<Id, DMS_Primary_Order_Line__c>(
                    [SELECT Id FROM DMS_Primary_Order_Line__c WHERE Order__c IN :recordIds]
                )
                .keySet();
            synchronize('DMS_Primary_Order_Line__c', lineIds);
        }
    }
    public class SharingConfigurationException extends Exception {
    }
}
