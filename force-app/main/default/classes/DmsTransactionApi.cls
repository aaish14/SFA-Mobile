/** Transaction boundary for the trusted backend. No inventory writes occur here. */
@RestResource(urlMapping='/dms/transactions/*')
global with sharing class DmsTransactionApi {
    public class InputException extends Exception {
    }
    public class LineInput {
        public Id productId;
        public Decimal cases;
    }
    public class RequestBody {
        public String action;
        public Id employeeId;
        public Id distributorId;
        public Id orderId;
        public String requestKey;
        public String decision;
        public String notes;
        public List<LineInput> lines;
    }
    /**
     * Deserialize a command for this legacy REST endpoint and serialize its result.
     * Authorization must be reviewed at this endpoint separately from DmsPortalApi.
     */
    @HttpPost
    global static void execute() {
        RestContext.response.addHeader('Content-Type', 'application/json');
        RestContext.response.responseBody = Blob.valueOf(JSON.serialize(handle()));
    }

    // Keep the existing JSON success/error envelope while using a valid Apex REST signature.
    /**
     * Dispatch the legacy primary-order or secondary-decision command within a savepoint and
     * roll back database changes on failure.
     */
    private static Map<String, Object> handle() {
        Savepoint checkpoint = Database.setSavepoint();
        try {
            RequestBody request = (RequestBody) JSON.deserialize(
                RestContext.request.requestBody.toString(),
                RequestBody.class
            );
            if (request.action == 'primaryOrder')
                return createPrimary(request);
            if (request.action == 'secondaryDecision')
                return decideSecondary(request);
            throw new InputException('Unknown transaction.');
        } catch (Exception error) {
            Database.rollback(checkpoint);
            RestContext.response.statusCode = 400;
            return new Map<String, Object>{
                'error' => error instanceof InputException
                    ? error.getMessage()
                    : 'The Salesforce transaction could not be completed. Ask the administrator to check configuration and access.'
            };
        }
    }
    /**
     * Create or replay a primary order after checking employee/outlet distributor scope and
     * using Salesforce product prices, then submit it for approval.
     */
    public static Map<String, Object> createPrimary(RequestBody request) {
        if (
            String.isBlank(request.requestKey) ||
            !Pattern.matches('[A-Za-z0-9-]{16,80}', request.requestKey)
        )
            throw new InputException('A valid request key is required.');
        if (
            [SELECT COUNT() FROM Employee__c WHERE Id = :request.employeeId AND Active__c = TRUE] !=
            1
        )
            throw new InputException('Employee is not active.');
        List<DMS_Primary_Order__c> existing = [
            SELECT Id, Status__c, Employee__c
            FROM DMS_Primary_Order__c
            WHERE Request_Key__c = :request.requestKey
            LIMIT 1
        ];
        if (!existing.isEmpty()) {
            if (existing[0].Employee__c != request.employeeId)
                throw new InputException('Request key belongs to another employee.');
            return new Map<String, Object>{
                'id' => existing[0].Id,
                'status' => existing[0].Status__c
            };
        }
        List<DMS_Distributor__c> distributors = [
            SELECT Id, Officer__c, Officer__r.IsActive
            FROM DMS_Distributor__c
            WHERE Id = :request.distributorId AND Active__c = TRUE
            LIMIT 1
        ];
        if (
            distributors.isEmpty() ||
            distributors[0].Officer__c == null ||
            !distributors[0].Officer__r.IsActive
        )
            throw new InputException('The distributor needs an active company officer.');
        Set<Id> outlets = new Set<Id>();
        for (Distributor_Outlet_Allocation__c allocation : [
            SELECT Outlet__c
            FROM Distributor_Outlet_Allocation__c
            WHERE Employee__c = :request.employeeId AND Allocation_Status__c = 'Active'
        ])
            outlets.add(allocation.Outlet__c);
        if (
            [
                SELECT COUNT()
                FROM Retailer__c
                WHERE Id IN :outlets AND DMS_Distributor__c = :request.distributorId
            ] == 0
        )
            throw new InputException('This distributor is not linked to your allocated outlets.');
        if (request.lines == null || request.lines.isEmpty() || request.lines.size() > 50)
            throw new InputException('Add between 1 and 50 products.');
        Set<Id> productIds = new Set<Id>();
        for (LineInput line : request.lines) {
            if (
                line.productId == null ||
                line.cases == null ||
                line.cases <= 0 ||
                line.cases > 100000 ||
                line.cases != line.cases.setScale(0)
            )
                throw new InputException('Cases must be positive whole numbers, up to 100000.');
            if (productIds.contains(line.productId))
                throw new InputException('Combine repeated products into one line.');
            productIds.add(line.productId);
        }
        Map<Id, Product__c> products = new Map<Id, Product__c>(
            [
                SELECT Id, Name, DMS_Case_Price__c, Units_Per_Case__c, GST_Percent__c
                FROM Product__c
                WHERE Id IN :productIds AND Active__c = TRUE AND Sellable__c = TRUE
            ]
        );
        List<DMS_Primary_Order_Line__c> lines = new List<DMS_Primary_Order_Line__c>();
        Decimal total = 0;
        for (LineInput input : request.lines) {
            Product__c product = products.get(input.productId);
            if (
                product == null ||
                product.DMS_Case_Price__c == null ||
                product.DMS_Case_Price__c <= 0 ||
                product.Units_Per_Case__c == null ||
                product.Units_Per_Case__c <= 0 ||
                product.Units_Per_Case__c != product.Units_Per_Case__c.setScale(0)
            )
                throw new InputException(
                    'Each product needs a positive Primary Case Price and whole Units Per Case in Salesforce.'
                );
            Decimal tax = product.GST_Percent__c == null ? 0 : product.GST_Percent__c;
            total += (input.cases * product.DMS_Case_Price__c * (1 + tax / 100)).setScale(2);
            lines.add(
                new DMS_Primary_Order_Line__c(
                    Product__c = product.Id,
                    Cases__c = input.cases,
                    Pieces_Per_Case__c = product.Units_Per_Case__c,
                    Case_Price__c = product.DMS_Case_Price__c,
                    Tax_Percent__c = tax
                )
            );
        }
        DMS_Primary_Order__c order = new DMS_Primary_Order__c(
            Distributor__c = request.distributorId,
            Employee__c = request.employeeId,
            Officer__c = distributors[0].Officer__c,
            Request_Key__c = request.requestKey,
            Notes__c = request.notes,
            Status__c = 'Draft',
            Total_Amount__c = total
        );
        insert order;
        for (DMS_Primary_Order_Line__c line : lines)
            line.Order__c = order.Id;
        insert lines;
        Approval.ProcessSubmitRequest approvalRequest = new Approval.ProcessSubmitRequest();
        approvalRequest.setObjectId(order.Id);
        approvalRequest.setProcessDefinitionNameOrId('Company_Officer_Approval');
        Approval.ProcessResult result = Approval.process(approvalRequest);
        if (!result.isSuccess())
            throw new InputException('Unable to submit to the company officer.');
        return new Map<String, Object>{ 'id' => order.Id, 'status' => 'Submitted' };
    }
    /**
     * Apply the legacy manual secondary-order decision with distributor scoping and required
     * rejection notes.
     */
    public static Map<String, Object> decideSecondary(RequestBody request) {
        if (!new Set<String>{ 'Approved', 'Rejected' }.contains(request.decision))
            throw new InputException('Choose Approve or Reject.');
        if (request.decision == 'Rejected' && String.isBlank(request.notes))
            throw new InputException('Enter a rejection reason.');
        if (
            [
                SELECT COUNT()
                FROM DMS_Distributor__c
                WHERE Id = :request.distributorId AND Active__c = TRUE
            ] != 1
        )
            throw new InputException('Distributor is inactive.');
        List<Sales_Order__c> orders = [
            SELECT Id, DMS_Status__c
            FROM Sales_Order__c
            WHERE Id = :request.orderId AND DMS_Distributor__c = :request.distributorId
            LIMIT 1
            FOR UPDATE
        ];
        if (orders.isEmpty())
            throw new InputException('Order is not assigned to this distributor.');
        Sales_Order__c order = orders[0];
        if (order.DMS_Status__c == request.decision)
            return new Map<String, Object>{ 'id' => order.Id, 'status' => order.DMS_Status__c };
        if (order.DMS_Status__c != null && order.DMS_Status__c != 'Pending')
            throw new InputException('This order has already been decided.');
        order.DMS_Status__c = request.decision;
        order.DMS_Decision_Notes__c = request.notes;
        order.DMS_Decided_At__c = System.now();
        update order;
        return new Map<String, Object>{ 'id' => order.Id, 'status' => order.DMS_Status__c };
    }
}
