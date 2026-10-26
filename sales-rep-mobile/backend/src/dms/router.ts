import express from "express";
import jwt from "jsonwebtoken";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { salesforce } from "../salesforce/SalesforceService.js";
import { escapeSoqlLiteral } from "../utils/salesforce.js";
import { ok, fail } from "../utils/http.js";
import { DmsTransport, DmsUpstreamError } from "./transport.js";
import { distributorDashboard } from "./dashboard.js";
import { distributorReports } from "./reports.js";
import { primaryCatalogue } from "./primaryCatalogue.js";
import { createInvoiceRouter } from "../services/invoiceRouter.js";

const audience = "dms-distributor";
/**
 * Derive the distributor JWT signing key from the server secret and DMS audience without
 * exposing the secret to clients.
 */
const secret = () => createHmac("sha256", env.JWT_SECRET).update(audience).digest("hex");
/**
 * Hash a submitted sign-in code for comparison with the stored digest.
 */
const hash = (code: string) => createHash("sha256").update(code).digest();
const emailInput = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const idInput = z.string().regex(/^[A-Za-z0-9]{18}$/);
const keyInput = z.string().uuid();
type Claims = { distributorId: string; email: string };
type Request = express.Request & { distributor?: any };
type Dependencies = {
  records: (query: string) => Promise<any[]>;
  command: (body: Record<string, unknown>) => Promise<any>;
  sendCode: (email: string, code: string) => Promise<void>;
};
const transport = new DmsTransport((refresh) => salesforce.dmsSession(refresh));
const dependencies: Dependencies = {
  records: (query) => transport.records(query, env.SALESFORCE_API_VERSION),
  command: (body) => transport.command(body),
  sendCode: async (email, code) => {
    const response = await salesforce.invokeStandardAction("emailSimple", [
      {
        recipientAddresses: [email],
        emailSubject: "Your DMS distributor sign-in code",
        emailBody: `Your one-use DMS sign-in code is ${code}. It expires in 10 minutes. Ignore this message if you did not request it.`,
        sendRichBody: false,
        senderType: "CurrentUser",
      },
    ]);
    if (!response?.[0]?.isSuccess) throw new Error("Email delivery failed");
  },
};

/**
 * Build distributor authentication, scoped read and transaction routes with injectable
 * dependencies. Code challenges and throttling state are held in this router instance.
 */
