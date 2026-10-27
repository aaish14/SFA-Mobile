/** Shared primary entry. The authenticated backend supplies the actor identity.
 * Prices and conversions are read from Salesforce, never accepted from the phone.
 */
public with sharing class DmsEmployeeTransactions {
    public class LineInput {
        public Id productId, receiptLineId, schemeId;
        public Decimal cases;
        public String reason, notes;
    }
    /**
     * Validate and save an employee or distributor primary transaction using Salesforce prices
     * and scheme rules. Reuse the request key on retries; primary returns must reference
     * received goods.
     */
    public static Map<String, Object> save(DmsPortalApi.Command cmd) {
        Boolean isReturn = cmd.action == 'primaryReturn' || cmd.action == 'distributorPrimaryReturn';
        Boolean distributorEntry = cmd.action == 'distributorPrimaryOrder' || cmd.action == 'distributorPrimaryReturn';
        if (distributorEntry && cmd.employeeId != null)
            throw new DmsPortalApi.InputException(
                'Distributor transactions cannot impersonate an employee.'
            );
        if (!distributorEntry) {
            List<Employee__c> employees = [
                SELECT Id, DMS_Distributor__c
                FROM Employee__c
                WHERE Id = :cmd.employeeId AND Active__c = TRUE
                FOR UPDATE
            ];
            if (employees.isEmpty() || employees[0].DMS_Distributor__c != cmd.distributorId)
                throw new DmsPortalApi.InputException(
                    'Choose the distributor allocated to this active employee.'
                );
        }
        if (
            String.isBlank(cmd.requestKey) ||
            !Pattern.matches('[A-Za-z0-9-]{16,50}', cmd.requestKey)
        )
            throw new DmsPortalApi.InputException('A stable request key is required.');
        String key =
            String.valueOf(distributorEntry ? cmd.distributorId : cmd.employeeId) +
            ':' +
            cmd.requestKey;
        String fingerprint = EncodingUtil.convertToHex(
            Crypto.generateDigest('SHA-256', Blob.valueOf(JSON.serialize(cmd)))
        );
        List<SObject> existing = isReturn
            ? (List<SObject>) [
                  SELECT Id, Status__c, Request_Hash__c
                  FROM DMS_Primary_Return__c
                  WHERE Request_Key__c = :key
              ]
            : (List<SObject>) [
                  SELECT Id, Status__c, Request_Hash__c
                  FROM DMS_Primary_Order__c
                  WHERE Request_Key__c = :key
              ];
        if (!existing.isEmpty()) {
            if (existing[0].get('Request_Hash__c') != fingerprint)
                throw new DmsPortalApi.InputException(
                    'This request was already used with different details.'
                );
            return new Map<String, Object>{
                'id' => existing[0].Id,
                'status' => existing[0].get('Status__c')
            };
        }
        // Check only for new requests. Replays must still return a saved order
        // even if the company's officer assignment later changes.
        if (distributorEntry) {
            List<DMS_Distributor__c> suppliers = [
                SELECT Officer__c, Officer__r.IsActive
                FROM DMS_Distributor__c
                WHERE Id = :cmd.distributorId AND Active__c = TRUE
            ];
            if (
                suppliers.isEmpty() ||
                suppliers[0].Officer__c == null ||
                !suppliers[0].Officer__r.IsActive
            )
                throw new DmsPortalApi.InputException(
                    'Assign an active company Distributor Officer before ordering.'
                );
        }
        if (
            cmd.lines == null ||
            cmd.lines.isEmpty() ||
            cmd.lines.size() > 50 ||
            (cmd.notes != null &&
            cmd.notes.length() > 1000)
        )
            throw new DmsPortalApi.InputException(
                'Add 1–50 lines and keep notes below 1000 characters.'
            );
        Set<Id> productIds = new Set<Id>(), receiptIds = new Set<Id>(), seen = new Set<Id>();
        for (LineInput line : cmd.lines) {
            Id identifier = isReturn ? line.receiptLineId : line.productId;
            if (
                identifier == null ||
                seen.contains(identifier) ||
                line.cases == null ||
                line.cases <= 0 ||
                line.cases > 100000 ||
                line.cases != line.cases.setScale(0)
            )
                throw new DmsPortalApi.InputException(
                    'Use distinct products/receipts and positive whole cases.'
                );
            seen.add(identifier);
            productIds.add(line.productId);
            receiptIds.add(line.receiptLineId);
        }
        Id parentId;
        if (!isReturn) {
            Map<Id, Product__c> products = new Map<Id, Product__c>(
                [
                    SELECT Id, Units_Per_Case__c, DMS_Case_Price__c, GST_Percent__c
                    FROM Product__c
                    WHERE Id IN :productIds AND Active__c = TRUE AND Sellable__c = TRUE
                ]
            );
            List<DMS_Primary_Order_Line__c> lines = new List<DMS_Primary_Order_Line__c>();
            for (LineInput input : cmd.lines) {
                Product__c product = products.get(input.productId);
                if (
                    product == null ||
                    product.Units_Per_Case__c == null ||
                    product.Units_Per_Case__c <= 0 ||
                    product.Units_Per_Case__c != product.Units_Per_Case__c.setScale(0) ||
                    product.DMS_Case_Price__c == null ||
                    product.DMS_Case_Price__c <= 0
                )
                    throw new DmsPortalApi.InputException(
                        'Configure positive Primary Case Price and whole Units Per Case for every product first.'
                    );
                lines.add(
                    new DMS_Primary_Order_Line__c(
                        Product__c = product.Id,
                        Cases__c = input.cases,
                        Scheme__c = input.schemeId,
                        Pieces_Per_Case__c = product.Units_Per_Case__c,
                        Case_Price__c = product.DMS_Case_Price__c,
                        Tax_Percent__c = product.GST_Percent__c == null ? 0 : product.GST_Percent__c
                    )
                );
            }
            DMS_Primary_Order__c order = new DMS_Primary_Order__c(
                Employee__c = cmd.employeeId,
                Distributor__c = cmd.distributorId,
                Order_Source__c = distributorEntry ? 'Distributor DMS' : 'Employee SFA',
                Status__c = 'Draft',
                Notes__c = cmd.notes,
                Request_Key__c = key,
                Request_Hash__c = fingerprint
            );
            insert order;
            parentId = order.Id;
            for (DMS_Primary_Order_Line__c line : lines)
                line.Order__c = parentId;
            insert lines;
        } else {
            Map<Id, DMS_Goods_Receipt_Line__c> receipts = new Map<Id, DMS_Goods_Receipt_Line__c>(
                [
                    SELECT
                        Id,
                        Product__c,
                        Received_Cases__c,
                        Free_Cases__c,
                        Case_Cost__c,
                        Pieces_Per_Case__c,
                        Batch_Number__c,
                        Expiry_Date__c,
                        Goods_Receipt__r.Primary_Order__c
                    FROM DMS_Goods_Receipt_Line__c
                    WHERE
                        Id IN :receiptIds
                        AND Goods_Receipt__r.Distributor__c = :cmd.distributorId
                        AND Goods_Receipt__r.Status__c = 'Received'
                    FOR UPDATE
                ]
            );
            Map<Id, Decimal> alreadyReturned = new Map<Id, Decimal>();
            for (AggregateResult aggregate : [
                SELECT Receipt_Line__c receipt, SUM(Cases__c) amount
                FROM DMS_Primary_Return_Line__c
                WHERE Receipt_Line__c IN :receiptIds AND Primary_Return__r.Status__c != 'Rejected'
                GROUP BY Receipt_Line__c
            ])
                alreadyReturned.put(
                    (Id) aggregate.get('receipt'),
                    (Decimal) aggregate.get('amount')
                );
            List<DMS_Primary_Return_Line__c> lines = new List<DMS_Primary_Return_Line__c>();
            Set<Id> originalOrders = new Set<Id>();
            for (LineInput input : cmd.lines) {
                DMS_Goods_Receipt_Line__c receipt = receipts.get(input.receiptLineId);
                Decimal previous = alreadyReturned.containsKey(input.receiptLineId)
                    ? alreadyReturned.get(input.receiptLineId)
                    : 0;
                if (
                    receipt == null ||
                    previous + input.cases >
                    receipt.Received_Cases__c +
                    (receipt.Free_Cases__c == null ? 0 : receipt.Free_Cases__c)
                )
                    throw new DmsPortalApi.InputException(
                        'Return cases exceed the unreturned received cases for this distributor.'
                    );
                if (
                    !new Set<String>{
                            'Damaged',
                            'Expired',
                            'Delayed Delivery',
                            'No Demand',
                            'Other'
                        }
                        .contains(input.reason) ||
                    (input.reason == 'Other' && String.isBlank(input.notes))
                )
                    throw new DmsPortalApi.InputException('Choose a return reason; explain Other.');
                if (input.notes != null && input.notes.length() > 1000)
                    throw new DmsPortalApi.InputException('Keep return notes below 1000 characters.');
                originalOrders.add(receipt.Goods_Receipt__r.Primary_Order__c);
                lines.add(
                    new DMS_Primary_Return_Line__c(
                        Product__c = receipt.Product__c,
                        Receipt_Line__c = receipt.Id,
                        Cases__c = input.cases,
                        Case_Value__c = receipt.Case_Cost__c,
                        Pieces_Per_Case__c = receipt.Pieces_Per_Case__c,
                        Batch_Number__c = receipt.Batch_Number__c,
                        Expiry_Date__c = receipt.Expiry_Date__c,
                        Reason__c = input.reason,
                        Notes__c = input.notes
                    )
                );
            }
            DMS_Primary_Return__c returned = new DMS_Primary_Return__c(
                Employee__c = cmd.employeeId,
                Return_Source__c = distributorEntry ? 'Distributor DMS' : 'Employee SFA',
                Primary_Order__c = originalOrders.size() == 1 ? new List<Id>(originalOrders)[0] : null,
                Distributor__c = cmd.distributorId,
                Status__c = 'Draft',
                Notes__c = cmd.notes,
                Request_Key__c = key,
                Request_Hash__c = fingerprint
            );
            insert returned;
            parentId = returned.Id;
            for (DMS_Primary_Return_Line__c line : lines)
                line.Primary_Return__c = parentId;
            insert lines;
        }
        Approval.ProcessSubmitRequest submission = new Approval.ProcessSubmitRequest();
        submission.setObjectId(parentId);
        submission.setProcessDefinitionNameOrId(
            isReturn ? 'Company_Officer_Return_Approval' : 'Company_Officer_Approval'
        );
        if (!Approval.process(submission).isSuccess())
            throw new DmsPortalApi.InputException('Unable to submit to the company officer.');
        return new Map<String, Object>{ 'id' => parentId, 'status' => 'Submitted' };
    }
}