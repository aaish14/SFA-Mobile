/** Read-only return review. Salesforce sharing, object permissions and field access apply to every query. */
public with sharing class DmsReturnReviewController {
    public class ProductLine {
        public Id productId {get;set;}
        public String product {get;set;}
        public String orderName {get;set;}
        public Decimal quantity {get;set;}
        public Decimal freeQuantity {get;set;}
        public String reason {get;set;}
        public String notes {get;set;}
        public String batch {get;set;}
        public String status {get;set;}
        public String getProductBarcode() { return productId == null ? '' : 'P-' + String.valueOf(productId); }
    }
    public Id recordId {get;private set;}
    public String title {get;private set;}
    public String status {get;private set;}
    public String distributor {get;private set;}
    public String approver {get;private set;}
    public String unit {get;private set;}
    public String errorMessage {get;private set;}
    public Boolean available {get;private set;}
    public List<ProductLine> returnedProducts {get;private set;}
    public List<ProductLine> orderedProducts {get;private set;}
    private String objectName;

    public DmsReturnReviewController() { initialize(ApexPages.currentPage().getParameters().get('id')); }
    public DmsReturnReviewController(ApexPages.StandardController controller) { initialize(String.valueOf(controller.getId())); }
    public String getBarcodeValue() { return recordId == null ? '' : 'R-' + String.valueOf(recordId); }
    public String getReviewUrl() { return URL.getOrgDomainUrl().toExternalForm() + '/apex/DmsReturnReview?id=' + String.valueOf(recordId); }
    public String getRecordUrl() { return '/lightning/r/' + objectName + '/' + String.valueOf(recordId) + '/view'; }

    /** Reject unsupported references and never show partially authorized results after a failed query. */
    private void initialize(String rawId) {
        available=false; returnedProducts=new List<ProductLine>(); orderedProducts=new List<ProductLine>();
        try {
            if (rawId != null && rawId.startsWith('R-')) rawId=rawId.substring(2);
            if (String.isBlank(rawId) || !Pattern.matches('[A-Za-z0-9]{15}([A-Za-z0-9]{3})?', rawId)) throw new ReviewException();
            recordId=(Id)rawId;
            if (recordId.getSObjectType() == DMS_Primary_Return__c.SObjectType) {
                objectName='DMS_Primary_Return__c'; loadPrimary();
            } else if (recordId.getSObjectType() == Product_Return__c.SObjectType) {
                objectName='Product_Return__c'; loadSecondary();
            } else throw new ReviewException();
            if (returnedProducts.size() > 500 || orderedProducts.size() > 500) throw new ReviewException();
            available=true;
        } catch (Exception failure) {
            returnedProducts.clear(); orderedProducts.clear(); title=null; distributor=null; status=null; approver=null;
            errorMessage='This return is unavailable or you do not have access to its products. Open an accessible return record or contact your Salesforce administrator.';
        }
    }

    /** Show the original order alongside the exact saved quantities and reasons sent for officer approval. */
    private void loadPrimary() {
        DMS_Primary_Return__c row=[SELECT Id,Name,Status__c,Distributor__c,Distributor__r.Name,Officer__r.Name,Primary_Order__c
            FROM DMS_Primary_Return__c WHERE Id=:recordId WITH USER_MODE LIMIT 1];
        title=row.Name; status=row.Status__c; distributor=row.Distributor__r.Name;
        approver=row.Officer__r == null ? 'Company officer' : row.Officer__r.Name; unit='cases';
        Set<Id> orderIds=new Set<Id>(); if (row.Primary_Order__c != null) orderIds.add(row.Primary_Order__c);
        for (DMS_Primary_Return_Line__c line : [SELECT Product__c,Product__r.Name,Cases__c,Reason__c,Notes__c,Batch_Number__c,
            Receipt_Line__r.Goods_Receipt__r.Primary_Order__c,Receipt_Line__r.Goods_Receipt__r.Primary_Order__r.Name
            FROM DMS_Primary_Return_Line__c WHERE Primary_Return__c=:recordId WITH USER_MODE ORDER BY Id LIMIT 501]) {
            ProductLine item=new ProductLine(); item.productId=line.Product__c; item.product=line.Product__r.Name;
            item.quantity=line.Cases__c; item.reason=line.Reason__c; item.notes=line.Notes__c; item.batch=line.Batch_Number__c;
            if (line.Receipt_Line__r != null && line.Receipt_Line__r.Goods_Receipt__r != null) {
                Id orderId=line.Receipt_Line__r.Goods_Receipt__r.Primary_Order__c;
                if (orderId != null) { orderIds.add(orderId); item.orderName=line.Receipt_Line__r.Goods_Receipt__r.Primary_Order__r.Name; }
            }
            returnedProducts.add(item);
        }
        for (DMS_Primary_Order_Line__c line : [SELECT Product__c,Product__r.Name,Cases__c,Free_Cases__c,Order__r.Name
            FROM DMS_Primary_Order_Line__c WHERE Order__c IN :orderIds AND Order__r.Distributor__c=:row.Distributor__c
            WITH USER_MODE ORDER BY Id LIMIT 501]) {
            ProductLine item=new ProductLine(); item.productId=line.Product__c; item.product=line.Product__r.Name;
            item.quantity=line.Cases__c; item.freeQuantity=line.Free_Cases__c; item.orderName=line.Order__r.Name; orderedProducts.add(item);
        }
    }

    /** Secondary products saved together are read together; a barcode never grants additional access. */
    private void loadSecondary() {
        Product_Return__c anchor=[SELECT Id,Name,DMS_Status__c,DMS_Distributor__c,DMS_Distributor__r.Name,Mobile_Request_Key__c,
            Product__c,Product__r.Name,Quantity__c,Return_Reason__c,Return_Notes__c,Order_Item__r.Sales_Order__c,Order_Item__r.Sales_Order__r.Name
            FROM Product_Return__c WHERE Id=:recordId WITH USER_MODE LIMIT 1];
        title=anchor.Name; status=anchor.DMS_Status__c; distributor=anchor.DMS_Distributor__r == null ? 'Not assigned' : anchor.DMS_Distributor__r.Name;
        approver='Distributor'; unit='pieces';
        Id orderId=anchor.Order_Item__r == null ? null : anchor.Order_Item__r.Sales_Order__c;
        String prefix=DmsDistributorReturns.requestPrefix(anchor.Mobile_Request_Key__c, anchor.DMS_Distributor__c);
        String keyPattern=prefix+'%';
        List<Product_Return__c> rows=prefix == null ? new List<Product_Return__c>{anchor} : [
            SELECT Id,Name,Product__c,Product__r.Name,Quantity__c,Return_Reason__c,Return_Notes__c,DMS_Status__c,Order_Item__r.Sales_Order__r.Name
            FROM Product_Return__c WHERE DMS_Distributor__c=:anchor.DMS_Distributor__c AND Mobile_Request_Key__c LIKE :keyPattern
                AND Order_Item__r.Sales_Order__c=:orderId WITH USER_MODE ORDER BY Id LIMIT 501];
        Set<String> statuses=new Set<String>();
        for (Product_Return__c line : rows) {
            ProductLine item=new ProductLine(); item.productId=line.Product__c; item.product=line.Product__r.Name;
            item.quantity=line.Quantity__c; item.reason=line.Return_Reason__c; item.notes=line.Return_Notes__c;
            item.status=line.DMS_Status__c == null ? 'Pending' : line.DMS_Status__c; statuses.add(item.status);
            if (line.Order_Item__r != null) item.orderName=line.Order_Item__r.Sales_Order__r.Name;
            returnedProducts.add(item);
        }
        if (statuses.size() > 1) status='Mixed decisions';
        for (Order_Item__c line : [SELECT Product__c,Product__r.Name,Piece_Quantity__c,Sales_Order__r.Name
            FROM Order_Item__c WHERE Sales_Order__c=:orderId AND Sales_Order__r.DMS_Distributor__c=:anchor.DMS_Distributor__c
                WITH USER_MODE ORDER BY Id LIMIT 501]) {
            ProductLine item=new ProductLine(); item.productId=line.Product__c; item.product=line.Product__r.Name;
            item.quantity=line.Piece_Quantity__c; item.orderName=line.Sales_Order__r.Name; orderedProducts.add(item);
        }
    }
    private class ReviewException extends Exception {}
}