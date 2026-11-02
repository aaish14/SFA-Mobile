// Recover the missing invoice for Distributor 1's already approved PO-000001.
// Uses saved order prices and the same posting service as approval. It does not
// change approval, receive goods, move stock, or collect payment. Safe to rerun.
Id orderId = 'a0VjV000005F253UAC';
Id distributorId = 'a0TjV000001VqMjUAK';
Savepoint checkpoint = Database.setSavepoint();
try {
    List<DMS_Primary_Order__c> orders = [
        SELECT Id, Name, Status__c, Distributor__c, Total_Amount__c
        FROM DMS_Primary_Order__c
        WHERE Id = :orderId AND Distributor__c = :distributorId
        FOR UPDATE
    ];
    System.assertEquals(1, orders.size(), 'Expected the requested distributor order.');
    System.assertEquals('Approved', orders[0].Status__c, 'Only approved orders can be invoiced.');
    Integer beforeCount = [SELECT COUNT() FROM DMS_Invoice__c WHERE Primary_Order__c = :orderId];
    DmsInvoiceService.primary(orders, null);

    List<DMS_Invoice__c> invoices = [
        SELECT Id, Name, Status__c, Primary_Order__c, Distributor__c,
               Total_Amount__c, Discount_Amount__c, Tax_Amount__c
        FROM DMS_Invoice__c
        WHERE Primary_Order__c = :orderId
    ];
    System.assertEquals(1, invoices.size(), 'The order must have exactly one invoice.');
    DMS_Invoice__c invoice = invoices[0];
    System.assertEquals('Issued', invoice.Status__c, 'Recovery must issue the final invoice.');
    System.assertEquals(distributorId, invoice.Distributor__c);
    System.assertEquals(orders[0].Total_Amount__c, invoice.Total_Amount__c);
    Integer orderLineCount = [SELECT COUNT() FROM DMS_Primary_Order_Line__c WHERE Order__c = :orderId];
    Integer invoiceLineCount = [SELECT COUNT() FROM DMS_Invoice_Line__c WHERE Invoice__c = :invoice.Id];
    System.assert(orderLineCount > 0, 'The approved order must contain products.');
    System.assertEquals(orderLineCount, invoiceLineCount, 'Every ordered product must appear.');

    // A retry must preserve the same issued invoice, including its line count.
    DmsInvoiceService.primary(orders, null);
    System.assertEquals(1, [SELECT COUNT() FROM DMS_Invoice__c WHERE Primary_Order__c = :orderId]);
    System.assertEquals(invoiceLineCount, [SELECT COUNT() FROM DMS_Invoice_Line__c WHERE Invoice__c = :invoice.Id]);
    System.debug(LoggingLevel.WARN, 'INVOICE_RECOVERY ' + JSON.serialize(new Map<String, Object>{
        'order' => orders[0].Name, 'invoice' => invoice.Name, 'invoiceId' => invoice.Id,
        'status' => invoice.Status__c, 'total' => invoice.Total_Amount__c,
        'discount' => invoice.Discount_Amount__c, 'tax' => invoice.Tax_Amount__c,
        'productLines' => invoiceLineCount, 'created' => beforeCount == 0
    }));
} catch (Exception error) {
    Database.rollback(checkpoint);
    throw error;
}
