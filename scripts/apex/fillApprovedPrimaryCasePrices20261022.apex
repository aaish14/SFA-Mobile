// One-time user-approved backfill: Retailer Base Price x Pieces Per Case.
// Scope is the 24 reviewed products. Existing case prices are never overwritten.
Set<Id> approvedProducts = new Set<Id>{
    'a04jV000000WyndQAC','a04jV000000WynYQAS','a04jV000000WynSQAS',
    'a04jV000000b8TFQAY','a04jV000000WyniQAC','a04jV000000WynjQAC',
    'a04jV000000WynhQAC','a04jV000000WyneQAC','a04jV000000WynZQAS',
    'a04jV000000WynVQAS','a04jV000000WynWQAS','a04jV000000WynXQAS',
    'a04jV000000WynaQAC','a04jV000000WynUQAS','a04jV000000VjbxQAC',
    'a04jV000000WynRQAS','a04jV000000WynkQAC','a04jV000000WynTQAS',
    'a04jV000000XkNRQA0','a04jV000000WynfQAC','a04jV000000WyncQAC',
    'a04jV000000YYFNQA4','a04jV000000WyngQAC','a04jV000000WynbQAC'
};
List<Product__c> products = [SELECT Id, Name, Active__c, Sellable__c,
    Units_Per_Case__c, Retailer_Base_Price__c, DMS_Case_Price__c
    FROM Product__c WHERE Id IN :approvedProducts FOR UPDATE];
System.assertEquals(24, products.size(), 'Stop if the reviewed product set changed.');
List<Product__c> updates = new List<Product__c>();
Map<Id, Decimal> expectedPrices = new Map<Id, Decimal>();
for (Product__c product : products) {
    if (product.DMS_Case_Price__c != null) continue;
    System.assert(product.Active__c && product.Sellable__c, 'Product must remain active and sellable.');
    System.assert(product.Retailer_Base_Price__c > 0 && product.Units_Per_Case__c > 0
        && product.Units_Per_Case__c == product.Units_Per_Case__c.setScale(0),
        'Valid positive base price and whole pieces per case are required.');
    Decimal price = (product.Retailer_Base_Price__c * product.Units_Per_Case__c)
        .setScale(2, System.RoundingMode.HALF_UP);
    expectedPrices.put(product.Id, price);
    updates.add(new Product__c(Id=product.Id, DMS_Case_Price__c=price));
}
update updates;
for (Product__c product : [SELECT Id, DMS_Case_Price__c FROM Product__c WHERE Id IN :expectedPrices.keySet()]) {
    System.assertEquals(expectedPrices.get(product.Id), product.DMS_Case_Price__c,
        'Roll back if automation changed the approved price.');
}
System.debug(LoggingLevel.ERROR, 'PRIMARY_CASE_PRICE_BACKFILL updated=' + updates.size()
    + ', preserved=' + (products.size()-updates.size()));
