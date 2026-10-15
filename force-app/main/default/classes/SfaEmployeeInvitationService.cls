public with sharing class SfaEmployeeInvitationService {
    @TestVisible
    private static final String APPLICATION_URL = 'http://localhost:8081/';

    public static void emailApplicationLinks(
        List<Employee__c> employees,
        Map<Id, Employee__c> previousRecords
    ) {
        List<Messaging.SingleEmailMessage> messages = new List<Messaging.SingleEmailMessage>();

        for (Employee__c employee : employees) {
            if (String.isBlank(employee.Email__c)) {
                continue;
            }

            Employee__c previousRecord = previousRecords == null
                ? null
                : previousRecords.get(employee.Id);
            Boolean isNewEmployee = previousRecord == null;
            Boolean emailChanged = previousRecord != null
                && employee.Email__c != previousRecord.Email__c;

            if (!isNewEmployee && !emailChanged) {
                continue;
            }

            String recipient = employee.Email__c.trim().toLowerCase();
            Messaging.SingleEmailMessage message = new Messaging.SingleEmailMessage();
            message.setToAddresses(new List<String>{ recipient });
            message.setSubject('Your SFA Mobile application access');
            message.setPlainTextBody(buildPlainTextBody(employee.Name, recipient));
            message.setHtmlBody(buildHtmlBody(employee.Name, recipient));
            messages.add(message);
        }

        if (!messages.isEmpty()) {
            Messaging.sendEmail(messages, false);
        }
    }

    private static String buildPlainTextBody(String employeeName, String emailAddress) {
        return 'Hello ' + employeeName + ',\n\n'
            + 'Your SFA Mobile application access is ready.\n\n'
            + 'Open the application: ' + APPLICATION_URL + '\n\n'
            + 'Use this email address to sign in: ' + emailAddress + '\n\n'
            + 'A verification code will be sent to this inbox when you request it.';
    }

    private static String buildHtmlBody(String employeeName, String emailAddress) {
        return '<p>Hello ' + escapeHtml(employeeName) + ',</p>'
            + '<p>Your SFA Mobile application access is ready.</p>'
            + '<p><a href="' + APPLICATION_URL + '" style="display:inline-block;padding:12px 20px;background:#16877d;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold">Open SFA Mobile</a></p>'
            + '<p>Use <strong>' + escapeHtml(emailAddress) + '</strong> to sign in.</p>'
            + '<p>A verification code will be sent to this inbox when you request it.</p>';
    }

    private static String escapeHtml(String value) {
        if (value == null) {
            return '';
        }
        return value
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;')
            .replace('\'', '&#39;');
    }
}