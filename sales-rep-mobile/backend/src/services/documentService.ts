import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import type { VisitPayload } from "../types.js";
export async function createPdf(visit: VisitPayload) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 42 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(20).fillColor("#0B5CAB").text("SFA Store Visit Summary");
    doc.moveDown().fontSize(11).fillColor("#172B4D");
    [
      ["Store", visit.storeName],
      ["Beat", visit.beatName],
      ["Status", visit.status],
      ["Visit start", visit.checkIn?.timestamp || "-"],
      ["Visit end", visit.checkOut?.timestamp || "-"],
    ].forEach(([a, b]) => doc.text(`${a}: ${b}`));
    doc.moveDown().fontSize(14).text("Order details");
    visit.orderLines.forEach((l) =>
      doc
        .fontSize(10)
        .text(
          `${l.productName} | ${l.quantity} × INR ${l.unitPrice} | Discount INR ${l.discount} | INR ${l.amount}`,
        ),
    );
    const appliedSchemes = visit.orderLines.filter((line) => line.schemeName);
    if (appliedSchemes.length) {
      doc.moveDown().fontSize(14).text("Applied schemes");
      appliedSchemes.forEach((line) => doc.fontSize(10).text(`${line.productName}: ${line.schemeName}`));
    }
    doc
      .moveDown()
      .text(`Total: INR ${visit.orderLines.reduce((s, l) => s + l.amount, 0)}`);
    doc.text(
      `Returns: ${visit.returns.length}  Competitor activities: ${visit.competitors.length}  Tickets: ${visit.tickets.length}`,
    );
    doc.end();
  });
}
export async function createExcel(visit: VisitPayload) {
  const book = new ExcelJS.Workbook();
  const summary = book.addWorksheet("Visit Summary");
  summary.addRows([
    ["Store", visit.storeName],
    ["Beat", visit.beatName],
    ["Status", visit.status],
    ["Start", visit.checkIn?.timestamp],
    ["End", visit.checkOut?.timestamp],
  ]);
  const orders = book.addWorksheet("Order Details");
  orders.addRow(["Product", "Quantity", "Unit Price", "Discount", "Applied Scheme", "Amount"]);
  visit.orderLines.forEach((l) =>
    orders.addRow([
      l.productName,
      l.quantity,
      l.unitPrice,
      l.discount,
      l.schemeName || "",
      l.amount,
    ]),
  );
  for (const [name, rows] of [
    ["Returns", visit.returns],
    ["Competitor Activity", visit.competitors],
    ["Tickets", visit.tickets],
  ] as const) {
    const sheet = book.addWorksheet(name);
    if (rows.length) {
      sheet.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
      sheet.addRows(rows);
    } else sheet.addRow(["No records"]);
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
