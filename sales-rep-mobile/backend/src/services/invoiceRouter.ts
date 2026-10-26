import express from "express";
import { ok, fail } from "../utils/http.js";
import { createInvoicePdf } from "./invoicePdf.js";

type Records = (query: string) => Promise<any[]>;
/**
 * Accept only an 18-character alphanumeric invoice or order reference for these routes.
 */
const validId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9]{18}$/.test(value);
const fields = "Id,Name,Status__c,Invoice_Date__c,Primary_Order__c,Primary_Order__r.Name,Sales_Order__c,Sales_Order__r.Name,Bill_To_Name__c,Supplier_Name__c,Outlet__r.Name,Distributor__r.Name,Gross_Amount__c,Discount_Amount__c,Tax_Amount__c,Total_Amount__c,Paid_Amount__c,Balance_Due__c";

/** Mounted after the caller's authentication. Scope is derived only from that session. */
export function createInvoiceRouter(records: Records, scope: (req: express.Request) => Promise<string>) {
  const router = express.Router();
  router.use(async (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      res.locals.invoiceScope = await scope(req);
      if (!res.locals.invoiceScope) return fail(res, 403, "No active invoice access", "FORBIDDEN");
      next();
    } catch (error) { next(error); }
  });
  router.get("/", async (req, res) => {
    const orderId = req.query.orderId;
    if (orderId !== undefined && !validId(orderId)) return fail(res, 400, "Invalid order reference", "VALIDATION_ERROR");
    const orderFilter = orderId ? ` AND (Primary_Order__c='${orderId}' OR Sales_Order__c='${orderId}')` : "";
    const rows = await records(`SELECT ${fields} FROM DMS_Invoice__c WHERE Status__c='Issued' AND (${res.locals.invoiceScope})${orderFilter} ORDER BY CreatedDate DESC,Id DESC LIMIT 201`);
    return ok(res, { items: rows.slice(0, 200), hasMore: rows.length > 200 });
  });
  /**
   * Load one issued invoice within the authenticated scope, attach its saved lines and return
   * either JSON or a downloadable PDF.
   */
  async function detail(req: express.Request, res: express.Response, pdf: boolean) {
    if (!validId(req.params.id)) return fail(res, 400, "Invalid invoice reference", "VALIDATION_ERROR");
    const rows = await records(`SELECT ${fields} FROM DMS_Invoice__c WHERE Id='${req.params.id}' AND Status__c='Issued' AND (${res.locals.invoiceScope}) LIMIT 1`);
    if (!rows[0]) return fail(res, 404, "Invoice not found for your account", "NOT_FOUND");
    const invoice = rows[0];
    invoice.lines = await records(`SELECT Id,Product_Name__c,Product__r.Name,Cases__c,Case_Price__c,Quantity_Pieces__c,Unit_Price__c,Gross_Amount__c,Discount_Amount__c,Tax_Amount__c,Total_Amount__c,Scheme_Name__c,Bonus_Details__c FROM DMS_Invoice_Line__c WHERE Invoice__c='${invoice.Id}' ORDER BY CreatedDate,Id`);
    res.setHeader("Cache-Control", "private, no-store");
    if (!pdf) return ok(res, invoice);
    const buffer = await createInvoicePdf(invoice);
    res.setHeader("Content-Disposition", `attachment; filename="${String(invoice.Name).replace(/[^A-Za-z0-9_-]/g, "-")}.pdf"`);
    return res.type("pdf").send(buffer);
  }
  router.get("/:id/pdf", (req, res) => detail(req, res, true));
  router.get("/:id", (req, res) => detail(req, res, false));
  router.use(((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    return fail(res, 502, "Invoice could not be loaded from Salesforce. Please retry.", "UPSTREAM_ERROR");
  }) as express.ErrorRequestHandler);
  return router;
}
