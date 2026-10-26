/** Server-owned pricing. One Primary scheme per paid line; free cases and
 * fixed discounts repeat per complete buy block. Submitted lines are immutable.
 */
public with sharing class DmsPrimarySchemes {
    public static void apply(List<SObject> lines) {
        Set<Id> ids=new Set<Id>(), parents=new Set<Id>();
        for(SObject line:lines) { ids.add((Id)line.get('Scheme__c')); parents.add((Id)line.get('Order__c')); }
        ids.remove(null); if(ids.isEmpty()) return;
        Map<Id,DMS_Primary_Order__c> orders=new Map<Id,DMS_Primary_Order__c>([
            SELECT Id,Distributor__r.Geography__r.Name FROM DMS_Primary_Order__c WHERE Id IN :parents]);
        Map<Id,Scheme__c> schemes=new Map<Id,Scheme__c>([
            SELECT Id,Active__c,Sales_Channel__c,Start_Date__c,End_Date__c,Region__c,Outlet_Type__c,
                Product__c,Minimum_Cases__c,Free_Cases__c,Free_Product__c,Free_Product__r.Units_Per_Case__c,
                Free_Product__r.Active__c,Discount_Percent__c,Discount_Amount__c,Free_Gift__c,Gift_Quantity__c
            FROM Scheme__c WHERE Id IN :ids]);
        Map<Id,Set<Id>> linked=new Map<Id,Set<Id>>();
        for(Scheme_Product__c link:[SELECT Scheme__c,Product__c FROM Scheme_Product__c WHERE Scheme__c IN :ids AND Active__c=true]) {
            if(!linked.containsKey(link.Scheme__c)) linked.put(link.Scheme__c,new Set<Id>());
            linked.get(link.Scheme__c).add(link.Product__c);
        }
        for(SObject line:lines) {
            if(line.get('Scheme__c')==null) continue;
            Scheme__c scheme=schemes.get((Id)line.get('Scheme__c'));
            Id productId=(Id)line.get('Product__c');
            DMS_Primary_Order__c order=orders.get((Id)line.get('Order__c'));
            if(scheme==null||!scheme.Active__c||scheme.Sales_Channel__c!='Primary'||
                (scheme.Start_Date__c!=null&&scheme.Start_Date__c>Date.today())||
                (scheme.End_Date__c!=null&&scheme.End_Date__c<Date.today())||
                (scheme.Product__c!=productId&&(!linked.containsKey(scheme.Id)||!linked.get(scheme.Id).contains(productId)))||
                !String.isBlank(scheme.Outlet_Type__c)||
                (!String.isBlank(scheme.Region__c)&&scheme.Region__c!=order?.Distributor__r?.Geography__r?.Name)) {
                line.addError('Select an active Primary scheme linked to this product and distributor geography, within its dates. Outlet-only schemes cannot be used.'); continue;
            }
            Decimal cases=(Decimal)line.get('Cases__c'), price=(Decimal)line.get('Case_Price__c');
            Decimal minimum=scheme.Minimum_Cases__c, free=zero(scheme.Free_Cases__c), gifts=zero(scheme.Gift_Quantity__c);
            Decimal percent=zero(scheme.Discount_Percent__c), fixed=zero(scheme.Discount_Amount__c);
            if(cases==null||price==null||minimum==null||minimum<=0||minimum!=minimum.setScale(0)||cases<minimum||
                free<0||free!=free.setScale(0)||gifts<0||gifts!=gifts.setScale(0)||percent<0||percent>100||fixed<0) {
                line.addError('Configure whole buy/free cases and meet Minimum Cases; discount must be valid.'); continue;
            }
            Decimal blocks=(cases/minimum).round(System.RoundingMode.FLOOR);
            Decimal discount=(cases*price*percent/100+blocks*fixed).setScale(2);
            if(discount>cases*price) { line.addError('Scheme discount exceeds the paid line value.'); continue; }
            Decimal conversion=(Decimal)line.get('Pieces_Per_Case__c');
            Id freeProduct=scheme.Free_Product__c==null?productId:scheme.Free_Product__c;
            if(free>0&&scheme.Free_Product__c!=null) {
                conversion=scheme.Free_Product__r.Units_Per_Case__c;
                if(!scheme.Free_Product__r.Active__c||conversion==null||conversion<=0||conversion!=conversion.setScale(0)) {
                    line.addError('Free product must be active with a positive whole case conversion.'); continue;
                }
            }
            line.put('Discount_Amount__c',discount); line.put('Free_Cases__c',blocks*free);
            line.put('Free_Product__c',free>0?freeProduct:null); line.put('Free_Pieces_Per_Case__c',free>0?conversion:null);
            line.put('Free_Gift__c',scheme.Free_Gift__c); line.put('Gift_Quantity__c',blocks*gifts);
        }
    }
    private static Decimal zero(Decimal amount) { return amount==null?0:amount; }
}