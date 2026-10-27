/** Creates secondary returns from the signed-in distributor's approved order lines. */
public with sharing class DmsDistributorReturns {
    // Keep this DTO separate: adding members to the existing primary command would
    // change its serialized fingerprint and break retries of saved SFA requests.
    public class Command {
        public String action, requestKey;
        public Id distributorId, employeeId;
        public List<ReturnLine> lines;
    }
    public class ReturnLine {
        public Id orderItemId;
        public Decimal pieces;
        public String reason, notes;
    }
    /**
     * The portal entry point already locks the distributor. Lock source lines as well,
     * reserve pending quantities and commit all selected products in one transaction.
     * Replayed request keys return the original result, never another return.
     */
    public static Map<String, Object> save(String payload) {
        Command cmd = (Command)JSON.deserialize(payload, Command.class);
        if (cmd.employeeId != null || String.isBlank(cmd.requestKey) ||
            !Pattern.matches('[A-Za-z0-9-]{16,50}', cmd.requestKey) ||
            cmd.lines == null || cmd.lines.isEmpty() || cmd.lines.size() > 50)
            throw new DmsPortalApi.InputException('Select 1–50 ordered products and a stable request key.');
        String prefix = String.valueOf(cmd.distributorId) + ':' + cmd.requestKey + ':';
        String fingerprint = EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(JSON.serialize(cmd))));
        String pattern = prefix + '%';
        List<Product_Return__c> saved = [SELECT Id, DMS_Status__c, DMS_Request_Hash__c
            FROM Product_Return__c WHERE Mobile_Request_Key__c LIKE :pattern ORDER BY CreatedDate, Id];
        if (!saved.isEmpty()) {
            if (saved.size() != cmd.lines.size())
                throw new DmsPortalApi.InputException('This request key was already used with different details.');
            for (Product_Return__c row : saved)
                if (row.DMS_Request_Hash__c != fingerprint)
                    throw new DmsPortalApi.InputException('This request key was already used with different details.');
            return new Map<String, Object>{'id' => saved[0].Id, 'status' => saved[0].DMS_Status__c, 'count' => saved.size()};
        }
        Set<Id> lineIds = new Set<Id>();
        Set<String> reasons = new Set<String>{'Damaged','Expired','Near Expiry','Wrong Supply','Quality Issue','Delayed Delivery','No Demand','Other'};
        for (ReturnLine line : cmd.lines) {
            if (line.orderItemId == null || lineIds.contains(line.orderItemId) || line.pieces == null ||
                line.pieces <= 0 || line.pieces > 100000 || line.pieces != line.pieces.setScale(0) ||
                !reasons.contains(line.reason) || (line.reason == 'Other' && String.isBlank(line.notes)) ||
                (line.notes != null && line.notes.length() > 1000))
                throw new DmsPortalApi.InputException('Select distinct order lines, positive whole pieces and a reason; explain Other.');
            lineIds.add(line.orderItemId);
        }
        Map<Id, Order_Item__c> orders = new Map<Id, Order_Item__c>([
            SELECT Id, Product__c, Piece_Quantity__c, Sales_Order__r.Retailer__c,
                Sales_Order__r.Retailer__r.DMS_Distributor__c
            FROM Order_Item__c WHERE Id IN :lineIds
                AND Sales_Order__r.DMS_Distributor__c = :cmd.distributorId
                AND Sales_Order__r.DMS_Status__c = 'Approved' FOR UPDATE
        ]);
        Map<Id, Decimal> reserved = new Map<Id, Decimal>();
        for (AggregateResult row : [SELECT Order_Item__c source, SUM(Quantity__c) quantity
            FROM Product_Return__c WHERE Order_Item__c IN :lineIds
                AND (DMS_Status__c = null OR DMS_Status__c != 'Rejected') GROUP BY Order_Item__c])
            reserved.put((Id)row.get('source'), (Decimal)row.get('quantity'));
        List<Product_Return__c> returns = new List<Product_Return__c>();
        for (ReturnLine input : cmd.lines) {
            Order_Item__c source = orders.get(input.orderItemId);
            Decimal previous = reserved.containsKey(input.orderItemId) ? reserved.get(input.orderItemId) : 0;
            if (source == null || source.Sales_Order__r.Retailer__r.DMS_Distributor__c != cmd.distributorId ||
                source.Piece_Quantity__c == null || previous + input.pieces > source.Piece_Quantity__c)
                throw new DmsPortalApi.InputException('Return pieces exceed the remaining approved order quantity for this distributor.');
            returns.add(new Product_Return__c(
                Order_Item__c = source.Id, Outlet__c = source.Sales_Order__r.Retailer__c,
                Product__c = source.Product__c, Quantity__c = input.pieces,
                Return_Reason__c = input.reason, Return_Notes__c = input.notes,
                DMS_Distributor__c = cmd.distributorId, DMS_Status__c = 'Pending',
                Mobile_Request_Key__c = prefix + source.Id, DMS_Request_Hash__c = fingerprint
            ));
        }
        insert returns;
        return new Map<String, Object>{'id' => returns[0].Id, 'status' => 'Pending', 'count' => returns.size()};
    }
}