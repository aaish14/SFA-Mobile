public with sharing class SfaSalesRepresentativeInvitationService {
    private static final String INSTALL_URL =
        'https://expo.dev/accounts/aishwarya1412/projects/sfa-field-sales/builds/bcb92138-58f9-4b72-b409-5c3468069a23';
    private static final String OPEN_APP_URL = 'sfafieldsales://login';

    public static void synchronizeLoginEmail(List<Distributor__c> representatives) {
        for (Distributor__c representative : representatives) {
            if (String.isNotBlank(representative.Email__c)) {
                representative.Login_Email__c = representative.Email__c.trim().toLowerCase();
            }
        }
    }

    public static void emailApplicationLinks(
        List<Distributor__c> representatives,
        Map<Id, Distributor__c> previousRecords
    ) {
        List<Messaging.SingleEmailMessage> messages = new List<Messaging.SingleEmailMessage>();

        for (Distributor__c representative : representatives) {
            if (String.isBlank(representative.Email__c)) {
                continue;
            }

            Distributor__c previousRecord = previousRecords == null
                ? null
                : previousRecords.get(representative.Id);
            Boolean isNewRecord = previousRecord == null;
            Boolean emailChanged = previousRecord != null
                && representative.Email__c != previousRecord.Email__c;
            Boolean loginEmailChanged = previousRecord != null
                && representative.Login_Email__c != previousRecord.Login_Email__c;

            if (!isNewRecord && !emailChanged && !loginEmailChanged) {
                continue;
            }

            Messaging.SingleEmailMessage message = new Messaging.SingleEmailMessage();
            message.setToAddresses(new List<String>{ representative.Email__c });
            message.setSubject('Your SFA Mobile application');
            message.setPlainTextBody(buildPlainTextBody(representative.Name));
            message.setHtmlBody(buildHtmlBody(representative.Name));
            messages.add(message);
        }

        if (!messages.isEmpty()) {
            Messaging.sendEmail(messages, false);
        }
    }

    private static String buildPlainTextBody(String representativeName) {
        return 'Hello ' + representativeName + ',\n\n'
            + 'Your SFA Mobile application is ready.\n\n'
            + 'Install or update the application: ' + INSTALL_URL + '\n\n'
            + 'After installation, open the application: ' + OPEN_APP_URL + '\n\n'
            + 'Use the email address on your Sales Representative record to sign in.';
    }

    private static String buildHtmlBody(String representativeName) {
        return '<p>Hello ' + String.escapeSingleQuotes(representativeName) + ',</p>'
            + '<p>Your SFA Mobile application is ready.</p>'
            + '<p><a href="' + INSTALL_URL + '">Install or update SFA Mobile</a></p>'
            + '<p><a href="' + OPEN_APP_URL + '">Open SFA Mobile</a></p>'
            + '<p>Use the email address on your Sales Representative record to sign in.</p>';
    }
}