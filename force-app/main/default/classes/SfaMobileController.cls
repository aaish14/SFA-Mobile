public with sharing class SfaMobileController {
    public class Dashboard {
        @AuraEnabled public String salesRepName;
        @AuraEnabled public Id attendanceId;
        @AuraEnabled public Boolean dayEnded;
        @AuraEnabled public Datetime loginTime;
        @AuraEnabled public Datetime logoutTime;
        @AuraEnabled public Decimal loginLatitude;
        @AuraEnabled public Decimal loginLongitude;
        @AuraEnabled public Decimal logoutLatitude;
        @AuraEnabled public Decimal logoutLongitude;
        @AuraEnabled public String beatName;
        @AuraEnabled public EndDaySummary endDaySummary;
        @AuraEnabled public List<VisitCard> visits = new List<VisitCard>();
        @AuraEnabled public List<ProductCard> products = new List<ProductCard>();
        @AuraEnabled public List<SchemeCard> schemes = new List<SchemeCard>();
    }
    public class EndDaySummary {
        @AuraEnabled public Integer plannedVisits = 0;
        @AuraEnabled public Integer completedVisits = 0;
        @AuraEnabled public Integer missedVisits = 0;
        @AuraEnabled public Integer ordersCaptured = 0;
        @AuraEnabled public Decimal salesValue = 0;
        @AuraEnabled public Integer durationMinutes = 0;
    }
    public class VisitCard {
        @AuraEnabled public Id id;
        @AuraEnabled public String retailerName;
        @AuraEnabled public String address;
        @AuraEnabled public String status;
    }
    public class ProductCard {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String code;
        @AuraEnabled public String brand;
        @AuraEnabled public Decimal price;
        @AuraEnabled public Decimal stock;
        @AuraEnabled public Decimal unitsPerCase;
    }
    public class SchemeCard {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String type;
        @AuraEnabled public String description;
        @AuraEnabled public Date endDate;
    }
    private class IncomingOrderLine {
        public Id productId;
        public Decimal cases;
        public Decimal pieces;
    }

    @AuraEnabled(cacheable=false)
    public static Dashboard getDashboard() {
        Dashboard result = new Dashboard();
        result.salesRepName = [SELECT Name FROM User WHERE Id = :UserInfo.getUserId()].Name;

        List<Attendance__c> attendance = [
            SELECT Id, Start_Time__c, End_Time__c, Start_Latitude__c, Start_Longitude__c,
                   End_Latitude__c, End_Longitude__c
            FROM Attendance__c
            WHERE Sales_Representative__c = :UserInfo.getUserId() AND Attendance_Date__c = :Date.today()
            ORDER BY CreatedDate DESC LIMIT 1
        ];
        if (!attendance.isEmpty()) {
            result.attendanceId = attendance[0].Id;
            result.dayEnded = attendance[0].End_Time__c != null;
            result.loginTime = attendance[0].Start_Time__c;
            result.logoutTime = attendance[0].End_Time__c;
            result.loginLatitude = attendance[0].Start_Latitude__c;
            result.loginLongitude = attendance[0].Start_Longitude__c;
            result.logoutLatitude = attendance[0].End_Latitude__c;
            result.logoutLongitude = attendance[0].End_Longitude__c;
        }

        List<Permanent_Journey_Plan__c> plans = [
            SELECT Id, Beat__c, Beat__r.Name FROM Permanent_Journey_Plan__c
            WHERE Sales_Representative__c = :UserInfo.getUserId() AND Plan_Date__c = :Date.today()
            LIMIT 1
        ];
        if (!plans.isEmpty()) result.beatName = plans[0].Beat__r.Name;

        for (Visit__c visit : [
            SELECT Id, Status__c, Retailer__r.Name, Retailer__r.Address__c
            FROM Visit__c
            WHERE Permanent_Journey_Plan__r.Sales_Representative__c = :UserInfo.getUserId()
              AND Permanent_Journey_Plan__r.Plan_Date__c = :Date.today()
            ORDER BY CreatedDate
        ]) {
            VisitCard card = new VisitCard();
            card.id = visit.Id;
            card.retailerName = visit.Retailer__r.Name;
            card.address = visit.Retailer__r.Address__c;
            card.status = visit.Status__c;
            result.visits.add(card);
        }

        for (Product__c product : [
            SELECT Id, Name, Product_Code__c, Brand__c, Retailer_Base_Price__c, Available_Stock__c, Units_Per_Case__c
            FROM Product__c WHERE Active__c = true ORDER BY Name
        ]) {
            ProductCard card = new ProductCard();
            card.id = product.Id; card.name = product.Name; card.code = product.Product_Code__c;
            card.brand = product.Brand__c; card.price = product.Retailer_Base_Price__c;
            card.stock = product.Available_Stock__c; card.unitsPerCase = product.Units_Per_Case__c;
            result.products.add(card);
        }

        for (Scheme__c scheme : [
            SELECT Id, Name, Scheme_Type__c, Description__c, End_Date__c
            FROM Scheme__c
            WHERE Active__c = true AND Start_Date__c <= :Date.today() AND End_Date__c >= :Date.today()
            ORDER BY End_Date__c
        ]) {
            SchemeCard card = new SchemeCard();
            card.id = scheme.Id; card.name = scheme.Name; card.type = scheme.Scheme_Type__c;
            card.description = scheme.Description__c; card.endDate = scheme.End_Date__c;
            result.schemes.add(card);
        }
        if (result.attendanceId != null) result.endDaySummary = buildEndDaySummary(UserInfo.getUserId());
        return result;
    }

    @AuraEnabled
    public static Id startDay(Decimal latitude, Decimal longitude) {
        List<Attendance__c> existing = [SELECT Id, End_Time__c FROM Attendance__c WHERE Sales_Representative__c = :UserInfo.getUserId() AND Attendance_Date__c = :Date.today() LIMIT 1];
        if (!existing.isEmpty()) {
            if (existing[0].End_Time__c != null) {
                throw new AuraHandledException('Today\'s working day is already completed. Use a fresh demo day or reset the demo attendance.');
            }
            return existing[0].Id;
        }
        Attendance__c attendance = new Attendance__c(
            Sales_Representative__c = UserInfo.getUserId(), Attendance_Date__c = Date.today(),
            Start_Time__c = System.now(), Start_Latitude__c = latitude,
            Start_Longitude__c = longitude, Status__c = 'Started'
        );
        insert attendance;
        return attendance.Id;
    }

    @AuraEnabled
    public static void checkIn(Id visitId) {
        Visit__c visit = lockedVisit(visitId);
        if (visit.Status__c != 'Planned') throw new AuraHandledException('Only a planned visit can be checked in.');
        visit.Status__c = 'Checked In'; visit.Check_In_Time__c = System.now(); update visit;
    }

    @AuraEnabled
    public static void completeVisit(Id visitId) {
        Visit__c visit = lockedVisit(visitId);
        if (visit.Status__c != 'Checked In') throw new AuraHandledException('Check in before completing the visit.');
        visit.Status__c = 'Completed'; visit.Check_Out_Time__c = System.now(); update visit;
    }

    @AuraEnabled
    public static void markVisitMissed(Id visitId, String reason) {
        if (String.isBlank(reason)) throw new AuraHandledException('A missed-visit reason is required.');
        Visit__c visit = lockedVisit(visitId);
        visit.Status__c = 'Missed'; visit.Missed_Reason__c = reason.trim(); visit.Check_Out_Time__c = System.now(); update visit;
    }

    @AuraEnabled
    public static Id saveOrder(Id visitId, String lineJson) {
        Visit__c visit = [SELECT Id, Retailer__c, Status__c FROM Visit__c WHERE Id = :visitId LIMIT 1];
        if (visit.Status__c != 'Checked In') throw new AuraHandledException('An order can only be captured during a checked-in visit.');
        List<IncomingOrderLine> incoming = (List<IncomingOrderLine>) JSON.deserialize(lineJson, List<IncomingOrderLine>.class);
        if (incoming.isEmpty()) throw new AuraHandledException('Add at least one order line.');

        Set<Id> productIds = new Set<Id>();
        for (IncomingOrderLine line : incoming) productIds.add(line.productId);
        Map<Id, Product__c> products = new Map<Id, Product__c>([
            SELECT Id, Retailer_Base_Price__c, Units_Per_Case__c FROM Product__c WHERE Id IN :productIds
        ]);

        Sales_Order__c order = new Sales_Order__c(Visit__c = visit.Id, Retailer__c = visit.Retailer__c, Order_Date__c = Date.today(), Status__c = 'Submitted');
        insert order;
        List<Order_Item__c> items = new List<Order_Item__c>();
        Decimal orderTotal = 0;
        for (IncomingOrderLine line : incoming) {
            Product__c product = products.get(line.productId);
            Decimal cases = line.cases == null ? 0 : line.cases;
            Decimal pieces = line.pieces == null ? 0 : line.pieces;
            Decimal totalPieces = cases * product.Units_Per_Case__c + pieces;
            Decimal amount = totalPieces * product.Retailer_Base_Price__c;
            orderTotal += amount;
            items.add(new Order_Item__c(Sales_Order__c = order.Id, Product__c = product.Id, Case_Quantity__c = cases, Piece_Quantity__c = pieces, Total_Pieces__c = totalPieces, Unit_Price__c = product.Retailer_Base_Price__c, Line_Amount__c = amount));
        }
        insert items;
        order.Total_Amount__c = orderTotal; update order;
        return order.Id;
    }

    @AuraEnabled
    public static EndDaySummary endDay(Id attendanceId, Decimal latitude, Decimal longitude) {
        Attendance__c attendance = [SELECT Id, End_Time__c FROM Attendance__c WHERE Id = :attendanceId AND Sales_Representative__c = :UserInfo.getUserId() LIMIT 1 FOR UPDATE];
        if (attendance.End_Time__c != null) throw new AuraHandledException('The working day is already ended.');
        attendance.End_Time__c = System.now();
        attendance.End_Latitude__c = latitude;
        attendance.End_Longitude__c = longitude;
        attendance.Status__c = 'Completed';
        update attendance;
        return buildEndDaySummary(UserInfo.getUserId());
    }

    private static EndDaySummary buildEndDaySummary(Id salesRepId) {
        EndDaySummary summary = new EndDaySummary();
        List<Visit__c> dailyVisits = [
            SELECT Id, Status__c FROM Visit__c
            WHERE Permanent_Journey_Plan__r.Sales_Representative__c = :salesRepId
              AND Permanent_Journey_Plan__r.Plan_Date__c = :Date.today()
        ];
        summary.plannedVisits = dailyVisits.size();
        Set<Id> visitIds = new Set<Id>();
        for (Visit__c visit : dailyVisits) {
            visitIds.add(visit.Id);
            if (visit.Status__c == 'Completed') summary.completedVisits++;
            if (visit.Status__c == 'Missed') summary.missedVisits++;
        }
        if (!visitIds.isEmpty()) {
            AggregateResult totals = [
                SELECT COUNT(Id) orderCount, SUM(Total_Amount__c) salesTotal
                FROM Sales_Order__c WHERE Visit__c IN :visitIds AND Order_Date__c = :Date.today()
            ];
            summary.ordersCaptured = (Integer) totals.get('orderCount');
            summary.salesValue = (Decimal) totals.get('salesTotal');
            if (summary.salesValue == null) summary.salesValue = 0;
        }
        List<Attendance__c> attendance = [
            SELECT Start_Time__c, End_Time__c FROM Attendance__c
            WHERE Sales_Representative__c = :salesRepId AND Attendance_Date__c = :Date.today()
            ORDER BY CreatedDate DESC LIMIT 1
        ];
        if (!attendance.isEmpty() && attendance[0].Start_Time__c != null && attendance[0].End_Time__c != null) {
            summary.durationMinutes = Integer.valueOf(String.valueOf(
                (attendance[0].End_Time__c.getTime() - attendance[0].Start_Time__c.getTime()) / 60000
            ));
        }
        return summary;
    }

    private static Visit__c lockedVisit(Id visitId) {
        return [SELECT Id, Status__c, Check_In_Time__c, Check_Out_Time__c, Missed_Reason__c FROM Visit__c WHERE Id = :visitId LIMIT 1 FOR UPDATE];
    }
}