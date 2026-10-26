/**
 * Before saving distributor surveys, delegate officer validation with the prior record map when
 * available.
 */
trigger DmsDistributorSurvey on DMS_Distributor_Survey__c(before insert, before update) {
    DmsDistributorSurveyHandler.validateOfficer(
        Trigger.new,
        Trigger.isInsert ? null : Trigger.oldMap
    );
}
