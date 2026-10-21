/**
 * Shared Salesforce-side rules for primary orders and returns.
 * This is trigger-only system automation, not an externally callable API.
 */
public without sharing class DmsPrimaryWorkflow {
    public static void prepareHeaders(List<SObject> records, Map<Id,SObject> previous, Boolean isReturn) {
        Set<Id> distributorIds=new Set<Id>();
        Set<Id> employeeIds=new Set<Id>();
        Set<Id> submittingIds=new Set<Id>();
        for(SObject row:records) {
            distributorIds.add((Id)row.get('Distributor__c'));
            employeeIds.add((Id)row.get('Employee__c'));
            if(row.get('Status__c')=='Submitted' &&
                (previous==null || previous.get(row.Id).get('Status__c')!='Submitted')) {
                submittingIds.add(row.Id);
            }
        }
        Map<Id,DMS_Distributor__c> distributors=new Map<Id,DMS_Distributor__c>([
            SELECT Id,Active__c,Officer__c,Officer__r.IsActive
            FROM DMS_Distributor__c WHERE Id IN :distributorIds
        ]);
        Map<Id,Employee__c> employees=new Map<Id,Employee__c>([
            SELECT Id,Active__c,DMS_Distributor__c FROM Employee__c WHERE Id IN :employeeIds
        ]);
        Set<Id> withLines=new Set<Id>();
        if(!submittingIds.isEmpty()) {
            if(isReturn) {
                for(AggregateResult line:[SELECT Primary_Return__c parent FROM DMS_Primary_Return_Line__c
                    WHERE Primary_Return__c IN :submittingIds GROUP BY Primary_Return__c]) {
                    withLines.add((Id)line.get('parent'));
                }
            } else {
                for(AggregateResult line:[SELECT Order__c parent FROM DMS_Primary_Order_Line__c
                    WHERE Order__c IN :submittingIds GROUP BY Order__c]) {
                    withLines.add((Id)line.get('parent'));
                }
            }
        }
        for(SObject row:records) {
            SObject old=previous==null ? null : previous.get(row.Id);
            Boolean draft=old==null || old.get('Status__c')=='Draft';
            if(!draft) {
                if(row.get('Distributor__c')!=old.get('Distributor__c') ||
                   row.get('Employee__c')!=old.get('Employee__c') ||
                   row.get('Officer__c')!=old.get('Officer__c')) {
                    row.addError('Distributor, employee and approver cannot change after submission.');
                }
                continue;
            }
            DMS_Distributor__c distributor=distributors.get((Id)row.get('Distributor__c'));
            Employee__c employee=employees.get((Id)row.get('Employee__c'));
            // Drafts may be incomplete, but approval requires all relationships.
            if(distributor!=null) row.put('Officer__c',distributor.Officer__c);
            String dateField=isReturn ? 'Return_Date__c' : 'Order_Date__c';
            if(row.get(dateField)==null) row.put(dateField,Date.today());
            if(employee!=null && employee.DMS_Distributor__c!=null &&
               row.get('Distributor__c')!=null && employee.DMS_Distributor__c!=row.get('Distributor__c')) {
                row.addError('Choose the distributor allocated to this employee.');
            }
            if(submittingIds.contains(row.Id)) {
                if(distributor==null || !distributor.Active__c || distributor.Officer__c==null ||
                    !distributor.Officer__r.IsActive) {
                    row.addError('Select an active distributor with an active company Distributor Officer.');
                }
                if(employee==null || !employee.Active__c) row.addError('Select an active employee.');
                if(!withLines.contains(row.Id)) row.addError('Add at least one product line before submitting for approval.');
            }
        }
    }

    public static void prepareLines(List<SObject> records, Map<Id,SObject> previous, Boolean isReturn, Boolean deleting) {
        String parentField=isReturn ? 'Primary_Return__c' : 'Order__c';
        Set<Id> parentIds=new Set<Id>();
        Set<Id> productIds=new Set<Id>();
        for(SObject row:records) {
            parentIds.add((Id)row.get(parentField));
            productIds.add((Id)row.get('Product__c'));
            if(previous!=null) parentIds.add((Id)previous.get(row.Id).get(parentField));
        }
        Map<Id,String> statuses=new Map<Id,String>();
        // Lock parents before totals are read/written, protecting concurrent line saves.
        if(isReturn) {
            for(DMS_Primary_Return__c parent:[SELECT Id,Status__c FROM DMS_Primary_Return__c
                WHERE Id IN :parentIds FOR UPDATE]) statuses.put(parent.Id,parent.Status__c);
        } else {
            for(DMS_Primary_Order__c parent:[SELECT Id,Status__c FROM DMS_Primary_Order__c
                WHERE Id IN :parentIds FOR UPDATE]) statuses.put(parent.Id,parent.Status__c);
        }
        Map<Id,Product__c> products=new Map<Id,Product__c>([
            SELECT Id,Active__c,Sellable__c,Units_Per_Case__c,DMS_Case_Price__c,GST_Percent__c
            FROM Product__c WHERE Id IN :productIds
        ]);
        for(SObject row:records) {
            Id parentId=(Id)row.get(parentField);
            Id oldParent=previous==null ? parentId : (Id)previous.get(row.Id).get(parentField);
            if(parentId==null || !statuses.containsKey(parentId)) {
                row.addError('Select the parent primary transaction.');
                continue;
            }
            if(statuses.get(parentId)!='Draft' ||
               (oldParent!=null && statuses.get(oldParent)!='Draft')) {
                row.addError('Product lines can only be changed while the primary transaction is Draft.');
                continue;
            }
            if(deleting) continue;
            if(!isReturn && previous!=null && previous.get(row.Id).get('Scheme__c')!=null && row.get('Scheme__c')==null) {
                row.put('Discount_Amount__c',0); row.put('Free_Cases__c',0); row.put('Free_Product__c',null);
                row.put('Free_Pieces_Per_Case__c',null); row.put('Free_Gift__c',null); row.put('Gift_Quantity__c',0);
            }
            Product__c product=products.get((Id)row.get('Product__c'));
            if(product==null || (!isReturn && (!product.Active__c || !product.Sellable__c))) {
                row.addError('Select a valid product; new orders require an active, sellable product.');
                continue;
            }
            Boolean changedProduct=previous!=null &&
                previous.get(row.Id).get('Product__c')!=row.get('Product__c');
            // Snapshot conversion and prices: later catalogue edits must not
            // alter historical orders. Returns may retain the original receipt value.
            if(row.get('Pieces_Per_Case__c')==null || changedProduct)
                row.put('Pieces_Per_Case__c',product.Units_Per_Case__c);
            String priceField=isReturn ? 'Case_Value__c' : 'Case_Price__c';
            if(row.get(priceField)==null || changedProduct)
                row.put(priceField,product.DMS_Case_Price__c);
            if(!isReturn && (row.get('Tax_Percent__c')==null || changedProduct))
                row.put('Tax_Percent__c',product.GST_Percent__c==null ? 0 : product.GST_Percent__c);
            Decimal cases=(Decimal)row.get('Cases__c');
            Decimal pieces=(Decimal)row.get('Pieces_Per_Case__c');
            Decimal price=(Decimal)row.get(priceField);
            if(cases==null || cases<=0 || cases!=cases.setScale(0) || pieces==null || pieces<=0 || pieces!=pieces.setScale(0) ||
                price==null || price<0 || (!isReturn && price==0)) {
                row.addError('Enter positive whole cases and pieces per case, and a valid case price. Order case price must be greater than zero.');
            }
        }
        if(!isReturn && !deleting) DmsPrimarySchemes.apply(records);
    }

    public static void updateOrderTotals(List<DMS_Primary_Order_Line__c> records,
        Map<Id,DMS_Primary_Order_Line__c> previous) {
        Set<Id> ids=new Set<Id>();
        for(DMS_Primary_Order_Line__c line:records) {
            ids.add(line.Order__c);
            if(previous!=null) ids.add(previous.get(line.Id).Order__c);
        }
        List<DMS_Primary_Order__c> parents=[SELECT Id,Status__c,Total_Amount__c
            FROM DMS_Primary_Order__c WHERE Id IN :ids FOR UPDATE];
        Map<Id,Decimal> totals=new Map<Id,Decimal>();
        for(AggregateResult result:[SELECT Order__c parent,SUM(Net_Amount__c) amount
            FROM DMS_Primary_Order_Line__c WHERE Order__c IN :ids GROUP BY Order__c]) {
            totals.put((Id)result.get('parent'),(Decimal)result.get('amount'));
        }
        for(DMS_Primary_Order__c parent:parents) {
            // Also blocks undeleting lines into a submitted/decided transaction.
            if(parent.Status__c!='Draft') {
                throw new DmsPrimaryException('Product lines can only be restored while the primary order is Draft.');
            }
            parent.Total_Amount__c=totals.containsKey(parent.Id) ? totals.get(parent.Id) : 0;
        }
        if(!parents.isEmpty()) update parents;
    }
    public class DmsPrimaryException extends Exception {}
}