import PDFDocument from "pdfkit";

/** Render the stored Salesforce snapshot, never client selections or current catalogue prices. */
export function createInvoicePdf(invoice: Record<string, any>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    /**
     * Format a saved invoice amount as INR with two decimal places.
     */
    const money = (value: any) => `INR ${Number(value || 0).toFixed(2)}`;
    /**
     * Flatten line breaks and supply a placeholder for missing invoice display values.
     */
    const text = (value: any) => String(value ?? "-").replace(/[\r\n]+/g, " ");
    const width = doc.page.width - 84;
    /**
     * Start a new PDF page when the next block would exceed the remaining printable height.
     */
    function room(height: number) { if (doc.y + height > doc.page.height - 65) doc.addPage(); }
    doc.fillColor("#16744e").font("Helvetica-Bold").fontSize(23).text("INVOICE");
    doc.fillColor("#173e32").fontSize(12).text(text(invoice.Name));
    doc.font("Helvetica").fontSize(10).moveDown();
    doc.text(`${invoice.Primary_Order__c ? "Primary" : "Secondary"} order: ${text(invoice.Primary_Order__r?.Name || invoice.Sales_Order__r?.Name)}`);
    doc.text(`Invoice date: ${text(invoice.Invoice_Date__c)} | Status: ${text(invoice.Status__c)}`);
    doc.text(`Supplier: ${text(invoice.Supplier_Name__c || invoice.Distributor__r?.Name)}`);
    doc.text(`Bill to: ${text(invoice.Bill_To_Name__c || invoice.Outlet__r?.Name)}`);
    doc.moveDown();
    for (const [index, line] of (invoice.lines || []).entries()) {
      const name = `${index + 1}. ${text(line.Product_Name__c || line.Product__r?.Name)}`;
      const extra = [line.Scheme_Name__c ? `Scheme: ${text(line.Scheme_Name__c)}` : "", line.Bonus_Details__c ? text(line.Bonus_Details__c) : ""].filter(Boolean).join("\n");
      doc.font("Helvetica").fontSize(10);
      const height = doc.heightOfString(name, { width }) + doc.heightOfString(extra || " ", { width }) + 85;
      room(height);
      doc.font("Helvetica-Bold").text(name, { width });
      doc.font("Helvetica").text(line.Cases__c != null
        ? `${line.Cases__c} cases x ${money(line.Case_Price__c)} per case (${line.Quantity_Pieces__c} pieces)`
        : `${line.Quantity_Pieces__c} pieces x ${money(line.Unit_Price__c)} per piece`);
      doc.text(`Gross ${money(line.Gross_Amount__c)} | Discount ${money(line.Discount_Amount__c)} | Tax ${money(line.Tax_Amount__c)}`);
      doc.text(`Line total: ${money(line.Total_Amount__c)}`);
      if (extra) doc.fontSize(9).text(extra, { width });
      doc.moveDown(.7);
      doc.moveTo(42, doc.y).lineTo(42 + width, doc.y).strokeColor("#c6ddcf").stroke();
      doc.moveDown(.7);
    }
    room(170);
    doc.fontSize(11).font("Helvetica");
    for (const [label, field] of [["Gross", "Gross_Amount__c"], ["Discount", "Discount_Amount__c"], ["Tax", "Tax_Amount__c"], ["Total", "Total_Amount__c"], ["Paid", "Paid_Amount__c"], ["Balance due", "Balance_Due__c"]]) {
      doc.text(`${label}: ${money(invoice[field])}`, { align: "right" });
    }
    doc.moveDown().fontSize(8).text("Generated from the saved Salesforce invoice. Issuing this document does not record payment, dispatch or stock receipt. Statutory tax identifiers and legal invoice configuration require company review.", { width });
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor("#526c60").text(`${text(invoice.Name)} | Page ${i + 1} of ${range.count}`, 42, doc.page.height - 40, { lineBreak: false });
    }
    doc.end();
  });
}
