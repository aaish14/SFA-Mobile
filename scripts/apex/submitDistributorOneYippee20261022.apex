// User-approved order: Distributor 1, one case of Yippee Magic Masala.
// Reusing this request key prevents duplicate orders on retry.
Savepoint checkpoint = Database.setSavepoint();
try {
    DMS_Distributor__c distributor = [SELECT Id, Officer__c FROM DMS_Distributor__c
        WHERE Id = 'a0TjV000001VqMjUAK' AND Active__c = true];
    System.assertEquals('005jV000002aNRZQA2', String.valueOf(distributor.Officer__c),
        'The assigned approver must still be Dhanush.');
    Product__c product = [SELECT DMS_Case_Price__c, Units_Per_Case__c, GST_Percent__c
        FROM Product__c WHERE Id = 'a04jV000000WynbQAC'];
    System.assertEquals(918, product.DMS_Case_Price__c, 'Approved case price changed.');
    System.assertEquals(72, product.Units_Per_Case__c, 'Approved case size changed.');
    System.assertEquals(5, product.GST_Percent__c, 'Expected GST changed.');
    RestContext.request = new RestRequest();
    RestContext.request.requestUri = '/services/apexrest/dms/portal/';
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf('{"action":"distributorPrimaryOrder","distributorId":"a0TjV000001VqMjUAK","requestKey":"d1-yippee-1case-20261022-approved","lines":[{"productId":"a04jV000000WynbQAC","cases":1}]}');
    RestContext.response = new RestResponse();
    // Retains the trusted-backend permission gate, validation, replay handling
    // and normal Salesforce approval submission. Does not approve or receive goods.
    DmsPortalApi.execute();
    String result = RestContext.response.responseBody.toString();
    Map<String, Object> outcome = (Map<String, Object>) JSON.deserializeUntyped(result);
    System.assert(!outcome.containsKey('error'), result);
    System.assert(outcome.containsKey('id'), 'No saved order was returned.');
    System.debug(LoggingLevel.ERROR, 'APPROVED_ORDER_RESULT ' + result);
} catch (Exception error) {
    Database.rollback(checkpoint);
    throw error;
}