export function createDmsRouter(deps: Dependencies = dependencies) {
  const router = express.Router();
  const codes = new Map<string, { digest: Buffer; expires: number; attempts: number }>();
  const limits = new Map<string, { count: number; expires: number }>();
  /**
   * Count attempts within a time window, expire stale counters and report when the configured
   * limit is exceeded.
   */
  function limited(key: string, max: number, windowMs: number) {
    const now = Date.now();
    for (const [key, value] of limits) if (value.expires < now) limits.delete(key);
    const value = limits.get(key) || { count: 0, expires: now + windowMs };
    value.count++;
    if (limits.size > 5000 && !limits.has(key)) return true;
    limits.set(key, value);
    return value.count > max;
  }
  /**
   * Look up the distributor matching the requested login email using the configured record
   * reader.
   */
  async function find(email: string) {
    const rows = await deps.records(
      `SELECT Id,Name,Login_Email__c,Officer__r.Name,Officer__r.IsActive,Geography__r.Name,Active__c FROM DMS_Distributor__c WHERE Active__c=true AND Login_Email__c='${escapeSoqlLiteral(email)}' LIMIT 2`,
    );
    return rows.length === 1 ? rows[0] : undefined;
  }
  router.post("/auth/request-code", async (req, res) => {
    const parsed = emailInput.safeParse(req.body?.email);
    if (!parsed.success) return fail(res, 400, "Enter a valid email address", "VALIDATION_ERROR");
    const email = parsed.data;
    if (limited(`ip:${req.ip}`, 20, 600_000) || limited(`email:${email}`, 1, 60_000))
      return fail(res, 429, "Please wait before requesting another code", "RATE_LIMITED");
    const distributor = await find(email);
    if (distributor) {
      // A resend replaces the previous challenge only after the email is accepted.
      // Ensure the new value is different even in the unlikely event of an RNG repeat.
      let code: string;
      do {
        code = String(randomInt(100000, 1000000));
      } while (codes.get(email)?.digest.equals(hash(code)));
      for (const [email, entry] of codes) if (entry.expires < Date.now()) codes.delete(email);
      if (codes.size >= 5000) return fail(res, 503, "Please retry later", "BUSY");
      try {
        await deps.sendCode(email, code);
      } catch {
        return fail(
          res,
          503,
          "The sign-in email could not be sent. Please retry later.",
          "EMAIL_FAILED",
        );
      }
      codes.set(email, {
        digest: hash(code),
        expires: Date.now() + 600_000,
        attempts: 0,
      });
    }
    return ok(
      res,
      { expiresInMinutes: 10 },
      "If this is a unique active distributor login, a code has been sent.",
    );
  });
  router.post("/auth/verify-code", async (req, res) => {
    const parsed = emailInput.safeParse(req.body?.email);
    if (!parsed.success || !/^\d{6}$/.test(String(req.body.code || "")))
      return fail(res, 401, "Invalid or expired code", "INVALID_CODE");
    const email = parsed.data,
      entry = codes.get(email);
    if (
      !entry ||
      entry.expires < Date.now() ||
      ++entry.attempts > 5 ||
      !timingSafeEqual(entry.digest, hash(String(req.body.code)))
    ) {
      if (entry && (entry.attempts >= 5 || entry.expires < Date.now())) codes.delete(email);
      return fail(res, 401, "Invalid or expired code", "INVALID_CODE");
    }
    codes.delete(email);
    const distributor = await find(email);
    if (!distributor)
      return fail(res, 403, "Distributor login is no longer active or unique", "DISABLED");
    return ok(res, {
      token: jwt.sign({ distributorId: distributor.Id, email }, secret(), {
        algorithm: "HS256",
        audience,
        expiresIn: "8h",
      }),
      user: { id: distributor.Id, name: distributor.Name },
    });
  });
  router.use(async (req, res, next) => {
    let claims: Claims;
    try {
      claims = jwt.verify(req.headers.authorization?.replace(/^Bearer /, "") || "", secret(), {
        algorithms: ["HS256"],
        audience,
      }) as Claims;
      idInput.parse(claims.distributorId);
      emailInput.parse(claims.email);
    } catch {
      return fail(res, 401, "Please sign in to DMS again", "UNAUTHORIZED");
    }
    const row = await find(claims.email);
    if (!row || row.Id !== claims.distributorId)
      return fail(res, 403, "Distributor login is disabled or changed", "DISABLED");
    (req as Request).distributor = row;
    next();
  });
  router.use("/invoices", createInvoiceRouter(deps.records, async req => `Distributor__c='${(req as Request).distributor.Id}'`));
  router.get("/overview", async (request, res) => {
    const distributor = (request as Request).distributor,
      id = distributor.Id;
    const outletFilter = `SELECT Id FROM Retailer__c WHERE DMS_Distributor__c='${id}'`;
    const queries: Record<string, string> = {
      outlets: `SELECT Id,Name,Beat__c,Beat__r.Name,Active__c FROM Retailer__c WHERE DMS_Distributor__c='${id}'`,
      primaryOrders: `SELECT Id,Name,Status__c,Order_Date__c,Order_Source__c,Employee__r.Name,Total_Amount__c,(SELECT Id,Product__r.Name,Cases__c,Pieces_Per_Case__c,Case_Price__c,Net_Amount__c,Scheme__r.Name,Discount_Amount__c,Free_Cases__c,Free_Product__r.Name,Free_Gift__c,Gift_Quantity__c FROM Order_Lines__r) FROM DMS_Primary_Order__c WHERE Distributor__c='${id}'`,
      secondaryOrders: `SELECT Id,Name,DMS_Status__c,DMS_Decision_Notes__c,Retailer__r.Name,Order_Date__c,Total_Amount__c FROM Sales_Order__c WHERE DMS_Distributor__c='${id}'`,
      secondaryLines: `SELECT Id,Sales_Order__c,Product__r.Name,Piece_Quantity__c,Line_Amount__c FROM Order_Item__c WHERE Sales_Order__r.DMS_Distributor__c='${id}'`,
      returns: `SELECT Id,Name,Outlet__r.Name,Product__r.Name,Quantity__c,Return_Reason__c,DMS_Status__c,DMS_Decision_Notes__c FROM Product_Return__c WHERE DMS_Distributor__c='${id}'`,
      primaryReturns: `SELECT Id,Name,Status__c,Employee__r.Name,Total_Cases__c,Total_Amount__c FROM DMS_Primary_Return__c WHERE Distributor__c='${id}'`,
      inventory: `SELECT Id,Product__r.Name,Batch_Number__c,Expiry_Date__c,On_Hand_Pieces__c,Available_Pieces__c,Low_Stock__c,Expired__c,Reorder_Level_Pieces__c FROM DMS_Inventory__c WHERE Distributor__c='${id}'`,
      receipts: `SELECT Id,Name,Status__c,Received_Date__c,Total_Value__c,Total_Pieces__c FROM DMS_Goods_Receipt__c WHERE Distributor__c='${id}'`,
      invoices: `SELECT Id,Name,Status__c,Invoice_Date__c,Outlet__r.Name,Total_Amount__c,Balance_Due__c FROM DMS_Invoice__c WHERE Distributor__c='${id}'`,
      tickets: `SELECT Id,Name,Subject__c,Category__c,Description__c,Status__c,Resolution__c,Officer__r.Name FROM DMS_Support_Ticket__c WHERE Distributor__c='${id}'`,
      outletTickets: `SELECT Id,Name,Subject__c,Description__c,Status__c,Outlet__r.Name FROM SFA_Ticket__c WHERE Outlet__c IN (${outletFilter})`,
      stockChecks: `SELECT Id,Product__r.Name,Outlet__r.Name,Quantity__c,CreatedDate FROM Stock_Check__c WHERE Outlet__c IN (${outletFilter})`,
      assets: `SELECT Id,Name,Asset_Name__c,Asset_Code__c,Status__c,Given_Date__c,Picture_URL__c,Outlet__r.Name,Visit__r.Employee__r.Name,CreatedDate FROM Asset_Survey__c WHERE Outlet__c IN (${outletFilter})`,
    };
    const result: Record<string, any> = {
      distributor,
      retrievedAt: new Date().toISOString(),
      limitPerList: 200,
    };
    // Sequential bounded queries avoid flooding the existing SFA Salesforce connection.
    for (const [name, query] of Object.entries(queries))
      result[name] = await deps.records(`${query} ORDER BY CreatedDate DESC LIMIT 200`);
    for (const order of result.secondaryOrders)
      order.lines = result.secondaryLines.filter((line: any) => line.Sales_Order__c === order.Id);
    result.truncatedLists = Object.keys(queries).filter((name) => result[name].length === 200);
    delete result.secondaryLines;
    result.dashboard = await distributorDashboard(id, deps.records);
    return ok(res, result);
  });
  router.get("/primary/catalogue", async (request, res) => {
    return ok(res, await primaryCatalogue((request as Request).distributor, deps.records));
  });
  router.post("/primary/orders", async (request, res) => {
    const body = z
      .object({
        requestKey: keyInput,
        notes: z.string().max(1000).optional(),
        lines: z
          .array(
            z
              .object({
                productId: idInput,
                cases: z.number().int().positive().max(100000),
                schemeId: idInput.optional(),
              })
              .strict(),
          )
          .min(1)
          .max(50),
      })
      .strict()
      .parse(request.body);
    if (new Set(body.lines.map((line) => line.productId)).size !== body.lines.length)
      return fail(res, 400, "Combine repeated products into one line", "VALIDATION_ERROR");
    return ok(
      res,
      await deps.command({
        ...body,
        action: "distributorPrimaryOrder",
        distributorId: (request as Request).distributor.Id,
      }),
    );
  });
  router.get("/reports", async (request, res) => {
    return ok(res, await distributorReports((request as Request).distributor.Id, deps.records));
  });
  router.post("/tickets", async (request, res) => {
    const body = z
      .object({
        requestKey: keyInput,
        subject: z.string().trim().min(1).max(180),
        category: z.enum(["Product", "Portal", "Delivery"]),
        description: z.string().trim().min(1).max(32000),
      })
      .parse(request.body);
    return ok(
      res,
      await deps.command({
        ...body,
        action: "ticket",
        distributorId: (request as Request).distributor.Id,
      }),
    );
  });
  router.post("/transactions", async (request, res) => {
    const base = { recordId: idInput, notes: z.string().max(255).optional() };
    const body = z
      .discriminatedUnion("action", [
        z.object({
          ...base,
          action: z.literal("secondaryDecision"),
          decision: z.enum(["Approved", "Rejected"]),
        }),
        z.object({
          ...base,
          action: z.literal("returnDecision"),
          decision: z.enum(["Approved", "Rejected"]),
        }),
        z.object({
          action: z.literal("receiveGoods"),
          receiptKind: z.enum(["Paid", "Free"]).optional(),
          recordId: idInput,
          requestKey: keyInput,
          cases: z.number().int().positive().max(100000),
          batch: z.string().trim().min(1).max(80),
          expiry: z.iso.date(),
        }),
      ])
      .parse(request.body);
    if ("decision" in body && body.decision === "Rejected" && !body.notes?.trim())
      return fail(res, 400, "Enter a rejection reason", "VALIDATION_ERROR");
    return ok(
      res,
      await deps.command({
        ...body,
        distributorId: (request as Request).distributor.Id,
      }),
    );
  });
  router.use((_req, res) => fail(res, 404, "DMS endpoint not found", "NOT_FOUND"));
  router.use(((error: any, _req: any, res: any, _next: any) => {
    if (error instanceof z.ZodError)
      return fail(
        res,
        400,
        error.issues.map((item) => `${item.path.join(".")}: ${item.message}`).join("; "),
        "VALIDATION_ERROR",
      );
    if (error instanceof DmsUpstreamError)
      return fail(res, error.status, error.message, "SALESFORCE_ERROR");
    return fail(
      res,
      502,
      "Salesforce is unavailable or the DMS configuration is incomplete. Please retry or contact the administrator.",
      "UPSTREAM_ERROR",
    );
  }) as express.ErrorRequestHandler);
  return router;
}
