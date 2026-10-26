/**
 * Trigger-only invoice posting. An invoice is a snapshot of the confirmed order,
 * not a stock dispatch, payment, or goods receipt. No client-supplied totals are used.
 * Parent DML locks plus a unique source key prevent duplicate invoices on retries.
 */
public without sharing class DmsInvoiceService {
    public class InvoiceException extends Exception {
    }

    /**
     * Issue final invoices for primary orders transitioning to Approved. Snapshot the approved
     * lines and skip orders already invoiced.
     */
    public static void primary(
        List<DMS_Primary_Order__c> records,
        Map<Id, DMS_Primary_Order__c> previous
    ) {
        Set<Id> ids = new Set<Id>();
        for (DMS_Primary_Order__c row : records) {
            if (
                row.Status__c == 'Approved' &&
                (previous == null ||
                previous.get(row.Id).Status__c != 'Approved')
            )
                ids.add(row.Id);
        }
        if (ids.isEmpty())
            return;
        Map<Id, DMS_Invoice__c> headers = new Map<Id, DMS_Invoice__c>();
        Map<Id, Decimal> totals = new Map<Id, Decimal>();
        Set<String> existing = existingKeys(ids);
        for (DMS_Primary_Order__c row : [
            SELECT Id, Distributor__c, Distributor__r.Name, Total_Amount__c
            FROM DMS_Primary_Order__c
            WHERE Id IN :ids AND Status__c = 'Approved'
        ]) {
            if (existing.contains(String.valueOf(row.Id)))
                continue;
            headers.put(
                row.Id,
                new DMS_Invoice__c(
                    Distributor__c = row.Distributor__c,
                    Primary_Order__c = row.Id,
                    Source_Key__c = String.valueOf(row.Id),
                    Invoice_Date__c = Date.today(),
                    Bill_To_Name__c = row.Distributor__r.Name,
                    Supplier_Name__c = UserInfo.getOrganizationName(),
                    Status__c = 'Draft',
                    Notes__c = 'Automatically issued after primary order approval. No payment or stock posting.'
                )
            );
            totals.put(row.Id, row.Total_Amount__c);
        }
        Map<Id, List<DMS_Invoice_Line__c>> details = new Map<Id, List<DMS_Invoice_Line__c>>();
        for (DMS_Primary_Order_Line__c row : [
            SELECT
                Id,
                Order__c,
                Product__c,
                Product__r.Name,
                Cases__c,
                Pieces_Per_Case__c,
                Case_Price__c,
                Discount_Amount__c,
                Tax_Percent__c,
                Net_Amount__c,
                Scheme__c,
                Scheme__r.Name,
                Free_Cases__c,
                Free_Product__r.Name,
                Free_Gift__c,
                Gift_Quantity__c
            FROM DMS_Primary_Order_Line__c
            WHERE Order__c IN :headers.keySet()
            ORDER BY CreatedDate, Id
        ]) {
            Decimal gross = money(row.Cases__c * row.Case_Price__c);
            Decimal discount = money(row.Discount_Amount__c);
            String bonus = (row.Free_Cases__c > 0
                ? String.valueOf(row.Free_Cases__c) + ' free cases: ' + row.Free_Product__r?.Name
                : '');
            if (!String.isBlank(row.Free_Gift__c))
                bonus += ' Gift: ' + row.Free_Gift__c + ' x ' + row.Gift_Quantity__c;
            append(
                details,
                row.Order__c,
                new DMS_Invoice_Line__c(
                    Primary_Order_Line__c = row.Id,
                    Product__c = row.Product__c,
                    Product_Name__c = row.Product__r.Name,
                    Cases__c = row.Cases__c,
                    Case_Price__c = row.Case_Price__c,
                    Quantity_Pieces__c = row.Cases__c * row.Pieces_Per_Case__c,
                    Unit_Price__c = row.Case_Price__c / row.Pieces_Per_Case__c,
                    Discount_Amount__c = discount,
                    Tax_Percent__c = row.Tax_Percent__c,
                    Snapshot_Gross__c = gross,
                    Snapshot_Tax__c = money(row.Net_Amount__c - gross + discount),
                    Snapshot_Total__c = money(row.Net_Amount__c),
                    Scheme__c = row.Scheme__c,
                    Scheme_Name__c = row.Scheme__r?.Name,
                    Bonus_Details__c = bonus.left(255)
                )
            );
        }
        post(headers, details, totals);
    }

    /**
     * Issue final invoices only when an approved secondary order is ready and its lines have
     * been saved. Skip previously issued source orders.
     */
    public static void secondary(List<Sales_Order__c> records, Map<Id, Sales_Order__c> previous) {
        Set<Id> ids = new Set<Id>();
        for (Sales_Order__c row : records) {
            if (
                row.Invoice_Ready__c &&
                row.DMS_Status__c == 'Approved' &&
                new Set<String>{ 'Submitted', 'Fulfilled' }.contains(row.Status__c) &&
                (previous == null ||
                !previous.get(row.Id).Invoice_Ready__c ||
                previous.get(row.Id).DMS_Status__c != 'Approved')
            )
                ids.add(row.Id);
        }
        if (ids.isEmpty())
            return;
        Set<String> existing = existingKeys(ids);
        Map<Id, DMS_Invoice__c> headers = new Map<Id, DMS_Invoice__c>();
        Map<Id, Decimal> totals = new Map<Id, Decimal>();
        for (Sales_Order__c row : [
            SELECT
                Id,
                DMS_Distributor__c,
                DMS_Distributor__r.Name,
                Retailer__c,
                Retailer__r.Name,
                Total_Amount__c
            FROM Sales_Order__c
            WHERE Id IN :ids AND DMS_Distributor__c != NULL
        ]) {
            if (existing.contains(String.valueOf(row.Id)))
                continue;
            headers.put(
                row.Id,
                new DMS_Invoice__c(
                    Distributor__c = row.DMS_Distributor__c,
                    Sales_Order__c = row.Id,
                    Outlet__c = row.Retailer__c,
                    Source_Key__c = String.valueOf(row.Id),
                    Invoice_Date__c = Date.today(),
                    Status__c = 'Draft',
                    Bill_To_Name__c = row.Retailer__r.Name,
                    Supplier_Name__c = row.DMS_Distributor__r.Name,
                    Notes__c = 'Automatically issued after confirmed secondary order approval. No payment or stock posting.'
                )
            );
            totals.put(row.Id, row.Total_Amount__c);
        }
        Map<Id, List<DMS_Invoice_Line__c>> details = new Map<Id, List<DMS_Invoice_Line__c>>();
        for (Order_Item__c row : [
            SELECT
                Id,
                Sales_Order__c,
                Product__c,
                Product__r.Name,
                Piece_Quantity__c,
                Unit_Price__c,
                Line_Amount__c,
                Invoice_Tax_Amount__c,
                Scheme__c,
                Scheme__r.Name
            FROM Order_Item__c
            WHERE Sales_Order__c IN :headers.keySet()
            ORDER BY CreatedDate, Id
        ]) {
            if (
                row.Invoice_Tax_Amount__c == null ||
                row.Line_Amount__c == null ||
                row.Piece_Quantity__c == null ||
                row.Unit_Price__c == null
            )
                throw new InvoiceException(
                    'Save complete order prices and tax before issuing the invoice.'
                );
            Decimal gross = money(row.Piece_Quantity__c * row.Unit_Price__c);
            Decimal tax = money(row.Invoice_Tax_Amount__c);
            Decimal total = money(row.Line_Amount__c);
            append(
                details,
                row.Sales_Order__c,
                new DMS_Invoice_Line__c(
                    Order_Item__c = row.Id,
                    Product__c = row.Product__c,
                    Product_Name__c = row.Product__r.Name,
                    Quantity_Pieces__c = row.Piece_Quantity__c,
                    Unit_Price__c = row.Unit_Price__c,
                    Discount_Amount__c = money(gross + tax - total),
                    Snapshot_Gross__c = gross,
                    Snapshot_Tax__c = tax,
                    Snapshot_Total__c = total,
                    Scheme__c = row.Scheme__c,
                    Scheme_Name__c = row.Scheme__r?.Name
                )
            );
        }
        post(headers, details, totals);
    }

    /**
     * Collect existing invoice source keys and issued parent references so retries do not issue
     * a second invoice.
     */
    private static Set<String> existingKeys(Set<Id> ids) {
        Set<String> keys = new Set<String>();
        for (DMS_Invoice__c invoice : [
            SELECT Source_Key__c, Status__c, Primary_Order__c, Sales_Order__c
            FROM DMS_Invoice__c
            WHERE Primary_Order__c IN :ids OR Sales_Order__c IN :ids
        ]) {
            if (invoice.Source_Key__c != null)
                keys.add(invoice.Source_Key__c);
            if (invoice.Status__c == 'Issued')
                keys.add(
                    String.valueOf(
                        invoice.Primary_Order__c == null
                            ? invoice.Sales_Order__c
                            : invoice.Primary_Order__c
                    )
                );
        }
        return keys;
    }
    /**
     * Treat missing monetary values as zero and round to two decimal places for invoice
     * comparisons.
     */
    private static Decimal money(Decimal value) {
        return (value == null ? 0 : value).setScale(2);
    }
    /**
     * Group an invoice line under its source parent for subsequent invoice assembly.
     */
    private static void append(
        Map<Id, List<DMS_Invoice_Line__c>> rows,
        Id parent,
        DMS_Invoice_Line__c line
    ) {
        if (!rows.containsKey(parent))
            rows.put(parent, new List<DMS_Invoice_Line__c>());
        rows.get(parent).add(line);
    }
    /**
     * Require nonempty lines and matching totals before inserting invoice headers and lines,
     * then mark the invoices Issued. This does not receive stock or collect payment.
     */
    private static void post(
        Map<Id, DMS_Invoice__c> headers,
        Map<Id, List<DMS_Invoice_Line__c>> details,
        Map<Id, Decimal> totals
    ) {
        if (headers.isEmpty())
            return;
        // Validate all parents before inserting any header. Failure rolls back the order/approval too.
        for (Id parent : headers.keySet()) {
            if (!details.containsKey(parent) || details.get(parent).isEmpty())
                throw new InvoiceException('An invoice requires at least one product.');
            Decimal actual = 0;
            for (DMS_Invoice_Line__c line : details.get(parent))
                actual += line.Snapshot_Total__c;
            if (totals.get(parent) == null || actual != money(totals.get(parent)))
                throw new InvoiceException(
                    'Order total must match its product lines before invoicing.'
                );
        }
        insert headers.values();
        List<DMS_Invoice_Line__c> lines = new List<DMS_Invoice_Line__c>();
        for (Id parent : headers.keySet())
            for (DMS_Invoice_Line__c line : details.get(parent)) {
                line.Invoice__c = headers.get(parent).Id;
                lines.add(line);
            }
        insert lines;
        for (DMS_Invoice__c invoice : headers.values())
            invoice.Status__c = 'Issued';
        update headers.values();
    }
}
