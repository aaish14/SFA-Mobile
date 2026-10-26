// Schema-only smoke test. Every temporary record is rolled back, even if an assertion fails.
Savepoint checkpoint = Database.setSavepoint();
try {
    Product__c product = [SELECT Id FROM Product__c LIMIT 1];
    Employee__c employee = [SELECT Id FROM Employee__c WHERE Active__c = true LIMIT 1];
    DMS_Distributor__c distributor = new DMS_Distributor__c(Name='DMS schema verification - temporary', Active__c=false);
    insert distributor;
    DMS_Primary_Order__c primary = new DMS_Primary_Order__c(Distributor__c=distributor.Id, Employee__c=employee.Id, Status__c='Draft', Order_Date__c=Date.today());
    insert primary;
    DMS_Primary_Order_Line__c primaryLine = new DMS_Primary_Order_Line__c(Order__c=primary.Id, Product__c=product.Id, Cases__c=2, Free_Cases__c=1, Pieces_Per_Case__c=20, Case_Price__c=100, Discount_Amount__c=10, Tax_Percent__c=5);
    insert primaryLine;
    primaryLine = [SELECT Total_Pieces__c, Net_Amount__c FROM DMS_Primary_Order_Line__c WHERE Id=:primaryLine.Id];
    System.assertEquals(60, primaryLine.Total_Pieces__c, 'Case conversion');
    System.assertEquals(199.50, primaryLine.Net_Amount__c, 'Primary discount and tax');

    DMS_Goods_Receipt__c receipt = new DMS_Goods_Receipt__c(Distributor__c=distributor.Id, Primary_Order__c=primary.Id, Received_Date__c=Date.today(), Status__c='Draft');
    insert receipt;
    DMS_Goods_Receipt_Line__c receiptLine = new DMS_Goods_Receipt_Line__c(Goods_Receipt__c=receipt.Id, Product__c=product.Id, Batch_Number__c='SCHEMA-TEST', Received_Cases__c=2, Free_Cases__c=1, Pieces_Per_Case__c=20, Case_Cost__c=100);
    insert receiptLine;
    receipt = [SELECT Total_Pieces__c, Total_Value__c FROM DMS_Goods_Receipt__c WHERE Id=:receipt.Id];
    System.assertEquals(60, receipt.Total_Pieces__c, 'Receipt quantity rollup');
    System.assertEquals(200, receipt.Total_Value__c, 'Receipt value rollup');

    DMS_Inventory__c stock = new DMS_Inventory__c(Distributor__c=distributor.Id, Product__c=product.Id, Batch_Number__c='SCHEMA-TEST', On_Hand_Pieces__c=60, Reserved_Pieces__c=10, Reorder_Level_Pieces__c=5);
    insert stock;
    stock = [SELECT Available_Pieces__c, Low_Stock__c, Reserved_Pieces__c FROM DMS_Inventory__c WHERE Id=:stock.Id];
    System.assertEquals(50, stock.Available_Pieces__c, 'Available inventory');
    System.assertEquals(false, stock.Low_Stock__c, 'Low stock flag');
    stock.Reserved_Pieces__c=61;
    Database.SaveResult invalidStock=Database.update(stock,false);
    System.assertEquals(false, invalidStock.isSuccess(), 'Reject over-reservation');

    DMS_Primary_Return__c primaryReturn = new DMS_Primary_Return__c(Distributor__c=distributor.Id, Employee__c=employee.Id, Primary_Order__c=primary.Id, Return_Date__c=Date.today(), Status__c='Draft');
    insert primaryReturn;
    insert new DMS_Primary_Return_Line__c(Primary_Return__c=primaryReturn.Id, Product__c=product.Id, Cases__c=1, Pieces_Per_Case__c=20, Case_Value__c=100, Reason__c='Damaged');
    primaryReturn=[SELECT Total_Cases__c, Total_Amount__c FROM DMS_Primary_Return__c WHERE Id=:primaryReturn.Id];
    System.assertEquals(1, primaryReturn.Total_Cases__c, 'Return cases rollup');
    System.assertEquals(100, primaryReturn.Total_Amount__c, 'Return amount rollup');

    DMS_Credit_Note__c credit=new DMS_Credit_Note__c(Distributor__c=distributor.Id, Sales_Channel__c='Primary', Primary_Return__c=primaryReturn.Id, Credit_Date__c=Date.today(), Reason__c='Return', Status__c='Draft');
    insert credit;
    insert new DMS_Credit_Note_Line__c(Credit_Note__c=credit.Id, Product__c=product.Id, Quantity__c=1, Quantity_Unit__c='Case', Unit_Credit__c=100, Tax_Percent__c=5);
    credit=[SELECT Total_Amount__c FROM DMS_Credit_Note__c WHERE Id=:credit.Id];
    System.assertEquals(105, credit.Total_Amount__c, 'Credit total and tax');

    Sales_Order__c secondary=[SELECT Id,Retailer__c FROM Sales_Order__c WHERE DMS_Distributor__c=null AND Retailer__c!=null LIMIT 1];
    DMS_Invoice__c invoice=new DMS_Invoice__c(Distributor__c=distributor.Id, Outlet__c=secondary.Retailer__c, Sales_Order__c=secondary.Id, Invoice_Date__c=Date.today(), Status__c='Draft');
    insert invoice;
    insert new DMS_Invoice_Line__c(Invoice__c=invoice.Id, Product__c=product.Id, Quantity_Pieces__c=4, Unit_Price__c=25, Discount_Amount__c=10, Tax_Percent__c=5);
    invoice=[SELECT Gross_Amount__c,Discount_Amount__c,Tax_Amount__c,Total_Amount__c,Balance_Due__c FROM DMS_Invoice__c WHERE Id=:invoice.Id];
    System.assertEquals(100,invoice.Gross_Amount__c,'Invoice gross');
    System.assertEquals(10,invoice.Discount_Amount__c,'Invoice discount');
    System.assertEquals(4.50,invoice.Tax_Amount__c,'Invoice tax');
    System.assertEquals(94.50,invoice.Total_Amount__c,'Invoice total');
    System.assertEquals(94.50,invoice.Balance_Due__c,'Invoice balance');
    System.debug('DMS_SCHEMA_SMOKE_OK: 15 assertions passed; all temporary records rolled back.');
} finally {
    Database.rollback(checkpoint);
}
