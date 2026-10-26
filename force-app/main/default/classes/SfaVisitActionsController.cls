public with sharing class SfaVisitActionsController {
    /**
     * Saves one focused in-visit activity. Keeping this method explicit makes the
     * mobile-to-Salesforce mapping easy for a trainee to read and maintain.
     */
    @AuraEnabled
    public static Id saveVisitAction(String actionType, Id visitId, String payloadJson) {
        if (visitId == null) throw new AuraHandledException('Select a checked-in visit first.');

        Visit__c visit = [
            SELECT Id, Retailer__c, Status__c
            FROM Visit__c WHERE Id = :visitId LIMIT 1
        ];
        if (visit.Status__c != 'Checked In') {
            throw new AuraHandledException('Visit actions are available only after check-in.');
        }

        Map<String, Object> data = (Map<String, Object>) JSON.deserializeUntyped(payloadJson);
        if (actionType == 'asset') {
            Asset_Survey__c record = new Asset_Survey__c(
                Visit__c = visit.Id, Outlet__c = visit.Retailer__c,
                Asset_Name__c = text(data, 'assetName'), Asset_Code__c = text(data, 'assetCode'),
                Status__c = text(data, 'status'), Picture_URL__c = text(data, 'imageUrl'),
                Given_Date__c = dateValue(data, 'dateValue')
            );
            insert record;
            return record.Id;
        }
        if (actionType == 'competitor') {
            Competitor_Activity__c record = new Competitor_Activity__c(
                Visit__c = visit.Id, Outlet__c = visit.Retailer__c,
                Competitor_Name__c = text(data, 'competitorName'), Company__c = text(data, 'company'),
                MRP__c = numberValue(data, 'mrp'), RBP__c = numberValue(data, 'rbp'),
                Scheme_Details__c = text(data, 'schemeDetails'), Image_URL__c = text(data, 'imageUrl')
            );
            insert record;
            return record.Id;
        }
        if (actionType == 'stock') {
            Stock_Check__c record = new Stock_Check__c(
                Visit__c = visit.Id, Outlet__c = visit.Retailer__c,
                Product__c = idValue(data, 'productId'), Quantity__c = numberValue(data, 'quantity'),
                Manufacturing_Date__c = dateValue(data, 'dateValue')
            );
            insert record;
            return record.Id;
        }
        if (actionType == 'ticket') {
            SFA_Ticket__c record = new SFA_Ticket__c(
                Visit__c = visit.Id, Outlet__c = visit.Retailer__c,
                Subject__c = text(data, 'subject'), Description__c = text(data, 'description'),
                Image_URL__c = text(data, 'imageUrl'), Status__c = 'Open'
            );
            insert record;
            return record.Id;
        }
        if (actionType == 'return') {
            Product_Return__c record = new Product_Return__c(
                Visit__c = visit.Id, Outlet__c = visit.Retailer__c,
                Product__c = idValue(data, 'productId'), Quantity__c = numberValue(data, 'quantity'),
                Manufacturing_Date__c = dateValue(data, 'dateValue'), Return_Reason__c = text(data, 'returnReason')
            );
            insert record;
            return record.Id;
        }
        throw new AuraHandledException('Unsupported visit action.');
    }

    @AuraEnabled
    public static Id submitLeave(String payloadJson) {
        Map<String, Object> data = (Map<String, Object>) JSON.deserializeUntyped(payloadJson);
        List<Employee__c> employees = [
            SELECT Id, Reporting_Manager__c FROM Employee__c
            WHERE Salesforce_User__c = :UserInfo.getUserId() AND Active__c = true LIMIT 1
        ];
        if (employees.isEmpty()) throw new AuraHandledException('Your Salesforce user is not linked to an active employee.');
        Employee__c employee = employees[0];
        Leave_Request__c request = new Leave_Request__c(
            Employee__c = employee.Id, Approver__c = employee.Reporting_Manager__c,
            Leave_Date__c = dateValue(data, 'dateValue'), Leave_Type__c = text(data, 'leaveType'),
            Reason__c = text(data, 'description'), Status__c = 'Pending'
        );
        insert request;
        return request.Id;
    }

    private static String text(Map<String, Object> data, String key) {
        Object value = data.get(key);
        return value == null ? null : String.valueOf(value).trim();
    }
    private static Id idValue(Map<String, Object> data, String key) {
        String value = text(data, key);
        return String.isBlank(value) ? null : (Id) value;
    }
    private static Decimal numberValue(Map<String, Object> data, String key) {
        String value = text(data, key);
        return String.isBlank(value) ? null : Decimal.valueOf(value);
    }
    private static Date dateValue(Map<String, Object> data, String key) {
        String value = text(data, key);
        return String.isBlank(value) ? null : Date.valueOf(value);
    }
}