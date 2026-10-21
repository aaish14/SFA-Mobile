/**
 * Atomic DMS commands from the authenticated backend only.
 * The backend derives employee/distributor IDs from verified sessions. Mobile
 * clients never receive Salesforce credentials or the integration permission.
 */
@RestResource(urlMapping='/dms/portal/*')
global with sharing class DmsPortalApi {
    public class InputException extends Exception {}
    public class Command {
        public String action,requestKey,subject,category,description,decision,notes,batch,receiptKind;
        public Id distributorId,recordId,employeeId;
        public Decimal cases;
        public Date expiry;
        public List<DmsEmployeeTransactions.LineInput> lines;
    }
    @HttpPost global static void execute() {
        RestContext.response.addHeader('Content-Type','application/json');
        RestContext.response.responseBody=Blob.valueOf(JSON.serialize(handle()));
    }
    private static Map<String,Object> handle() {
        if(!FeatureManagement.checkPermission('DMS_Trusted_Backend')) {
            RestContext.response.statusCode=403;
            return new Map<String,Object>{'error'=>'Trusted backend access is required.'};
        }
        Savepoint checkpoint=Database.setSavepoint();
        try {
            Command cmd=(Command)JSON.deserialize(RestContext.request.requestBody.toString(),Command.class);
            // A distributor lock serializes replay detection and inventory updates.
            List<DMS_Distributor__c> distributors=[SELECT Id,Officer__c FROM DMS_Distributor__c
                WHERE Id=:cmd.distributorId AND Active__c=true FOR UPDATE];
            if(distributors.isEmpty()) throw new InputException('Distributor is not active.');
            if(cmd.action=='primaryOrder'||cmd.action=='primaryReturn') return DmsEmployeeTransactions.save(cmd);
            if(cmd.action=='ticket') return ticket(cmd);
            if(cmd.action=='secondaryDecision') return decision(cmd,false);
            if(cmd.action=='returnDecision') return decision(cmd,true);
            if(cmd.action=='receiveGoods') return receiveGoods(cmd);
            throw new InputException('Unsupported transaction.');
        } catch(Exception error) {
            Database.rollback(checkpoint);
            if(error instanceof DmlException) {
                DmlException validation=(DmlException)error;
                if(validation.getNumDml()>0 && (validation.getDmlStatusCode(0)=='FIELD_CUSTOM_VALIDATION_EXCEPTION' || validation.getDmlStatusCode(0)=='REQUIRED_FIELD_MISSING')) {
                    RestContext.response.statusCode=400;
                    return new Map<String,Object>{'error'=>validation.getDmlMessage(0)};
                }
            }
            RestContext.response.statusCode=error instanceof InputException?400:500;
            return new Map<String,Object>{'error'=>error instanceof InputException?error.getMessage():
                'Salesforce could not save this transaction. No partial changes were saved.'};
        }
    }
    private static String key(Command cmd) {
        if(String.isBlank(cmd.requestKey)||!Pattern.matches('[A-Za-z0-9-]{16,64}',cmd.requestKey))
            throw new InputException('A stable request key is required.');
        return String.valueOf(cmd.distributorId)+':'+cmd.requestKey;
    }
    private static Map<String,Object> result(Id id,String status) {
        return new Map<String,Object>{'id'=>id,'status'=>status};
    }
    private static Map<String,Object> ticket(Command cmd) {
        String requestKey=key(cmd);
        List<DMS_Support_Ticket__c> existing=[SELECT Id,Status__c,Subject__c,Category__c,Description__c
            FROM DMS_Support_Ticket__c WHERE Request_Key__c=:requestKey];
        if(!existing.isEmpty()) {
            DMS_Support_Ticket__c saved=existing[0];
            if(saved.Subject__c!=cmd.subject||saved.Category__c!=cmd.category||saved.Description__c!=cmd.description)
                throw new InputException('This request key was already used for different ticket details.');
            return result(saved.Id,saved.Status__c);
        }
        if(String.isBlank(cmd.subject)||cmd.subject.length()>180||String.isBlank(cmd.description)||
           cmd.description.length()>32000||!new Set<String>{'Product','Portal','Delivery'}.contains(cmd.category))
            throw new InputException('Enter a subject, description and valid issue category.');
        DMS_Support_Ticket__c row=new DMS_Support_Ticket__c(Distributor__c=cmd.distributorId,
            Subject__c=cmd.subject,Category__c=cmd.category,Description__c=cmd.description,Request_Key__c=requestKey);
        insert row;
        return result(row.Id,'Open');
    }
    private static Map<String,Object> decision(Command cmd,Boolean isReturn) {
        if(!new Set<String>{'Approved','Rejected'}.contains(cmd.decision)||
           (cmd.decision=='Rejected'&&String.isBlank(cmd.notes))||
           (cmd.notes!=null&&cmd.notes.length()>255)) throw new InputException('Choose a decision and enter a rejection reason when rejecting.');
        List<SObject> rows=isReturn?
            (List<SObject>)[SELECT Id,DMS_Status__c FROM Product_Return__c
                WHERE Id=:cmd.recordId AND DMS_Distributor__c=:cmd.distributorId FOR UPDATE]:
            (List<SObject>)[SELECT Id,DMS_Status__c FROM Sales_Order__c
                WHERE Id=:cmd.recordId AND DMS_Distributor__c=:cmd.distributorId FOR UPDATE];
        if(rows.isEmpty()) throw new InputException('Record does not belong to this distributor.');
        SObject row=rows[0]; String status=(String)row.get('DMS_Status__c');
        if(status==cmd.decision) return result(row.Id,status);
        if(status!=null&&status!='Pending') throw new InputException('This record was already decided. Refresh before continuing.');
        row.put('DMS_Status__c',cmd.decision);row.put('DMS_Decision_Notes__c',cmd.notes);
        if(!isReturn) row.put('DMS_Decided_At__c',System.now());
        update row;
        return result(row.Id,cmd.decision);
    }
    private static Map<String,Object> receiveGoods(Command cmd) {
        if(cmd.receiptKind!=null&&!new Set<String>{'Paid','Free'}.contains(cmd.receiptKind)) throw new InputException('Choose Paid or Free goods.');
        Boolean freeGoods=cmd.receiptKind=='Free';
        String requestKey=key(cmd);
        List<DMS_Goods_Receipt__c> existing=[SELECT Id,Status__c FROM DMS_Goods_Receipt__c WHERE Request_Key__c=:requestKey];
        if(!existing.isEmpty()) {
            List<DMS_Goods_Receipt_Line__c> saved=[SELECT Primary_Order_Line__c,Received_Cases__c,Free_Cases__c,Batch_Number__c,Expiry_Date__c
                FROM DMS_Goods_Receipt_Line__c WHERE Goods_Receipt__c=:existing[0].Id];
            if(saved.size()!=1||saved[0].Primary_Order_Line__c!=cmd.recordId||(freeGoods?saved[0].Free_Cases__c:saved[0].Received_Cases__c)!=cmd.cases||
                saved[0].Batch_Number__c!=cmd.batch||saved[0].Expiry_Date__c!=cmd.expiry)
                throw new InputException('This receipt key was already used with different details.');
            return result(existing[0].Id,existing[0].Status__c);
        }
        if(cmd.cases==null||cmd.cases<=0||cmd.cases>100000||cmd.cases!=cmd.cases.setScale(0)||
            String.isBlank(cmd.batch)||cmd.batch.length()>80||cmd.expiry==null||cmd.expiry<Date.today())
            throw new InputException('Enter positive whole cases, batch number and an unexpired expiry date.');
        List<DMS_Primary_Order_Line__c> lines=[SELECT Id,Order__c,Product__c,Cases__c,Pieces_Per_Case__c,Case_Price__c,Discount_Amount__c,Free_Cases__c,Free_Product__c,Free_Pieces_Per_Case__c
            FROM DMS_Primary_Order_Line__c WHERE Id=:cmd.recordId AND Order__r.Distributor__c=:cmd.distributorId
            AND Order__r.Status__c='Approved' FOR UPDATE];
        if(lines.isEmpty()) throw new InputException('Select a line from your approved primary order.');
        DMS_Primary_Order_Line__c line=lines[0];
        Decimal received=0;
        for(AggregateResult row:[SELECT SUM(Received_Cases__c) amount,SUM(Free_Cases__c) bonus FROM DMS_Goods_Receipt_Line__c
            WHERE Primary_Order_Line__c=:line.Id AND Goods_Receipt__r.Status__c='Received'])
            if(row.get(freeGoods?'bonus':'amount')!=null) received=(Decimal)row.get(freeGoods?'bonus':'amount');
        Decimal entitlement=freeGoods?line.Free_Cases__c:line.Cases__c;
        if(entitlement==null||received+cmd.cases>entitlement) throw new InputException('Received cases exceed the remaining approved quantity.');
        Id productId=freeGoods?line.Free_Product__c:line.Product__c;
        Decimal conversion=freeGoods?line.Free_Pieces_Per_Case__c:line.Pieces_Per_Case__c;
        if(productId==null||conversion==null||conversion<=0) throw new InputException('The order has no valid product or case conversion.');
        List<DMS_Inventory__c> matches=[SELECT Id,On_Hand_Pieces__c,Expiry_Date__c FROM DMS_Inventory__c
            WHERE Distributor__c=:cmd.distributorId AND Product__c=:productId AND Batch_Number__c=:cmd.batch FOR UPDATE];
        if(matches.size()>1) throw new InputException('Duplicate inventory batches need administrator review.');
        DMS_Inventory__c stock=matches.isEmpty()?new DMS_Inventory__c(Distributor__c=cmd.distributorId,
            Product__c=productId,Batch_Number__c=cmd.batch,Expiry_Date__c=cmd.expiry,On_Hand_Pieces__c=0):matches[0];
        if(stock.Expiry_Date__c!=cmd.expiry) throw new InputException('Expiry must match the existing batch.');
        DMS_Goods_Receipt__c receipt=new DMS_Goods_Receipt__c(Distributor__c=cmd.distributorId,
            Primary_Order__c=line.Order__c,Received_Date__c=Date.today(),Received_By__c=UserInfo.getUserId(),
            Status__c='Draft',Request_Key__c=requestKey);
        insert receipt;
        insert new DMS_Goods_Receipt_Line__c(Goods_Receipt__c=receipt.Id,Primary_Order_Line__c=line.Id,
            Product__c=productId,Received_Cases__c=freeGoods?0:cmd.cases,Free_Cases__c=freeGoods?cmd.cases:0,Pieces_Per_Case__c=conversion,
            Case_Cost__c=freeGoods?0:(line.Case_Price__c-(line.Discount_Amount__c==null?0:line.Discount_Amount__c)/line.Cases__c),Batch_Number__c=cmd.batch,Expiry_Date__c=cmd.expiry);
        stock.On_Hand_Pieces__c=(stock.On_Hand_Pieces__c==null?0:stock.On_Hand_Pieces__c)+cmd.cases*conversion;
        stock.Last_Stock_Update__c=System.now();upsert stock;
        receipt.Status__c='Received';update receipt;
        return result(receipt.Id,'Received');
    }
}