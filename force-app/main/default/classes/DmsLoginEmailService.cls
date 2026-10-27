/**
 * Sends distributor sign-in challenges through Apex. The trusted backend keeps
 * only the challenge hash; the clear code exists here only for this transaction.
 * Email acceptance is not a guarantee of mailbox delivery.
 */
public with sharing class DmsLoginEmailService {
    private static final Integer RESEND_INTERVAL_SECONDS = 60;
    @TestVisible private static Map<Id, String> pendingCodes = new Map<Id, String>();
    @TestVisible private static EmailSender sender = new EmailSender();

    /** Platform email boundary. Tests replace only delivery, while exercising the real trigger. */
    public virtual class EmailSender {
        public virtual List<String> send(List<Messaging.SingleEmailMessage> messages) {
            List<String> failures = new List<String>();
            try {
                for (Messaging.SendEmailResult result : Messaging.sendEmail(messages, false)) {
                    failures.add(result.isSuccess() ? null : String.valueOf(result.getErrors()[0].getStatusCode()));
                }
            } catch (EmailException error) {
                throw new DmsPortalApi.InputException(deliveryError(error.getMessage()));
            }
            return failures;
        }
    }

    /** Return safe, actionable delivery errors without exposing email content or provider details. */
    @TestVisible private static String deliveryError(String providerCode) {
        if (providerCode != null && providerCode.contains('SINGLE_EMAIL_LIMIT_EXCEEDED')) {
            return 'Salesforce daily email limit has been reached. A new code cannot be sent until the limit resets.';
        }
        return 'Salesforce could not accept the sign-in email. Check email delivery settings and limits.';
    }

    /** Lock the active login, enforce the resend interval and invoke the distributor trigger. */
    public static Map<String, Object> requestCode(String email, String code) {
        if (!FeatureManagement.checkPermission('DMS_Trusted_Backend')) {
            throw new DmsPortalApi.InputException('Trusted backend access is required.');
        }
        if (String.isBlank(email) || email.length() > 254 ||
            String.isBlank(code) || !Pattern.matches('[0-9]{6}', code)) {
            throw new DmsPortalApi.InputException('A valid sign-in request is required.');
        }
        String normalizedEmail = email.trim().toLowerCase();
        List<DMS_Distributor__c> matches = [
            SELECT Id, Active__c, Login_Email__c, Login_Email_Requested_At__c
            FROM DMS_Distributor__c
            WHERE Active__c = TRUE AND Login_Email__c = :normalizedEmail
            LIMIT 2 FOR UPDATE
        ];
        if (matches.size() != 1) {
            throw new DmsPortalApi.InputException('The distributor login is not available.');
        }
        DMS_Distributor__c distributor = matches[0];
        Datetime requestedAt = System.now();
        if (distributor.Login_Email_Requested_At__c != null &&
            distributor.Login_Email_Requested_At__c > requestedAt.addSeconds(-RESEND_INTERVAL_SECONDS)) {
            throw new DmsPortalApi.InputException('Please wait before requesting another code.');
        }
        pendingCodes.put(distributor.Id, code);
        try {
            distributor.Login_Email_Requested_At__c = requestedAt;
            distributor.Login_Email_Accepted__c = false;
            update distributor;
        } finally {
            pendingCodes.remove(distributor.Id);
        }
        // Only acknowledge a request when the trigger actually accepted its email.
        // A disabled or changed trigger must not produce a false success in the portal.
        DMS_Distributor__c saved = [SELECT Login_Email_Accepted__c
            FROM DMS_Distributor__c WHERE Id = :distributor.Id];
        if (!saved.Login_Email_Accepted__c) {
            throw new DmsPortalApi.InputException('Salesforce did not accept the sign-in email.');
        }
        return new Map<String, Object>{ 'id' => distributor.Id, 'status' => 'Email accepted' };
    }

    /** Send all staged requests in one call; prevent edits from manufacturing a sign-in email. */
    public static void sendFromTrigger(List<DMS_Distributor__c> rows, Map<Id, DMS_Distributor__c> previous) {
        List<Messaging.SingleEmailMessage> messages = new List<Messaging.SingleEmailMessage>();
        List<DMS_Distributor__c> requested = new List<DMS_Distributor__c>();
        for (DMS_Distributor__c row : rows) {
            if (row.Login_Email_Requested_At__c == previous.get(row.Id).Login_Email_Requested_At__c) {
                continue;
            }
            String code = pendingCodes.get(row.Id);
            if (!FeatureManagement.checkPermission('DMS_Trusted_Backend') ||
                !row.Active__c || String.isBlank(row.Login_Email__c) || String.isBlank(code)) {
                row.addError('Request sign-in emails through the DMS sign-in page.');
                continue;
            }
            Messaging.SingleEmailMessage message = new Messaging.SingleEmailMessage();
            message.setToAddresses(new List<String>{ row.Login_Email__c });
            message.setSubject('Your DMS distributor sign-in code');
            message.setPlainTextBody('Your one-use DMS sign-in code is ' + code +
                '. It expires in 10 minutes. Ignore this message if you did not request it.');
            message.setSenderDisplayName('DMS Distributor Portal');
            message.setSaveAsActivity(false);
            message.setUseSignature(false);
            messages.add(message);
            requested.add(row);
        }
        if (messages.isEmpty()) {
            return;
        }
        List<String> failures = sender.send(messages);
        for (Integer index = 0; index < failures.size(); index++) {
            if (failures[index] == null) {
                requested[index].Login_Email_Accepted__c = true;
            } else {
                // Never persist or log the code, recipient or provider response body.
                requested[index].addError(deliveryError(failures[index]));
            }
        }
    }
}