import express from "express";
import { z } from "zod";
import { salesforce } from "../salesforce/SalesforceService.js";
import { ok, fail } from "../utils/http.js";
import { DmsTransport, DmsUpstreamError } from "./transport.js";

const id = z.string().regex(/^[A-Za-z0-9]{18}$/);
const transport = new DmsTransport((refresh) => salesforce.dmsSession(refresh));
type Dependencies = {
  records: (query: string) => Promise<any[]>;
  command: (body: Record<string, unknown>) => Promise<any>;
};
/**
 * Build employee primary-order/return routes behind the SFA authentication middleware, requiring
 * an active employee with an active assigned distributor.
 */
export function createEmployeeDmsRouter(
  deps: Dependencies = {
    records: (q) => salesforce.records(q),
    command: (b) => transport.command(b),
  },
) {
  const router = express.Router();
  // Mounted AFTER SFA's existing authentication middleware, not the distributor router.
  router.use(async (req, res, next) => {
    const employeeId = id.safeParse((req as any).auth?.employeeId);
    if (!employeeId.success)
      return fail(
        res,
        403,
        "An active Salesforce employee session is required",
        "EMPLOYEE_REQUIRED",
      );
    const employees = await deps.records(
      `SELECT Id,Name,DMS_Distributor__c,DMS_Distributor__r.Name,DMS_Distributor__r.Officer__r.Name,DMS_Distributor__r.Geography__r.Name FROM Employee__c WHERE Id='${employeeId.data}' AND Active__c=true AND DMS_Distributor__r.Active__c=true LIMIT 1`,
    );
    if (!employees[0]?.DMS_Distributor__c)
      return fail(
        res,
        403,
        "Assign this employee to an active DMS distributor first",
        "DISTRIBUTOR_REQUIRED",
      );
    (req as any).dmsEmployee = employees[0];
    next();
  });
  router.get("/catalogue", async (req, res) => {
    const employee = (req as any).dmsEmployee,
      distributorId = employee.DMS_Distributor__c;
    const products = await deps.records(
      "SELECT Id,Name,Product_Code__c,Units_Per_Case__c,DMS_Case_Price__c,GST_Percent__c FROM Product__c WHERE Active__c=true AND Sellable__c=true ORDER BY Name LIMIT 2000",
    );
    const orders = await deps.records(
      `SELECT Id,Name,Status__c,Total_Amount__c,Order_Date__c FROM DMS_Primary_Order__c WHERE Employee__c='${employee.Id}' ORDER BY CreatedDate DESC LIMIT 100`,
    );
    const returns = await deps.records(
      `SELECT Id,Name,Status__c,Total_Amount__c,Return_Date__c FROM DMS_Primary_Return__c WHERE Employee__c='${employee.Id}' ORDER BY CreatedDate DESC LIMIT 100`,
    );
    const receipts = await deps.records(
      `SELECT Id,Product__r.Name,Received_Cases__c,Free_Cases__c,Case_Cost__c,Batch_Number__c,Expiry_Date__c FROM DMS_Goods_Receipt_Line__c WHERE Goods_Receipt__r.Distributor__c='${distributorId}' AND Goods_Receipt__r.Status__c='Received' ORDER BY CreatedDate DESC LIMIT 200`,
    );
    const schemes = await deps.records(
      "SELECT Id,Name,Product__c,Region__c,Minimum_Cases__c,Free_Cases__c,Free_Product__r.Name,Discount_Percent__c,Discount_Amount__c,Free_Gift__c,Gift_Quantity__c,(SELECT Product__c FROM Scheme_Products__r WHERE Active__c=true) FROM Scheme__c WHERE Active__c=true AND Sales_Channel__c='Primary' AND Outlet_Type__c=null AND (Start_Date__c=null OR Start_Date__c<=TODAY) AND (End_Date__c=null OR End_Date__c>=TODAY) ORDER BY Name LIMIT 2000",
    );
    return ok(res, {
      employee,
      products,
      orders,
      returns,
      receipts,
      schemes: schemes.filter(
        (row) =>
          !row.Region__c || row.Region__c === employee.DMS_Distributor__r?.Geography__r?.Name,
      ),
      retrievedAt: new Date().toISOString(),
    });
  });
  router.post("/submit", async (req, res) => {
    const line = z
      .object({
        productId: id.optional(),
        receiptLineId: id.optional(),
        schemeId: id.optional(),
        cases: z.number().int().positive().max(100000),
        reason: z.enum(["Damaged", "Expired", "Delayed Delivery", "No Demand", "Other"]).optional(),
        notes: z.string().max(1000).optional(),
      })
      .strict();
    const body = z
      .object({
        action: z.enum(["primaryOrder", "primaryReturn"]),
        requestKey: z.string().uuid(),
        notes: z.string().max(1000).optional(),
        lines: z.array(line).min(1).max(50),
      })
      .strict()
      .parse(req.body);
    for (const entry of body.lines) {
      if (
        body.action === "primaryOrder"
          ? !entry.productId
          : !entry.receiptLineId ||
            !entry.reason ||
            (entry.reason === "Other" && !entry.notes?.trim())
      )
        return fail(
          res,
          400,
          "Select a product or original receipt, cases, and a return reason where needed",
          "VALIDATION_ERROR",
        );
    }
    const employee = (req as any).dmsEmployee;
    return ok(
      res,
      await deps.command({
        ...body,
        employeeId: employee.Id,
        distributorId: employee.DMS_Distributor__c,
      }),
    );
  });
  router.use(((error: any, _req: any, res: any, _next: any) => {
    if (error instanceof z.ZodError)
      return fail(
        res,
        400,
        error.issues.map((issue) => issue.message).join("; "),
        "VALIDATION_ERROR",
      );
    if (error instanceof DmsUpstreamError)
      return fail(res, error.status, error.message, "SALESFORCE_ERROR");
    return fail(
      res,
      502,
      "Salesforce could not confirm the primary transaction. Keep your saved request and retry.",
      "UPSTREAM_ERROR",
    );
  }) as express.ErrorRequestHandler);
  return router;
}
