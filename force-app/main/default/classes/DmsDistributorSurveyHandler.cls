/**
 * Validates company-officer ownership of surveys in one bulk query.
 * System context preserves the original trigger's visibility. Authorization is
 * checked explicitly against the distributor's assigned officer for every row.
 */
public without sharing class DmsDistributorSurveyHandler {
    /**
     * Validate survey ownership against the distributors in one bulk query; retain the original
     * officer when an existing survey is edited.
     */
    public static void validateOfficer(
        List<DMS_Distributor_Survey__c> surveys,
        Map<Id, DMS_Distributor_Survey__c> previousSurveys
    ) {
        Set<Id> distributorIds = new Set<Id>();
        for (DMS_Distributor_Survey__c survey : surveys) {
            distributorIds.add(survey.Distributor__c);
        }
        Map<Id, DMS_Distributor__c> distributorsById = new Map<Id, DMS_Distributor__c>(
            [SELECT Id, Officer__c, Active__c FROM DMS_Distributor__c WHERE Id IN :distributorIds]
        );
        Id currentOfficerId = UserInfo.getUserId();
        for (DMS_Distributor_Survey__c survey : surveys) {
            DMS_Distributor__c distributor = distributorsById.get(survey.Distributor__c);
            if (
                distributor == null ||
                !distributor.Active__c ||
                distributor.Officer__c != currentOfficerId
            ) {
                survey.addError(
                    'Only the assigned company Distributor Officer can record or edit this distributor survey.'
                );
            }
            // Keep the original author when an existing survey is edited.
            survey.Officer__c = previousSurveys == null
                ? currentOfficerId
                : previousSurveys.get(survey.Id).Officer__c;
        }
    }
}
