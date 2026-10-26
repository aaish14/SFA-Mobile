@IsTest
private class DmsReportConfigurationTest {
    /**
     * Regression scenario: target scopes are unique and valid. Arrange isolated test data,
     * exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void targetScopesAreUniqueAndValid() {
        DMS_Distributor__c distributor = new DMS_Distributor__c(
            Name = 'Report fixture',
            Active__c = true,
            Officer__c = UserInfo.getUserId()
        );
        insert distributor;
        Date month = Date.today().toStartOfMonth();
        DMS_Sales_Target__c target = new DMS_Sales_Target__c(
            Distributor__c = distributor.Id,
            Month__c = month,
            Target_Amount__c = 10000
        );
        insert target;
        System.assertNotEquals(
            null,
            [SELECT Unique_Key__c FROM DMS_Sales_Target__c WHERE Id = :target.Id].Unique_Key__c
        );
        System.assertEquals(
            false,
            Database.insert(
                    new DMS_Sales_Target__c(
                        Distributor__c = distributor.Id,
                        Month__c = month,
                        Target_Amount__c = 20000
                    ),
                    false
                )
                .isSuccess()
        );
        target.Month__c = month.addDays(1);
        System.assertEquals(false, Database.update(target, false).isSuccess());
        target.Month__c = month;
        target.Target_Amount__c = 0;
        System.assertEquals(false, Database.update(target, false).isSuccess());
        target.Target_Amount__c = 5000;
        update target;
        System.assertEquals(1, [SELECT COUNT() FROM DMS_Sales_Target__c]);
    }
    /**
     * Regression scenario: ticket lifecycle and ownership. Arrange isolated test data, exercise
     * the workflow and assert the expected outcome.
     */
    @IsTest
    static void ticketLifecycleAndOwnership() {
        DMS_Distributor__c distributor = new DMS_Distributor__c(
            Name = 'Support fixture',
            Active__c = true,
            Officer__c = UserInfo.getUserId()
        );
        insert distributor;
        DMS_Support_Ticket__c ticket = new DMS_Support_Ticket__c(
            Distributor__c = distributor.Id,
            Subject__c = 'Missing shipment',
            Category__c = 'Delivery',
            Description__c = 'One box missing'
        );
        insert ticket;
        ticket = [
            SELECT Id, Status__c, Officer__c
            FROM DMS_Support_Ticket__c
            WHERE Id = :ticket.Id
        ];
        System.assertEquals('Open', ticket.Status__c);
        System.assertEquals(UserInfo.getUserId(), ticket.Officer__c);
        ticket.Status__c = 'Closed';
        ticket.Resolution__c = 'Done';
        System.assertEquals(false, Database.update(ticket, false).isSuccess());
        ticket.Status__c = 'In Progress';
        update ticket;
        ticket.Status__c = 'Closed';
        ticket.Resolution__c = null;
        System.assertEquals(false, Database.update(ticket, false).isSuccess());
        ticket.Resolution__c = 'Replacement confirmed';
        update ticket;
        ticket.Status__c = 'Open';
        System.assertEquals(false, Database.update(ticket, false).isSuccess());
        ticket = new DMS_Support_Ticket__c(
            Distributor__c = distributor.Id,
            Subject__c = 'Product issue',
            Category__c = 'Product',
            Description__c = 'Check batch'
        );
        insert ticket;
        ticket.Status__c = 'Rejected';
        ticket.Resolution__c = 'Outside support scope';
        update ticket;
    }
}
