import express from "express";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { env, objectMap } from "./config/env.js";
import { rep, schemes, beats, stores, products } from "./data/mock.js";
import { ok, fail } from "./utils/http.js";
import { distanceInMeters } from "./utils/distance.js";
import { createPdf, createExcel } from "./services/documentService.js";
import { salesforce } from "./salesforce/SalesforceService.js";
import type { VisitPayload } from "./types.js";
import {
  createLoginCode,
  findMockEmployee,
  verifyLoginCode,
  type EmployeeIdentity,
} from "./services/authService.js";
import {
  emailDeliveryIsConfigured,
  sendEmployeeLoginCode,
  sendRetailerOrderSummary,
} from "./services/emailService.js";
import { escapeSoqlLiteral } from "./utils/salesforce.js";
import { allocatedBeats } from "./services/allocatedBeats.js";
export const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "5mb" }));
const visits = new Map<string, VisitPayload>();
const idempotency = new Map<string, unknown>();
const sfRecords = async (soql: string) => salesforce.records(soql);
const allocatedOutletIds = (employeeId: string) =>
  `SELECT Outlet__c FROM ${objectMap.distributorAllocation} WHERE Employee__c = '${employeeId}' AND Allocation_Status__c = 'Active'`;
type AuthClaims = {
  sub: string;
  displayName: string;
  employeeId: string;
  employeeName: string;
  salesforceUserId?: string;
  beatId?: string;
  beatName?: string;
};
type AuthenticatedRequest = express.Request & { auth?: AuthClaims };
const protect: express.RequestHandler = (request, res, next) => {
  const req = request as AuthenticatedRequest;
  const token = req.headers.authorization?.replace("Bearer ", "");
  try {
    if (!token) throw new Error("Missing token");
    req.auth = jwt.verify(token, env.JWT_SECRET) as AuthClaims;
    next();
  } catch {
    return fail(res, 401, "Please login again", "UNAUTHORIZED");
  }
};
app.get("/api/health", (_, res) =>
  ok(res, { mockMode: env.USE_MOCK_DATA }, "SFA API is ready"),
);
async function findEmployee(email: string): Promise<EmployeeIdentity | undefined> {
  if (env.USE_MOCK_DATA) return findMockEmployee(email);

  const safeEmail = escapeSoqlLiteral(email.trim().toLowerCase());
  const rows = await sfRecords(
    `SELECT Id, Name, Application_Access_Email__c, Login_Email__c, Email__c, Beat__c, Beat__r.Name, Salesforce_User__c, Salesforce_User__r.Name, Salesforce_User__r.Email, Salesforce_User__r.Username, Salesforce_User__r.IsActive FROM ${objectMap.salesRep} WHERE Active__c = true AND (Application_Access_Email__c = '${safeEmail}' OR Login_Email__c = '${safeEmail}' OR Email__c = '${safeEmail}' OR Salesforce_User__r.Email = '${safeEmail}' OR Salesforce_User__r.Username = '${safeEmail}') ORDER BY Employee_Code__c NULLS LAST LIMIT 1`,
  );
  const row = rows[0];
  if (!row || (row.Salesforce_User__c && row.Salesforce_User__r?.IsActive === false)) return undefined;
  return {
    id: row.Id,
    email: String(row.Application_Access_Email__c || row.Login_Email__c || row.Email__c || row.Salesforce_User__r?.Email || row.Salesforce_User__r?.Username),
    displayName: row.Salesforce_User__r?.Name || row.Name,
    employeeName: row.Name,
    salesforceUserId: row.Salesforce_User__c,
    beatId: row.Beat__c,
    beatName: row.Beat__r?.Name,
  };
}

app.post("/api/auth/request-code", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email))
    return fail(res, 400, "Enter a valid email address", "VALIDATION_ERROR");

  const employee = await findEmployee(email);
  if (!employee)
    return fail(res, 403, "No active Employee login is linked to this email", "EMPLOYEE_NOT_FOUND");

  const code = createLoginCode(email);
  if (emailDeliveryIsConfigured()) {
    try {
      await sendEmployeeLoginCode(email, employee.employeeName, code);
    } catch (error) {
      console.error("Unable to deliver the Employee sign-in code", error);
      return fail(
        res,
        502,
        "The sign-in email could not be delivered. Please try again.",
        "EMAIL_DELIVERY_FAILED",
      );
    }
  } else if (!env.AUTH_ALLOW_TEST_CODE) {
    return fail(res, 503, "Email delivery is not configured. Ask the administrator to configure SMTP.", "EMAIL_NOT_CONFIGURED");
  }

  return ok(res, {
    maskedEmail: email.replace(/^(.{2}).*(@.*)$/, "$1***$2"),
    expiresInMinutes: env.AUTH_CODE_TTL_MINUTES,
    ...(env.AUTH_ALLOW_TEST_CODE ? { testCode: code } : {}),
  }, "A sign-in code was sent to the Employee email");
});

app.post("/api/auth/verify-code", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const code = String(req.body.code || "").trim();
  if (!email || !/^\d{6}$/.test(code))
    return fail(res, 400, "Email and a 6-digit code are required", "VALIDATION_ERROR");
  if (!verifyLoginCode(email, code))
    return fail(res, 401, "The sign-in code is invalid or expired", "INVALID_CODE");

  const employee = await findEmployee(email);
  if (!employee)
    return fail(res, 403, "The Employee login is no longer active", "EMPLOYEE_NOT_FOUND");
  const claims: AuthClaims = {
    sub: employee.email,
    displayName: employee.displayName,
    employeeId: employee.id,
    employeeName: employee.employeeName,
    salesforceUserId: employee.salesforceUserId,
    beatId: employee.beatId,
    beatName: employee.beatName,
  };
  return ok(
    res,
    {
      token: jwt.sign(claims, env.JWT_SECRET, { expiresIn: "8h" }),
      user: claims,
    },
    "Signed in successfully",
  );
});
app.use("/api", protect);
app.post("/api/auth/logout", (_req, res) =>
  ok(res, {}, "Signed out successfully"),
);
app.get("/api/auth/session", (request, res) => {
  const req = request as AuthenticatedRequest;
  return ok(res, { user: req.auth });
});
app.get("/api/dashboard", async (request, res) => {
  const req = request as AuthenticatedRequest;
  if (env.USE_MOCK_DATA)
    return ok(res, {
      ...rep,
      userName: req.auth?.displayName,
      employeeName: req.auth?.employeeName,
      schemes,
      dataState: "LIVE",
    });
  const employeeId = escapeSoqlLiteral(req.auth!.employeeId);
  const [users, schemeRows, schemeProductRows, totalOrders, pendingOrders, todayVisits, completedVisits, pendingDeliveries, outstanding] =
    await Promise.all([
      sfRecords("SELECT Name FROM User WHERE IsActive = true ORDER BY LastLoginDate DESC NULLS LAST LIMIT 1"),
      sfRecords(`SELECT Id, Name, Scheme_Code__c, Scheme_Type__c, Description__c, Discount_Percent__c, Minimum_Quantity__c, Free_Quantity__c, Product__r.Name, Free_Product__r.Name, End_Date__c FROM ${objectMap.scheme} WHERE Active__c = true ORDER BY End_Date__c DESC NULLS LAST`),
      sfRecords("SELECT Scheme__c, Product__c, Product__r.Name FROM Scheme_Product__c WHERE Active__c = true"),
      sfRecords(`SELECT COUNT(Id) total FROM ${objectMap.order} WHERE Retailer__c IN (${allocatedOutletIds(employeeId)})`),
      sfRecords(`SELECT COUNT(Id) total FROM ${objectMap.order} WHERE Status__c != 'Completed' AND Retailer__c IN (${allocatedOutletIds(employeeId)})`),
      sfRecords(`SELECT COUNT(Id) total FROM ${objectMap.visit} WHERE Visit_Date__c = TODAY AND Retailer__c IN (${allocatedOutletIds(employeeId)})`),
      sfRecords(`SELECT COUNT(Id) total FROM ${objectMap.visit} WHERE Visit_Date__c = TODAY AND Status__c = 'Completed' AND Retailer__c IN (${allocatedOutletIds(employeeId)})`),
      sfRecords(`SELECT COUNT(Id) total FROM ${objectMap.order} WHERE Status__c IN ('Submitted','Confirmed') AND Retailer__c IN (${allocatedOutletIds(employeeId)})`),
      sfRecords(`SELECT SUM(Outstanding_Amount__c) total FROM ${objectMap.store} WHERE Id IN (${allocatedOutletIds(employeeId)})`),
    ]);
  const mappedSchemes = schemeRows.map((row) => {
    const linkedProducts = schemeProductRows.filter((link) => link.Scheme__c === row.Id);
    return ({
    id: row.Id,
    name: row.Name,
    code: row.Scheme_Code__c,
    type: row.Scheme_Type__c,
    product: row.Product__r?.Name,
    freeProduct: row.Free_Product__r?.Name,
    products: linkedProducts.length
      ? linkedProducts.map((link) => link.Product__r?.Name).filter(Boolean)
      : row.Product__r?.Name ? [row.Product__r.Name] : ["All active products"],
    description: row.Description__c,
    benefit: row.Free_Quantity__c
      ? `Minimum ${row.Minimum_Quantity__c || 0} • Get ${row.Free_Quantity__c} free`
      : `${row.Discount_Percent__c || 0}% discount`,
    endDate: row.End_Date__c,
  });});
  ok(res, {
    employeeName: req.auth?.employeeName,
    userName: req.auth?.displayName || users[0]?.Name,
    loginEmail: req.auth?.sub,
    beatName: req.auth?.beatName,
    totalOrders: Number(totalOrders[0]?.total || 0),
    pendingOrders: Number(pendingOrders[0]?.total || 0),
    todayVisits: Number(todayVisits[0]?.total || 0),
    completedVisits: Number(completedVisits[0]?.total || 0),
    pendingDeliveries: Number(pendingDeliveries[0]?.total || 0),
    outstandingAmount: Number(outstanding[0]?.total || 0),
    schemes: mappedSchemes,
    dataState: "LIVE",
  });
});

app.get("/api/visits", async (request, res) => {
  if (env.USE_MOCK_DATA) return ok(res, []);
  const req = request as AuthenticatedRequest;
  const employeeId = escapeSoqlLiteral(req.auth!.employeeId);
  const rows = await sfRecords(`SELECT Id, Name, Visit_Number__c, Visit_Date__c, Status__c, Check_In_Time__c, Check_Out_Time__c, Check_In_Latitude__c, Check_In_Longitude__c, Check_Out_Latitude__c, Check_Out_Longitude__c, Duration_Minutes__c, Employee__r.Name, Sales_Representative__r.Name, Retailer__c, Retailer__r.Name, Outlet_Name__c, Outlet_Geo_Location__Latitude__s, Outlet_Geo_Location__Longitude__s, Previous_Order_Date__c, Previous_Order_Value__c, Order_Gross_Amount__c, Order_Tax__c, Order_Total__c, Order_Total_Quantity__c FROM ${objectMap.visit} WHERE Retailer__c IN (${allocatedOutletIds(employeeId)}) ORDER BY Check_In_Time__c DESC NULLS LAST, Visit_Date__c DESC, CreatedDate DESC LIMIT 500`);
  ok(res, rows.map((row) => ({
    id: row.Id,
    visitNumber: row.Visit_Number__c,
    name: row.Name,
    date: row.Visit_Date__c,
    status: row.Status__c,
    checkInTime: row.Check_In_Time__c,
    checkOutTime: row.Check_Out_Time__c,
    durationMinutes: row.Duration_Minutes__c,
    checkInLocation: row.Check_In_Latitude__c == null ? null : {
      latitude: row.Check_In_Latitude__c,
      longitude: row.Check_In_Longitude__c,
    },
    checkOutLocation: row.Check_Out_Latitude__c == null ? null : {
      latitude: row.Check_Out_Latitude__c,
      longitude: row.Check_Out_Longitude__c,
    },
    employeeName: row.Employee__r?.Name || row.Sales_Representative__r?.Name,
    outletId: row.Retailer__c,
    outletName: row.Outlet_Name__c || row.Retailer__r?.Name,
    outletLocation: row.Outlet_Geo_Location__Latitude__s == null ? null : {
      latitude: row.Outlet_Geo_Location__Latitude__s,
      longitude: row.Outlet_Geo_Location__Longitude__s,
    },
    previousOrderDate: row.Previous_Order_Date__c,
    previousOrderValue: row.Previous_Order_Value__c,
    order: {
      grossAmount: row.Order_Gross_Amount__c,
      tax: row.Order_Tax__c,
      total: row.Order_Total__c,
      totalQuantity: row.Order_Total_Quantity__c,
    },
  })));
});

app.post("/api/visits", async (request, res) => {
  const req = request as AuthenticatedRequest;
  if (env.USE_MOCK_DATA) return ok(res, { id: `visit-${Date.now()}`, ...req.body }, "Visit created");
  if (!req.body.outletId) return fail(res, 400, "Outlet is required", "OUTLET_REQUIRED");
  const employeeId = escapeSoqlLiteral(req.auth!.employeeId);
  const outletId = escapeSoqlLiteral(String(req.body.outletId));
  const outlets = await sfRecords(
    `SELECT Id, Beat__c FROM ${objectMap.store} WHERE Id = '${outletId}' AND Id IN (${allocatedOutletIds(employeeId)}) LIMIT 1`,
  );
  if (!outlets.length) return fail(res, 404, "Outlet not found", "OUTLET_NOT_FOUND");
  const plans = await sfRecords(
    `SELECT Id FROM ${objectMap.journeyPlan} WHERE Beat__c = '${outlets[0].Beat__c}' AND Status__c = 'Approved' ORDER BY Planned_Date__c DESC LIMIT 1`,
  );
  if (!plans.length)
    return fail(res, 422, "No approved journey plan exists for this outlet.", "APPROVED_PJP_REQUIRED");
  const created: any = await salesforce.create(objectMap.visit, {
    Name: req.body.name || `Mobile Visit ${new Date().toLocaleDateString("en-IN")}`,
    Retailer__c: req.body.outletId,
    Permanent_Journey_Plan__c: plans[0].Id,
    Employee__c: req.auth!.employeeId,
    Sales_Representative__c: req.auth?.salesforceUserId || null,
    Visit_Date__c: req.body.visitDate || new Date().toISOString().slice(0, 10),
    Status__c: req.body.status || "Planned",
    Outlet_Geo_Location__Latitude__s: req.body.location?.latitude,
    Outlet_Geo_Location__Longitude__s: req.body.location?.longitude,
    Previous_Order_Date__c: req.body.previousOrderDate || null,
    Previous_Order_Value__c: Number(req.body.previousOrderValue || 0),
    Order_Gross_Amount__c: Number(req.body.order?.grossAmount || 0),
    Order_Tax__c: Number(req.body.order?.tax || 0),
    Order_Total__c: Number(req.body.order?.total || 0),
    Order_Total_Quantity__c: Number(req.body.order?.totalQuantity || 0),
    Notes__c: req.body.notes || null,
  });
  ok(res, { id: created.id }, "Visit created in Salesforce");
});
app.get("/api/schemes", async (_, res) => {
  if (env.USE_MOCK_DATA) return ok(res, schemes);
  const [rows, schemeProductRows] = await Promise.all([
    sfRecords(`SELECT Id, Name, Scheme_Code__c, Scheme_Type__c, Description__c, Discount_Percent__c, Minimum_Quantity__c, Free_Quantity__c, Product__c, Product__r.Name, Free_Product__c, Free_Product__r.Name, Start_Date__c, End_Date__c FROM ${objectMap.scheme} WHERE Active__c = true AND (End_Date__c = NULL OR End_Date__c >= TODAY) ORDER BY End_Date__c`),
    sfRecords("SELECT Scheme__c, Product__c, Product__r.Name FROM Scheme_Product__c WHERE Active__c = true"),
  ]);
  ok(
    res,
    rows.map((row) => {
      const linkedProducts = schemeProductRows.filter((link) => link.Scheme__c === row.Id);
      return ({
      id: row.Id,
      name: row.Name,
      code: row.Scheme_Code__c,
      type: row.Scheme_Type__c,
      description: row.Description__c,
      discountPercent: row.Discount_Percent__c,
      minimumQuantity: Number(row.Minimum_Quantity__c || 1),
      freeQuantity: Number(row.Free_Quantity__c || 0),
      productId: linkedProducts[0]?.Product__c || row.Product__c,
      product: linkedProducts[0]?.Product__r?.Name || row.Product__r?.Name,
      freeProductId: row.Free_Product__c,
      freeProduct: row.Free_Product__r?.Name,
      productIds: linkedProducts.map((link) => link.Product__c),
      products: linkedProducts.length
        ? linkedProducts.map((link) => link.Product__r?.Name).filter(Boolean)
        : row.Product__r?.Name ? [row.Product__r.Name] : ["All active products"],
      startDate: row.Start_Date__c,
      endDate: row.End_Date__c,
    });}),
  );
});
app.get("/api/products", async (request, res) => {
  if (env.USE_MOCK_DATA) return ok(res, products);
  const req = request as AuthenticatedRequest;
  const outletId = String(request.query.outletId || "").trim();
  let outletScope: any;
  if (outletId) {
    const safeOutletId = escapeSoqlLiteral(outletId);
    const employeeId = escapeSoqlLiteral(req.auth!.employeeId);
    const allowedOutlets = await sfRecords(`SELECT Id, Outlet_Type__c, Geography__c, Geography__r.State__c FROM ${objectMap.store} WHERE Id = '${safeOutletId}' AND Id IN (${allocatedOutletIds(employeeId)}) LIMIT 1`);
    if (!allowedOutlets.length) return fail(res, 404, "Outlet not found", "OUTLET_NOT_FOUND");
    outletScope = allowedOutlets[0];
  }
  const [rows, schemeRows, schemeProductRows, allConfigurationRows] = await Promise.all([
    sfRecords(`SELECT Id, Name, Product_Code__c, Brand__c, Package_Type__c, MRP__c, Retailer_Base_Price__c, Selling_Price__c, GST_Percent__c, Available_Stock__c, Units_Per_Case__c, Active__c FROM ${objectMap.product} WHERE Sellable__c = true AND Active__c = true ORDER BY Name`),
    sfRecords(`SELECT Id, Name, Scheme_Code__c, Scheme_Type__c, Description__c, Discount_Percent__c, Minimum_Quantity__c, Free_Quantity__c, Product__c, End_Date__c FROM ${objectMap.scheme} WHERE Active__c = true AND (End_Date__c = NULL OR End_Date__c >= TODAY) ORDER BY End_Date__c`),
    sfRecords("SELECT Scheme__c, Product__c FROM Scheme_Product__c WHERE Active__c = true"),
    sfRecords(`SELECT Id, Name, Product__c, Configuration_Type__c, Minimum_Quantity__c, Target_Quantity__c, Start_Date__c, End_Date__c, Geography__c, Geography__r.Name, Geography__r.State__c, Channel__c FROM ${objectMap.productSalesConfiguration} WHERE Active__c = true AND Start_Date__c <= TODAY AND (End_Date__c = NULL OR End_Date__c >= TODAY) ORDER BY CreatedDate DESC`),
  ]);
  const normalizeChannel = (value: unknown) => String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  const configurationRows = allConfigurationRows.filter((configuration) => {
    if (!outletScope) return !configuration.Geography__c && (!configuration.Channel__c || configuration.Channel__c === "All Channels");
    const geographyMatches = !configuration.Geography__c || configuration.Geography__c === outletScope.Geography__c || (configuration.Geography__r?.State__c && configuration.Geography__r.State__c === outletScope.Geography__r?.State__c);
    const configuredChannel = normalizeChannel(configuration.Channel__c);
    const outletChannel = normalizeChannel(outletScope.Outlet_Type__c);
    const channelMatches = !configuredChannel || configuredChannel === "allchannels" || configuredChannel === outletChannel || (configuredChannel === "gt" && outletChannel === "generaltrade") || (configuredChannel === "mt" && outletChannel === "moderntrade");
    return geographyMatches && channelMatches;
  });
  let recentOrders: any[] = [];
  let purchaseHistory: any[] = [];
  if (outletId) {
    const safeOutletId = escapeSoqlLiteral(outletId);
    recentOrders = await sfRecords(`SELECT Id, Name, Order_Date__c, Total_Amount__c, Total_Quantity__c FROM ${objectMap.order} WHERE Retailer__c = '${safeOutletId}' ORDER BY Order_Date__c DESC, CreatedDate DESC LIMIT 5`);
    if (recentOrders.length) {
      const orderIds = recentOrders.map((order) => `'${escapeSoqlLiteral(order.Id)}'`).join(",");
      purchaseHistory = await sfRecords(`SELECT Product__c, Product__r.Name, Piece_Quantity__c, Sales_Order__c, Sales_Order__r.Name, Sales_Order__r.Order_Date__c FROM ${objectMap.orderItem} WHERE Sales_Order__c IN (${orderIds}) ORDER BY Sales_Order__r.Order_Date__c DESC`);
    }
  }
  const historyByProduct = new Map<string, any[]>();
  for (const item of purchaseHistory) {
    const history = historyByProduct.get(item.Product__c) || [];
    history.push({ orderId: item.Sales_Order__c, orderNumber: item.Sales_Order__r?.Name, orderDate: item.Sales_Order__r?.Order_Date__c, quantity: Number(item.Piece_Quantity__c || 0) });
    historyByProduct.set(item.Product__c, history);
  }
  const configurationsByProduct = new Map<string, any[]>();
  for (const configuration of configurationRows) {
    const existing = configurationsByProduct.get(configuration.Product__c) || [];
    existing.push(configuration);
    configurationsByProduct.set(configuration.Product__c, existing);
  }
  ok(
    res,
    rows.map((row) => {
      const productConfigurations = configurationsByProduct.get(row.Id) || [];
      const primaryConfiguration = productConfigurations.find((item) => item.Configuration_Type__c === "Must Sell") || productConfigurations[0];
      return ({
      id: row.Id,
      name: row.Name,
      code: row.Product_Code__c,
      brand: row.Brand__c,
      packSize: row.Package_Type__c,
      mrp: row.MRP__c || 0,
      retailerPrice: row.Retailer_Base_Price__c || 0,
      price: row.Selling_Price__c || 0,
      gstPercent: row.GST_Percent__c || 0,
      stock: row.Available_Stock__c || 0,
      unitsPerCase: row.Units_Per_Case__c || 1,
      active: row.Active__c,
      configurationId: primaryConfiguration?.Id,
      configurationName: primaryConfiguration?.Name,
      configuration: primaryConfiguration?.Configuration_Type__c || "Standard",
      minimumQuantity: Number(primaryConfiguration?.Minimum_Quantity__c || 1),
      targetQuantity: Number(primaryConfiguration?.Target_Quantity__c || 0),
      configurationStartDate: primaryConfiguration?.Start_Date__c,
      configurationEndDate: primaryConfiguration?.End_Date__c,
      suggestionSource: productConfigurations.length ? "Configured in Salesforce for this outlet's geography and channel" : undefined,
      configurations: productConfigurations.map((item) => ({ id: item.Id, name: item.Name, type: item.Configuration_Type__c, minimumQuantity: Number(item.Minimum_Quantity__c || 1), targetQuantity: Number(item.Target_Quantity__c || 0), geography: item.Geography__r?.Name, channel: item.Channel__c || "All Channels" })),
      previousQuantity: (historyByProduct.get(row.Id) || []).reduce((sum, item) => sum + item.quantity, 0),
      lastFiveOrders: historyByProduct.get(row.Id) || [],
      schemes: schemeRows
        .filter((scheme) => {
          const linkedProductIds = schemeProductRows.filter((link) => link.Scheme__c === scheme.Id).map((link) => link.Product__c);
          return linkedProductIds.length ? linkedProductIds.includes(row.Id) : (!scheme.Product__c || scheme.Product__c === row.Id);
        })
        .map((scheme) => ({
          id: scheme.Id,
          name: scheme.Name,
          code: scheme.Scheme_Code__c,
          type: scheme.Scheme_Type__c,
          description: scheme.Description__c,
          discountPercent: Number(scheme.Discount_Percent__c || 0),
          minimumQuantity: Number(scheme.Minimum_Quantity__c || 1),
          freeQuantity: Number(scheme.Free_Quantity__c || 0),
          endDate: scheme.End_Date__c,
        })),
    });}),
  );
});

app.get("/api/surveys", async (request, res) => {
  const req = request as AuthenticatedRequest;
  if (env.USE_MOCK_DATA) return ok(res, []);
  const outletId = escapeSoqlLiteral(String(request.query.outletId || ""));
  if (!outletId) return fail(res, 400, "Outlet is required", "OUTLET_REQUIRED");
  const employeeId = escapeSoqlLiteral(req.auth!.employeeId);
  const outlets = await sfRecords(`SELECT Id, Outlet_Type__c FROM ${objectMap.store} WHERE Id = '${outletId}' AND Id IN (${allocatedOutletIds(employeeId)}) LIMIT 1`);
  if (!outlets.length) return fail(res, 404, "Outlet not found", "OUTLET_NOT_FOUND");
  const surveys = await sfRecords("SELECT Id, Name, Survey_Type__c, Outlet_Type__c, Start_Date__c, End_Date__c, Active__c, Instructions__c, Rating_Target__c, Maximum_Rating__c, Require_Before_Image__c, Require_After_Image__c FROM Survey__c WHERE Active__c = true AND Start_Date__c <= TODAY AND End_Date__c >= TODAY ORDER BY Name");
  const normalize = (value: unknown) => String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  const applicable = surveys.filter((survey) => normalize(survey.Outlet_Type__c) === "all" || normalize(survey.Outlet_Type__c) === normalize(outlets[0].Outlet_Type__c));
  const surveyIds = applicable.map((survey) => `'${escapeSoqlLiteral(survey.Id)}'`).join(",");
  const questions = surveyIds ? await sfRecords(`SELECT Id, Name, Survey__c, Question_Type__c, Options__c, Display_Order__c, Required__c, Active__c FROM Survey_Question__c WHERE Survey__c IN (${surveyIds}) AND Active__c = true ORDER BY Display_Order__c, CreatedDate`) : [];
  return ok(res, applicable.map((survey) => ({
    id: survey.Id, name: survey.Name, type: survey.Survey_Type__c, outletType: survey.Outlet_Type__c,
    startDate: survey.Start_Date__c, endDate: survey.End_Date__c, instructions: survey.Instructions__c,
    ratingTarget: survey.Rating_Target__c, maximumRating: Number(survey.Maximum_Rating__c || 5),
    requireBeforeImage: Boolean(survey.Require_Before_Image__c), requireAfterImage: Boolean(survey.Require_After_Image__c),
    questions: questions.filter((question) => question.Survey__c === survey.Id).map((question) => ({
      id: question.Id, text: question.Name, type: question.Question_Type__c,
      options: String(question.Options__c || "").split(";").map((value) => value.trim()).filter(Boolean),
      displayOrder: Number(question.Display_Order__c || 0), required: Boolean(question.Required__c),
    })),
  })));
});

app.post("/api/survey-responses", async (request, res) => {
  const req = request as AuthenticatedRequest;
  if (env.USE_MOCK_DATA) return ok(res, { id: `survey-${Date.now()}` }, "Survey submitted");
  const visit = visits.get(req.body.visitId);
  if (!visit || visit.employeeId !== req.auth!.employeeId)
    return fail(res, 403, "An active visit is required for this survey", "ACTIVE_VISIT_REQUIRED");
  const surveyId = escapeSoqlLiteral(String(req.body.surveyId || ""));
  const surveys = await sfRecords(`SELECT Id, Name, Survey_Type__c, Require_Before_Image__c, Require_After_Image__c, Maximum_Rating__c FROM Survey__c WHERE Id = '${surveyId}' AND Active__c = true AND Start_Date__c <= TODAY AND End_Date__c >= TODAY LIMIT 1`);
  if (!surveys.length) return fail(res, 422, "This survey is not currently active", "SURVEY_INACTIVE");
  const survey = surveys[0];
  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
  const questions = await sfRecords(`SELECT Id, Name, Question_Type__c, Required__c FROM Survey_Question__c WHERE Survey__c = '${surveyId}' AND Active__c = true`);
  const answerByQuestion = new Map<string, any>(answers.map((answer: any) => [String(answer.questionId), answer]));
  const missing = questions.filter((question) => question.Required__c && !String(answerByQuestion.get(question.Id)?.value ?? "").trim());
  if (missing.length) return fail(res, 400, `Answer all required questions: ${missing.map((question) => question.Name).join(", ")}`, "REQUIRED_ANSWERS_MISSING");
  if (survey.Require_Before_Image__c && !req.body.beforeImageUrl) return fail(res, 400, "Before image is required", "BEFORE_IMAGE_REQUIRED");
  if (survey.Require_After_Image__c && !req.body.afterImageUrl) return fail(res, 400, "After image is required", "AFTER_IMAGE_REQUIRED");
  const duplicate = await sfRecords(`SELECT Id FROM Survey_Response__c WHERE Survey__c = '${surveyId}' AND Visit__c = '${escapeSoqlLiteral(visit.id)}' AND Status__c = 'Completed' LIMIT 1`);
  if (duplicate.length) return fail(res, 409, "This survey was already completed for the visit", "SURVEY_ALREADY_COMPLETED");
  const created: any = await salesforce.create("Survey_Response__c", {
    Survey__c: survey.Id, Outlet__c: visit.storeId, Visit__c: visit.id, Employee__c: req.auth!.employeeId,
    Status__c: req.body.status === "Draft" ? "Draft" : "Completed", Started_At__c: req.body.startedAt || new Date().toISOString(),
    Submitted_At__c: req.body.status === "Draft" ? null : new Date().toISOString(), Overall_Rating__c: Number(req.body.overallRating || 0) || null,
    Remarks__c: req.body.remarks || null, Latitude__c: req.body.location?.latitude, Longitude__c: req.body.location?.longitude,
    Before_Image_URL__c: req.body.beforeImageUrl || null, After_Image_URL__c: req.body.afterImageUrl || null,
  });
  for (const question of questions) {
    const answer: any = answerByQuestion.get(question.Id);
    if (!answer || answer.value == null || answer.value === "") continue;
    const values = Array.isArray(answer.value) ? answer.value : [answer.value];
    await salesforce.create("Survey_Answer__c", {
      Survey_Response__c: created.id, Survey_Question__c: question.Id,
      Text_Answer__c: question.Question_Type__c === "Text" ? String(answer.value) : null,
      Number_Answer__c: question.Question_Type__c === "Number" ? Number(answer.value) : null,
      Phone_Answer__c: question.Question_Type__c === "Phone" ? String(answer.value) : null,
      Selected_Choice__c: question.Question_Type__c === "Single Choice" ? String(answer.value) : null,
      Multiple_Choices__c: question.Question_Type__c === "Multiple Choice" ? values.join("; ") : null,
      Rating__c: question.Question_Type__c === "Rating" ? Number(answer.value) : null,
    });
  }
  return ok(res, { id: created.id, status: req.body.status === "Draft" ? "Draft" : "Completed" }, "Survey saved in Salesforce");
});

app.get("/api/expense-policies", async (request, res) => {
  if (env.USE_MOCK_DATA) return ok(res, []);
  const req = request as AuthenticatedRequest;
  const employeeRows = await sfRecords(`SELECT Id, Geography__c, Geography__r.State__c FROM ${objectMap.salesRep} WHERE Id = '${escapeSoqlLiteral(req.auth!.employeeId)}' LIMIT 1`);
  const employee = employeeRows[0];
  const rows = await sfRecords(`SELECT Id, Name, Expense_Type__c, Category__c, Ownership__c, Travel_Class__c, Rate_Type__c, Rate__c, Maximum_Amount__c, Receipt_Required__c, Geography__c, Geography__r.Name, Geography__r.State__c FROM ${objectMap.expensePolicy} WHERE Active__c = true AND Start_Date__c <= TODAY AND (End_Date__c = NULL OR End_Date__c >= TODAY) ORDER BY Expense_Type__c, Category__c`);
  const applicable = rows.filter((policy) => !policy.Geography__c || policy.Geography__c === employee?.Geography__c || (policy.Geography__r?.State__c && policy.Geography__r.State__c === employee?.Geography__r?.State__c));
  return ok(res, applicable.map((policy) => ({ id: policy.Id, name: policy.Name, expenseType: policy.Expense_Type__c, category: policy.Category__c, ownership: policy.Ownership__c, travelClass: policy.Travel_Class__c, rateType: policy.Rate_Type__c, rate: Number(policy.Rate__c || 0), maximumAmount: Number(policy.Maximum_Amount__c || 0), receiptRequired: Boolean(policy.Receipt_Required__c), geography: policy.Geography__r?.Name })));
});

type ExpenseClaimInput = {
  policyId: string;
  amount: number;
  distanceKm?: number;
  startOdometer?: number;
  endOdometer?: number;
  transportMode?: string;
  ownership?: string;
  travelClass?: string;
  receiptUrl?: string;
  remarks?: string;
};

app.post("/api/expenses", async (request, res) => {
  const req = request as AuthenticatedRequest;
  const claims: ExpenseClaimInput[] = Array.isArray(req.body.claims) ? req.body.claims : [req.body];
  if (!claims.length || claims.some((claim) => !claim.policyId || Number(claim.amount || 0) <= 0))
    return fail(res, 400, "Select one or more policies and enter valid amounts", "VALIDATION_ERROR");
  if (env.USE_MOCK_DATA)
    return ok(res, claims.map((claim, index) => ({ id: `expense-${Date.now()}-${index}`, ...claim, status: "Submitted" })), "Expenses submitted");

  const policyIds = [...new Set(claims.map((claim) => escapeSoqlLiteral(String(claim.policyId))))];
  const policies = await sfRecords(`SELECT Id, Name, Maximum_Amount__c, Receipt_Required__c FROM ${objectMap.expensePolicy} WHERE Id IN ('${policyIds.join("','")}') AND Active__c = true`);
  const policyById = new Map(policies.map((policy) => [policy.Id, policy]));
  const representatives = await sfRecords(`SELECT Id, Name, Employee_Code__c, Email__c, Salesforce_User__c FROM ${objectMap.salesRep} WHERE Id = '${escapeSoqlLiteral(req.auth!.employeeId)}' LIMIT 1`);
  const representative = representatives[0];
  if (!representative)
    return fail(res, 422, "No active Employee record is linked to this login", "EMPLOYEE_NOT_LINKED");
  const attendance = await sfRecords(`SELECT Id FROM ${objectMap.attendance} WHERE Attendance_Date__c = TODAY AND Sales_Representative__c = '${escapeSoqlLiteral(representative.Salesforce_User__c)}' ORDER BY CreatedDate DESC LIMIT 1`);
  const createdClaims: Array<{ id: string; policyId: string; status: string }> = [];

  for (const claim of claims) {
    const policy = policyById.get(String(claim.policyId));
    const amount = Number(claim.amount || 0);
    if (!policy) return fail(res, 404, "One of the selected expense policies is not active", "POLICY_NOT_FOUND");
    if (Number(policy.Maximum_Amount__c || 0) > 0 && amount > Number(policy.Maximum_Amount__c))
      return fail(res, 422, `${policy.Name} exceeds its policy limit of ₹${policy.Maximum_Amount__c}`, "POLICY_LIMIT_EXCEEDED");
    if (policy.Receipt_Required__c && !claim.receiptUrl)
      return fail(res, 422, `Receipt evidence is required for ${policy.Name}`, "RECEIPT_REQUIRED");
    if (claim.receiptUrl && !/^https?:\/\//i.test(String(claim.receiptUrl)))
      return fail(res, 422, `Receipt URL for ${policy.Name} must start with http:// or https://`, "INVALID_RECEIPT_URL");
    const startOdometer = Number(claim.startOdometer || 0);
    const endOdometer = Number(claim.endOdometer || 0);
    if (startOdometer > 0 && endOdometer > 0 && endOdometer < startOdometer)
      return fail(res, 422, `End odometer cannot be lower than start odometer for ${policy.Name}`, "INVALID_ODOMETER_RANGE");
    const created: any = await salesforce.create(objectMap.expenseClaim, {
      Sales_Representative__c: representative.Id,
      Expense_Policy__c: policy.Id,
      Attendance__c: attendance[0]?.Id || null,
      Claim_Date__c: new Date().toISOString().slice(0, 10),
      Amount__c: amount,
      Distance_Km__c: Number(claim.distanceKm || 0) || (endOdometer >= startOdometer ? endOdometer - startOdometer : null),
      Start_Odometer__c: startOdometer || null,
      End_Odometer__c: endOdometer || null,
      Transport_Mode__c: claim.transportMode || null,
      Ownership__c: claim.ownership || null,
      Travel_Class__c: claim.travelClass || null,
      Receipt_URL__c: claim.receiptUrl || null,
      Remarks__c: claim.remarks || null,
      Status__c: "Submitted",
    });
    createdClaims.push({ id: created.id, policyId: policy.Id, status: "Submitted" });
  }
  return ok(res, { claims: createdClaims, representative: { id: representative.Id, name: representative.Name, employeeCode: representative.Employee_Code__c, email: representative.Email__c } }, `${createdClaims.length} expense claim${createdClaims.length === 1 ? "" : "s"} submitted for approval`);
});
app.post("/api/product-refusals", async (request, res) => {
  const req = request as AuthenticatedRequest;
  const visit = visits.get(String(req.body.visitId || ""));
  if (!visit) return fail(res, 404, "Visit not found", "VISIT_NOT_FOUND");
  if (visit.employeeId !== req.auth!.employeeId)
    return fail(res, 403, "This visit belongs to another Employee", "VISIT_ACCESS_DENIED");
  const reason = String(req.body.reason || "").trim();
  if (!reason) return fail(res, 400, "A refusal reason is required for a Must Sell product", "REFUSAL_REASON_REQUIRED");
  const productId = escapeSoqlLiteral(String(req.body.productId || ""));
  const productRows = await sfRecords(`SELECT Id FROM ${objectMap.productSalesConfiguration} WHERE Product__c = '${productId}' AND Configuration_Type__c = 'Must Sell' AND Active__c = true AND Start_Date__c <= TODAY AND (End_Date__c = NULL OR End_Date__c >= TODAY) LIMIT 1`);
  if (!productRows.length)
    return fail(res, 400, "Only Must Sell products require a refusal record", "INVALID_REFUSAL_PRODUCT");
  const created: any = await salesforce.create(objectMap.productRefusal, {
    Visit__c: visit.id,
    Outlet__c: visit.storeId,
    Product__c: productId,
    Sales_Representative__c: req.auth!.employeeId,
    Reason__c: reason,
    Notes__c: req.body.notes || null,
    Refused_At__c: new Date().toISOString(),
  });
  return ok(res, { id: created.id }, "Must Sell refusal saved in Salesforce");
});
app.get("/api/outlets", async (request, res) => {
  const req = request as AuthenticatedRequest;
  if (env.USE_MOCK_DATA) return ok(res, stores);
  const employeeId = escapeSoqlLiteral(req.auth!.employeeId);
  const [rows, visitRows, orderRows] = await Promise.all([
    sfRecords(
      `SELECT Id, Name, Address__c, Phone__c, Email__c, Outlet_Owner_Name__c, Outlet_Type__c, Outstanding_Amount__c, Active__c, Beat__c, Beat__r.Name, Geography__r.Name, Geo_Location__Latitude__s, Geo_Location__Longitude__s, Latitude__c, Longitude__c FROM ${objectMap.store} WHERE Id IN (${allocatedOutletIds(employeeId)}) ORDER BY Name LIMIT 500`,
    ),
    sfRecords(
      `SELECT Id, Visit_Number__c, Visit_Date__c, Status__c, Retailer__c, Check_In_Time__c, Check_Out_Time__c, Check_In_Latitude__c, Check_In_Longitude__c, Check_Out_Latitude__c, Check_Out_Longitude__c, Duration_Minutes__c FROM ${objectMap.visit} WHERE Retailer__c IN (${allocatedOutletIds(employeeId)}) ORDER BY Check_In_Time__c DESC NULLS LAST, Visit_Date__c DESC, CreatedDate DESC LIMIT 1000`,
    ),
    sfRecords(`SELECT Id, Retailer__c, Order_Date__c, Status__c, Total_Amount__c, Total_Quantity__c FROM ${objectMap.order} WHERE Retailer__c IN (${allocatedOutletIds(employeeId)}) ORDER BY Order_Date__c DESC, CreatedDate DESC LIMIT 1000`),
  ]);
  const visitsByOutlet = new Map<string, any[]>();
  for (const visit of visitRows) {
    const outletVisits = visitsByOutlet.get(visit.Retailer__c) || [];
    outletVisits.push({
      id: visit.Id,
      visitNumber: visit.Visit_Number__c,
      date: visit.Visit_Date__c,
      status: visit.Status__c,
      checkInTime: visit.Check_In_Time__c,
      checkOutTime: visit.Check_Out_Time__c,
      durationMinutes: visit.Duration_Minutes__c,
      checkInLocation: visit.Check_In_Latitude__c == null ? null : {
        latitude: visit.Check_In_Latitude__c,
        longitude: visit.Check_In_Longitude__c,
      },
      checkOutLocation: visit.Check_Out_Latitude__c == null ? null : {
        latitude: visit.Check_Out_Latitude__c,
        longitude: visit.Check_Out_Longitude__c,
      },
    });
    visitsByOutlet.set(visit.Retailer__c, outletVisits);
  }
  const ordersByOutlet = new Map<string, any[]>();
  for (const order of orderRows) {
    const outletOrders = ordersByOutlet.get(order.Retailer__c) || [];
    outletOrders.push(order);
    ordersByOutlet.set(order.Retailer__c, outletOrders);
  }
  ok(
    res,
    rows.map((row) => {
      const outletVisits = visitsByOutlet.get(row.Id) || [];
      const outletOrders = ordersByOutlet.get(row.Id) || [];
      return {
      id: row.Id,
      code: `OUT-${row.Id.slice(-5).toUpperCase()}`,
      name: row.Name,
      owner: row.Outlet_Owner_Name__c,
      contact: row.Phone__c,
      email: row.Email__c,
      type: row.Outlet_Type__c,
      address: row.Address__c,
      geography: row.Geography__r?.Name,
      beatId: row.Beat__c,
      beatName: row.Beat__r?.Name,
      active: row.Active__c,
      status: row.Active__c ? "Active" : "Inactive",
      outstandingAmount: row.Outstanding_Amount__c || 0,
      latitude: row.Geo_Location__Latitude__s ?? row.Latitude__c,
      longitude: row.Geo_Location__Longitude__s ?? row.Longitude__c,
      locationStatus:
        (row.Geo_Location__Latitude__s ?? row.Latitude__c) == null
          ? "Location missing"
          : "Location available",
      visitCount: outletVisits.length,
      lastVisit: outletVisits[0]?.checkInTime || outletVisits[0]?.date || null,
      lastVisitLocation: outletVisits[0]?.checkInLocation || null,
      recentVisits: outletVisits.slice(0, 5),
      orderCount: outletOrders.length,
      lastOrderDate: outletOrders[0]?.Order_Date__c || null,
      lastOrderAmount: Number(outletOrders[0]?.Total_Amount__c || 0),
    };
    }),
  );
});

app.get("/api/orders", async (request, res) => {
  const req = request as AuthenticatedRequest;
  if (env.USE_MOCK_DATA) return ok(res, []);
  const employeeId = escapeSoqlLiteral(req.auth!.employeeId);
  const rows = await sfRecords(`SELECT Id, Name, Order_Date__c, Status__c, Gross_Amount__c, Tax_Amount__c, Total_Amount__c, Total_Quantity__c, SKU__c, Scheme_Applied__c, Scheme_Details__c, Product__r.Name, Visit__r.Name, Retailer__c, Retailer__r.Name FROM ${objectMap.order} WHERE Retailer__c IN (${allocatedOutletIds(employeeId)}) ORDER BY Order_Date__c DESC, CreatedDate DESC LIMIT 200`);
  const orderIds = rows.map((row) => `'${escapeSoqlLiteral(row.Id)}'`).join(",");
  const itemRows = orderIds ? await sfRecords(`SELECT Id, Sales_Order__c, Product__c, Product__r.Name, Piece_Quantity__c, Unit_Price__c, Line_Amount__c, Scheme__c, Scheme__r.Name FROM ${objectMap.orderItem} WHERE Sales_Order__c IN (${orderIds}) ORDER BY CreatedDate`) : [];
  ok(
    res,
    rows.map((row) => ({
      id: row.Id,
      orderNumber: row.Name,
      date: row.Order_Date__c,
      status: row.Status__c,
      amount: row.Total_Amount__c || 0,
      grossAmount: row.Gross_Amount__c || 0,
      taxAmount: row.Tax_Amount__c || 0,
      totalQuantity: row.Total_Quantity__c || 0,
      sku: row.SKU__c,
      schemeApplied: row.Scheme_Applied__c,
      schemeDetails: row.Scheme_Details__c,
      productName: row.Product__r?.Name,
      visitName: row.Visit__r?.Name,
      outletId: row.Retailer__c,
      outletName: row.Retailer__r?.Name,
      items: itemRows.filter((item) => item.Sales_Order__c === row.Id).map((item) => ({ id: item.Id, productId: item.Product__c, productName: item.Product__r?.Name, quantity: Number(item.Piece_Quantity__c || 0), unitPrice: Number(item.Unit_Price__c || 0), amount: Number(item.Line_Amount__c || 0), schemeId: item.Scheme__c, schemeName: item.Scheme__r?.Name })),
    })),
  );
});

const moduleQueries: Record<string, string> = {
  "asset-surveys": `SELECT Id, Name, Asset_Code__c, Asset_Name__c, Status__c, Given_Date__c, Picture_URL__c, Outlet__r.Name, Visit__r.Name FROM ${objectMap.assetSurvey} ORDER BY CreatedDate DESC LIMIT 200`,
  "competitor-activities": `SELECT Id, Name, Competitor_Name__c, Company__c, MRP__c, RBP__c, Scheme_Details__c, Image_URL__c, Outlet__r.Name, Visit__r.Name FROM ${objectMap.competitor} ORDER BY CreatedDate DESC LIMIT 200`,
  tickets: `SELECT Id, Name, Subject__c, Description__c, Status__c, Image_URL__c, Outlet__r.Name, Visit__r.Name FROM ${objectMap.ticket} ORDER BY CreatedDate DESC LIMIT 200`,
  "stock-checks": `SELECT Id, Name, Product__r.Name, Quantity__c, Manufacturing_Date__c, Outlet__r.Name, Visit__r.Name FROM ${objectMap.stockCheck} ORDER BY CreatedDate DESC LIMIT 200`,
  returns: `SELECT Id, Name, Product__r.Name, Quantity__c, Manufacturing_Date__c, Return_Reason__c, Outlet__r.Name, Visit__r.Name FROM ${objectMap.returns} ORDER BY CreatedDate DESC LIMIT 200`,
};

app.get("/api/modules/:moduleName", async (request, res) => {
  if (env.USE_MOCK_DATA) return ok(res, []);
  const moduleName = String(request.params.moduleName);
  const query = moduleQueries[moduleName];
  if (!query) return fail(res, 404, "Module not found", "MODULE_NOT_FOUND");
  const req = request as AuthenticatedRequest;
  const employeeId = escapeSoqlLiteral(req.auth!.employeeId);
  const scopedQuery = query.replace(
    " ORDER BY",
    ` WHERE Outlet__c IN (${allocatedOutletIds(employeeId)}) ORDER BY`,
  );
  const rows = await sfRecords(scopedQuery);
  return ok(res, rows.map(({ attributes, ...row }) => ({
    ...row,
    outletName: row.Outlet__r?.Name,
    visitName: row.Visit__r?.Name,
    productName: row.Product__r?.Name,
    Outlet__r: undefined,
    Visit__r: undefined,
    Product__r: undefined,
  })));
});
app.get("/api/beats", async (request, res) => {
  if (env.USE_MOCK_DATA) return ok(res, beats);
  const req = request as AuthenticatedRequest;
  const employeeId = escapeSoqlLiteral(req.auth!.employeeId);
  const [allocations, completedVisits] = await Promise.all([
    sfRecords(`SELECT Beat__c, Beat__r.Name, Outlet__c, Outlet__r.Name FROM ${objectMap.distributorAllocation} WHERE Employee__c = '${employeeId}' AND Allocation_Status__c = 'Active' AND Beat__r.Active__c = true AND Outlet__r.Active__c = true ORDER BY Beat__r.Name, Outlet__r.Name`),
    sfRecords(`SELECT Retailer__c FROM ${objectMap.visit} WHERE Employee__c = '${employeeId}' AND Visit_Date__c = TODAY AND Status__c = 'Completed'`),
  ]);
  ok(res, allocatedBeats(allocations, new Set(completedVisits.map((visit) => visit.Retailer__c))));
});
app.get("/api/beats/:beatId/stores", async (request, res) => {
  const req = request as AuthenticatedRequest;
  if (env.USE_MOCK_DATA)
    return ok(
      res,
      stores.filter((store) => store.beatId === req.params.beatId),
    );
  const beatId = escapeSoqlLiteral(String(req.params.beatId));
  const employeeId = escapeSoqlLiteral(req.auth!.employeeId);
  const rows = await sfRecords(
    `SELECT Id, Name, Address__c, Phone__c, Outlet_Type__c, Outstanding_Amount__c, Beat__r.Name, Geo_Location__Latitude__s, Geo_Location__Longitude__s, Latitude__c, Longitude__c FROM ${objectMap.store} WHERE Beat__c = '${beatId}' AND Id IN (${allocatedOutletIds(employeeId)}) AND Active__c = true ORDER BY Name`,
  );
  ok(
    res,
    rows.map((row) => ({
      id: row.Id,
      beatId: req.params.beatId,
      code: row.Id.slice(-6).toUpperCase(),
      name: row.Name,
      address: row.Address__c,
      phone: row.Phone__c,
      type: row.Outlet_Type__c,
      outstandingAmount: row.Outstanding_Amount__c || 0,
      beatName: row.Beat__r?.Name,
      latitude: row.Geo_Location__Latitude__s || row.Latitude__c,
      longitude: row.Geo_Location__Longitude__s || row.Longitude__c,
      lastVisit: null,
      lastOrder: null,
    })),
  );
});
app.get("/api/stores/:storeId", async (request, res) => {
  const req = request as AuthenticatedRequest;
  if (!env.USE_MOCK_DATA) {
    const storeId = escapeSoqlLiteral(String(req.params.storeId));
    const employeeId = escapeSoqlLiteral(req.auth!.employeeId);
    const rows = await sfRecords(
      `SELECT Id, Name, Beat__c, Beat__r.Name, Address__c, Phone__c, Email__c, Outlet_Owner_Name__c, Outlet_Type__c, Outstanding_Amount__c, Active__c, Geography__r.Name, Geo_Location__Latitude__s, Geo_Location__Longitude__s, Latitude__c, Longitude__c FROM ${objectMap.store} WHERE Id = '${storeId}' AND Id IN (${allocatedOutletIds(employeeId)}) LIMIT 1`,
    );
    if (!rows.length)
      return fail(res, 404, "Store not found", "STORE_NOT_FOUND");
    const row = rows[0];
    const [visitSummary, orderSummary] = await Promise.all([
      sfRecords(`SELECT COUNT(Id) total, MAX(Check_In_Time__c) latest FROM ${objectMap.visit} WHERE Retailer__c = '${storeId}'`),
      sfRecords(`SELECT COUNT(Id) total, MAX(Order_Date__c) latest, SUM(Total_Amount__c) amount FROM ${objectMap.order} WHERE Retailer__c = '${storeId}'`),
    ]);
    return ok(res, {
      id: row.Id,
      beatId: row.Beat__c,
      code: row.Id.slice(-6).toUpperCase(),
      name: row.Name,
      address: row.Address__c,
      phone: row.Phone__c,
      contact: row.Phone__c,
      email: row.Email__c,
      owner: row.Outlet_Owner_Name__c,
      type: row.Outlet_Type__c,
      geography: row.Geography__r?.Name,
      beatName: row.Beat__r?.Name,
      active: row.Active__c,
      outstandingAmount: row.Outstanding_Amount__c || 0,
      latitude: row.Geo_Location__Latitude__s || row.Latitude__c,
      longitude: row.Geo_Location__Longitude__s || row.Longitude__c,
      visitCount: Number(visitSummary[0]?.total || 0),
      lastVisit: visitSummary[0]?.latest || null,
      orderCount: Number(orderSummary[0]?.total || 0),
      lastOrderDate: orderSummary[0]?.latest || null,
      totalOrderAmount: Number(orderSummary[0]?.amount || 0),
    });
  }
  const store = stores.find((s) => s.id === req.params.storeId);
  return store
    ? ok(res, store)
    : fail(res, 404, "Store not found", "STORE_NOT_FOUND");
});
app.post("/api/day/start", async (req, res) => {
  const request = req as AuthenticatedRequest;
  const startOdometer = Number(req.body.startOdometer || 0);
  const ownVehicle = ["Two Wheeler", "Four Wheeler"].includes(req.body.transportMode)
    && req.body.ownership === "Own";
  if (ownVehicle && (!Number.isFinite(startOdometer) || startOdometer <= 0))
    return fail(res, 400, "Enter a valid starting odometer reading", "START_ODOMETER_REQUIRED");
  const data = {
    id: `day-${Date.now()}`,
    startTime: new Date().toISOString(),
    location: req.body.location,
    status: "Started",
  };
  if (!env.USE_MOCK_DATA) {
    const rateRows = ownVehicle ? await sfRecords(
      `SELECT Rate__c FROM ${objectMap.expensePolicy} WHERE Active__c = true AND Rate_Type__c = 'Per Kilometer' AND Category__c = '${escapeSoqlLiteral(String(req.body.transportMode))}' AND Start_Date__c <= TODAY AND (End_Date__c = NULL OR End_Date__c >= TODAY) ORDER BY Geography__c NULLS LAST LIMIT 1`,
    ) : [];
    const created: any = await salesforce.create(objectMap.attendance, {
      Attendance_Date__c: new Date().toISOString().slice(0, 10),
      Start_Time__c: data.startTime,
      Start_Latitude__c: req.body.location.latitude,
      Start_Longitude__c: req.body.location.longitude,
      Transport_Mode__c: req.body.transportMode || null,
      Vehicle_Ownership__c: req.body.ownership || null,
      Planned_Activity__c: req.body.plannedActivity || null,
      Start_Odometer__c: startOdometer || null,
      Odometer_Evidence_URL__c: req.body.odometerEvidenceUrl || null,
      Odometer_Entry_Mode__c: req.body.odometerEntryMode || "Manual",
      Travel_Rate_Per_Km__c: Number(rateRows[0]?.Rate__c || 0),
      Employee__c: request.auth?.employeeId || null,
      Sales_Representative__c: request.auth?.salesforceUserId || null,
      Status__c: "Started",
    });
    data.id = created.id;
  }
  ok(res, { ...data, attendanceId: data.id }, "Day started");
});
app.post("/api/day/end", async (request, res) => {
  const req = request as AuthenticatedRequest;
  const requestId = String(req.body.requestId || "");
  if (requestId && idempotency.has(requestId))
    return ok(res, idempotency.get(requestId), "Duplicate request safely reused");
  const endTime = new Date().toISOString();
  const location = req.body.location;
  const endOdometer = Number(req.body.endOdometer || 0);
  if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude)))
    return fail(res, 400, "A valid end-day location is required", "LOCATION_REQUIRED");
  let attendanceId: string | undefined;
  if (!env.USE_MOCK_DATA) {
    const rows = await sfRecords(
      `SELECT Id, Start_Odometer__c, Transport_Mode__c, Vehicle_Ownership__c FROM ${objectMap.attendance} WHERE Attendance_Date__c = TODAY AND Status__c = 'Started'${req.auth?.salesforceUserId ? ` AND Sales_Representative__c = '${escapeSoqlLiteral(req.auth.salesforceUserId)}'` : ""} ORDER BY CreatedDate DESC LIMIT 1`,
    );
    if (!rows.length)
      return fail(res, 422, "Start Day must be completed before End Day", "DAY_NOT_STARTED");
    const startOdometer = Number(rows[0].Start_Odometer__c || 0);
    const odometerRequired = ["Two Wheeler", "Four Wheeler"].includes(rows[0].Transport_Mode__c)
      && rows[0].Vehicle_Ownership__c === "Own";
    if (odometerRequired && (!Number.isFinite(endOdometer) || endOdometer <= 0))
      return fail(res, 400, "Enter a valid ending odometer reading", "END_ODOMETER_REQUIRED");
    if (startOdometer > 0 && endOdometer < startOdometer)
      return fail(res, 400, "End odometer cannot be lower than start odometer", "INVALID_ODOMETER_RANGE");
    attendanceId = rows[0].Id;
    await salesforce.update(objectMap.attendance, attendanceId!, {
      End_Time__c: endTime,
      End_Latitude__c: Number(location.latitude),
      End_Longitude__c: Number(location.longitude),
      End_Odometer__c: endOdometer || null,
      Odometer_Evidence_URL__c: req.body.odometerEvidenceUrl || null,
      Status__c: "Completed",
    });
    const calculatedRows = await sfRecords(
      `SELECT Distance_Travelled_Km__c, Travel_Rate_Per_Km__c, Travel_Amount__c FROM ${objectMap.attendance} WHERE Id = '${escapeSoqlLiteral(attendanceId!)}' LIMIT 1`,
    );
    const calculated = calculatedRows[0] || {};
    const result = {
      attendanceId,
      endTime,
      location,
      employeeName: req.auth!.employeeName,
      distanceTravelledKm: Number(calculated.Distance_Travelled_Km__c || 0),
      ratePerKm: Number(calculated.Travel_Rate_Per_Km__c || 0),
      totalTravelAmount: Number(calculated.Travel_Amount__c || 0),
    };
    if (requestId) idempotency.set(requestId, result);
    return ok(res, result, "Day ended and travel amount calculated in Salesforce");
  }
  const result = { attendanceId, endTime, location, employeeName: req.auth!.employeeName, distanceTravelledKm: 0, ratePerKm: 0, totalTravelAmount: 0 };
  if (requestId) idempotency.set(requestId, result);
  return ok(res, result, "Day ended successfully");
});
app.post("/api/store/validate-location", async (request, res) => {
  const req = request as AuthenticatedRequest;
  const storeId = escapeSoqlLiteral(String(req.body.storeId || ""));
  const employeeId = escapeSoqlLiteral(req.auth!.employeeId);
  const store = env.USE_MOCK_DATA
    ? stores.find((item) => item.id === req.body.storeId)
    : (
        await sfRecords(
          `SELECT Id, Name, Beat__c, Address__c, Geo_Location__Latitude__s, Geo_Location__Longitude__s, Latitude__c, Longitude__c FROM ${objectMap.store} WHERE Id = '${storeId}' AND Id IN (${allocatedOutletIds(employeeId)}) LIMIT 1`,
        )
      ).map((row) => ({
        id: row.Id,
        name: row.Name,
        beatId: row.Beat__c,
        address: row.Address__c,
        latitude: row.Geo_Location__Latitude__s || row.Latitude__c,
        longitude: row.Geo_Location__Longitude__s || row.Longitude__c,
      }))[0];
  if (!store) return fail(res, 404, "Store not found", "STORE_NOT_FOUND");
  if (store.latitude == null || store.longitude == null)
    return fail(
      res,
      422,
      "This outlet has no Salesforce geolocation. Ask the admin to update it.",
      "OUTLET_LOCATION_MISSING",
    );
  const distance = distanceInMeters(req.body.location, store);
  ok(res, { allowed: distance <= 100, distance, requiredDistance: 100, store });
});
app.post("/api/store/visit/start", async (request, res) => {
  const req = request as AuthenticatedRequest;
  const id = req.body.requestId || `visit-${Date.now()}`;
  if (visits.has(id)) return ok(res, visits.get(id), "Existing visit returned");
  const storeId = escapeSoqlLiteral(String(req.body.storeId || ""));
  const employeeId = escapeSoqlLiteral(req.auth!.employeeId);
  const store = env.USE_MOCK_DATA
    ? stores.find((item) => item.id === req.body.storeId)
    : (
        await sfRecords(
          `SELECT Id, Name, Beat__c FROM ${objectMap.store} WHERE Id = '${storeId}' AND Id IN (${allocatedOutletIds(employeeId)}) LIMIT 1`,
        )
      ).map((row) => ({ id: row.Id, name: row.Name, beatId: row.Beat__c }))[0];
  if (!store) return fail(res, 404, "Store not found", "STORE_NOT_FOUND");
  let salesforceVisitId: string | undefined;
  if (!env.USE_MOCK_DATA) {
    const plans = await sfRecords(
      `SELECT Id FROM ${objectMap.journeyPlan} WHERE Beat__c = '${store.beatId}' AND Status__c = 'Approved' ORDER BY Planned_Date__c DESC LIMIT 1`,
    );
    let journeyPlanId = plans[0]?.Id;
    if (!journeyPlanId) {
      const today = new Date().toISOString().slice(0, 10);
      const createdPlan: any = await salesforce.create(objectMap.journeyPlan, {
        Name: `${store.name} Mobile Plan ${today}`,
        Beat__c: store.beatId,
        Planned_Date__c: today,
        Planning_Start_Date__c: today,
        Planning_End_Date__c: today,
        Status__c: "Approved",
      });
      journeyPlanId = createdPlan.id;
    }
    const visitFields: Record<string, unknown> = {
      Name: `${store.name} ${new Date().toLocaleDateString("en-IN")}`,
      Retailer__c: store.id,
      Employee__c: req.auth!.employeeId,
      Sales_Representative__c: req.auth?.salesforceUserId || null,
      Permanent_Journey_Plan__c: journeyPlanId,
      Visit_Date__c: new Date().toISOString().slice(0, 10),
      Status__c: "Checked In",
      Check_In_Time__c: new Date().toISOString(),
      Check_In_Latitude__c: req.body.location.latitude,
      Check_In_Longitude__c: req.body.location.longitude,
      Outlet_Geo_Location__Latitude__s: req.body.location.latitude,
      Outlet_Geo_Location__Longitude__s: req.body.location.longitude,
      Offline_Key__c: id,
    };
    const created: any = await salesforce.create(objectMap.visit, visitFields);
    salesforceVisitId = created.id;
  }
  const visit: VisitPayload = {
    id: salesforceVisitId || id,
    employeeId: req.auth!.employeeId,
    storeId: store.id,
    storeName: store.name,
    beatName: store.beatId,
    checkIn: { ...req.body.location, timestamp: new Date().toISOString() },
    orderLines: [],
    returns: [],
    competitors: [],
    tickets: [],
    status: "In Progress",
  };
  visits.set(visit.id, visit);
  ok(res, visit, "Visit started");
});
app.post("/api/store/revisit", (req, res) =>
  ok(res, { ...req.body, id: `revisit-${Date.now()}` }),
);
app.post("/api/outlets/:storeId/visit-status", async (request, res) => {
  const req = request as AuthenticatedRequest;
  const storeId = escapeSoqlLiteral(String(req.params.storeId));
  const employeeId = escapeSoqlLiteral(req.auth!.employeeId);
  const rows = await sfRecords(`SELECT Id, Name, Beat__c FROM ${objectMap.store} WHERE Id = '${storeId}' AND Id IN (${allocatedOutletIds(employeeId)}) LIMIT 1`);
  if (!rows.length) return fail(res, 404, "Outlet not found", "OUTLET_NOT_FOUND");
  const status = String(req.body.status || "Not Visited");
  if (!env.USE_MOCK_DATA) {
    const plans = await sfRecords(`SELECT Id FROM ${objectMap.journeyPlan} WHERE Beat__c = '${rows[0].Beat__c}' AND Status__c = 'Approved' ORDER BY Planned_Date__c DESC LIMIT 1`);
    const created: any = await salesforce.create(objectMap.visit, {
      Name: `${rows[0].Name} ${status}`,
      Retailer__c: rows[0].Id,
      Employee__c: req.auth!.employeeId,
      Sales_Representative__c: req.auth?.salesforceUserId || null,
      Permanent_Journey_Plan__c: plans[0]?.Id || null,
      Visit_Date__c: new Date().toISOString().slice(0, 10),
      Status__c: "Missed",
      Missed_Reason__c: status === "Not Available" ? "Owner unavailable" : (req.body.reason || "Not visited"),
      Notes__c: req.body.notes || null,
    });
    return ok(res, { id: created.id, status }, "Outlet visit status saved in Salesforce");
  }
  return ok(res, { id: `visit-${Date.now()}`, status });
});
for (const [path, key] of [
  ["/api/orders", "orderLines"],
  ["/api/returns", "returns"],
  ["/api/competitor-activities", "competitors"],
  ["/api/tickets", "tickets"],
] as const)
  app.post(path, async (request, res) => {
    const req = request as AuthenticatedRequest;
    const requestId = req.body.requestId;
    if (requestId && idempotency.has(requestId))
      return ok(
        res,
        idempotency.get(requestId),
        "Duplicate request safely reused",
      );
    let result: any = { ...req.body, id: `${key}-${Date.now()}` };
    if (!env.USE_MOCK_DATA) {
      const visit = visits.get(req.body.visitId);
      if (!visit)
        return fail(res, 404, "Visit not found", "VISIT_NOT_FOUND");
      if (visit.employeeId !== req.auth!.employeeId)
        return fail(res, 403, "This visit belongs to another Employee", "VISIT_ACCESS_DENIED");
      if (path === "/api/orders") {
        const requestedItems = Array.isArray(req.body.items) ? req.body.items : [];
        if (!requestedItems.length)
          return fail(res, 400, "At least one order item is required", "ORDER_ITEMS_REQUIRED");
        const productIds: string[] = [...new Set<string>(requestedItems.map((item: any) => String(item.productId || "")))]
          .filter(Boolean);
        const safeIds = productIds.map((id) => `'${escapeSoqlLiteral(id)}'`).join(",");
        const productRows = await sfRecords(
          `SELECT Id, Name, Product_Code__c, Selling_Price__c, GST_Percent__c, Available_Stock__c, Units_Per_Case__c, Active__c, Sellable__c FROM ${objectMap.product} WHERE Id IN (${safeIds})`,
        );
        const productById = new Map(productRows.map((product) => [product.Id, product]));
        const configurationIds = [...new Set<string>(requestedItems.map((item: any) => String(item.configurationId || "")))].filter(Boolean);
        const configurations = configurationIds.length ? await sfRecords(`SELECT Id, Product__c, Configuration_Type__c, Minimum_Quantity__c FROM ${objectMap.productSalesConfiguration} WHERE Id IN (${configurationIds.map((id) => `'${escapeSoqlLiteral(id)}'`).join(",")}) AND Active__c = true AND Start_Date__c <= TODAY AND (End_Date__c = NULL OR End_Date__c >= TODAY)`) : [];
        const configurationById = new Map(configurations.map((configuration) => [configuration.Id, configuration]));
        const schemeIds = [...new Set<string>(requestedItems.map((item: any) => String(item.schemeId || "")))].filter(Boolean);
        const activeSchemes = schemeIds.length ? await sfRecords(`SELECT Id, Name, Product__c FROM ${objectMap.scheme} WHERE Id IN (${schemeIds.map((id) => `'${escapeSoqlLiteral(id)}'`).join(",")}) AND Active__c = true AND Start_Date__c <= TODAY AND (End_Date__c = NULL OR End_Date__c >= TODAY)`) : [];
        const schemeById = new Map(activeSchemes.map((scheme) => [scheme.Id, scheme]));
        const schemeProductLinks = schemeIds.length ? await sfRecords(`SELECT Scheme__c, Product__c FROM Scheme_Product__c WHERE Scheme__c IN (${schemeIds.map((id) => `'${escapeSoqlLiteral(id)}'`).join(",")}) AND Active__c = true`) : [];
        const lines: Array<{ product: any; quantity: number; unitPrice: number; discount: number; grossAmount: number; taxAmount: number; totalAmount: number; schemeId?: string; schemeName?: string; configurationId?: string }> = requestedItems.map((item: any) => {
          const product = productById.get(String(item.productId));
          const quantity = Number(item.quantity || 0);
          if (!product || !product.Active__c || !product.Sellable__c)
            throw new Error(`Product ${item.productId} is not available for sale`);
          if (!Number.isFinite(quantity) || quantity <= 0)
            throw new Error(`Quantity must be greater than zero for ${product.Name}`);
          if (quantity > Number(product.Available_Stock__c || 0))
            throw new Error(`Insufficient stock for ${product.Name}`);
          const configuration = item.configurationId ? configurationById.get(String(item.configurationId)) : undefined;
          if (item.configurationId && (!configuration || configuration.Product__c !== product.Id))
            throw new Error(`The sales configuration for ${product.Name} is not active or does not belong to this product`);
          if (configuration && quantity < Number(configuration.Minimum_Quantity__c || 1))
            throw new Error(`${product.Name} requires at least ${configuration.Minimum_Quantity__c} units for ${configuration.Configuration_Type__c}`);
          const scheme = item.schemeId ? schemeById.get(String(item.schemeId)) : undefined;
          const linkedProducts = scheme ? schemeProductLinks.filter((link) => link.Scheme__c === scheme.Id).map((link) => link.Product__c) : [];
          if (item.schemeId && !scheme)
            throw new Error(`The selected scheme for ${product.Name} is no longer active`);
          if (scheme && (linkedProducts.length ? !linkedProducts.includes(product.Id) : (scheme.Product__c && scheme.Product__c !== product.Id)))
            throw new Error(`${scheme.Name} is not applicable to ${product.Name}`);
          const unitPrice = Number(product.Selling_Price__c || 0);
          const baseAmount = quantity * unitPrice;
          const discount = Math.max(0, Math.min(baseAmount, Number(item.discount || 0)));
          const grossAmount = baseAmount - discount;
          const taxAmount = grossAmount * Number(product.GST_Percent__c || 0) / 100;
          return { product, quantity, unitPrice, discount, grossAmount, taxAmount, totalAmount: grossAmount + taxAmount, schemeId: scheme?.Id, schemeName: scheme?.Name, configurationId: configuration?.Id };
        });
        const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
        const grossAmount = lines.reduce((sum, line) => sum + line.grossAmount, 0);
        const taxAmount = lines.reduce((sum, line) => sum + line.taxAmount, 0);
        const totalAmount = grossAmount + taxAmount;
        const appliedSchemeId = requestedItems.find((item: any) => item.schemeId)?.schemeId || null;
        const appliedSchemeNames = requestedItems.map((item: any) => item.schemeName).filter(Boolean);
        const createdOrder: any = await salesforce.create(objectMap.order, {
          Order_Date__c: new Date().toISOString().slice(0, 10),
          Status__c: "Submitted",
          Retailer__c: visit.storeId,
          Visit__c: visit.id,
          Total_Quantity__c: totalQuantity,
          Gross_Amount__c: grossAmount,
          Tax_Amount__c: taxAmount,
          Total_Amount__c: totalAmount,
          Product__c: lines[0].product.Id,
          Scheme_Applied__c: appliedSchemeId,
          Scheme_Details__c: appliedSchemeNames.length ? [...new Set(appliedSchemeNames)].join(", ") : null,
        });
        const records = [];
        for (const line of lines) {
          const createdItem: any = await salesforce.create(objectMap.orderItem, {
            Sales_Order__c: createdOrder.id,
            Product__c: line.product.Id,
            Product_Sales_Configuration__c: line.configurationId || null,
            Scheme__c: line.schemeId || null,
            Piece_Quantity__c: line.quantity,
            Total_Pieces__c: line.quantity,
            Unit_Price__c: line.unitPrice,
            Line_Amount__c: line.totalAmount,
          });
          records.push({ id: createdItem.id, productId: line.product.Id, productName: line.product.Name, ...line });
        }
        await salesforce.update(objectMap.visit, visit.id, {
          Order_Gross_Amount__c: grossAmount,
          Order_Tax__c: taxAmount,
          Order_Total__c: totalAmount,
          Order_Total_Quantity__c: totalQuantity,
        });
        result = { id: createdOrder.id, totalQuantity, grossAmount, taxAmount, totalAmount, items: records };
      } else if (path === "/api/returns") {
        const created: any = await salesforce.create(objectMap.returns, {
          Outlet__c: visit.storeId,
          Visit__c: visit.id,
          Product__c: req.body.productId,
          Quantity__c: Number(req.body.quantity),
          Manufacturing_Date__c: req.body.manufacturingDate || null,
          Return_Reason__c: req.body.reason || "Other",
        });
        result = { ...req.body, id: created.id };
      } else if (path === "/api/competitor-activities") {
        const created: any = await salesforce.create(objectMap.competitor, {
          Outlet__c: visit.storeId,
          Visit__c: visit.id,
          Competitor_Name__c: req.body.competitorName,
          Company__c: req.body.company,
          MRP__c: Number(req.body.mrp || req.body.price || 0),
          RBP__c: Number(req.body.rbp || 0),
          Scheme_Details__c: req.body.promotion || req.body.remarks,
          Image_URL__c: req.body.imageUrl || null,
        });
        result = { ...req.body, id: created.id };
      } else if (path === "/api/tickets") {
        const created: any = await salesforce.create(objectMap.ticket, {
          Outlet__c: visit.storeId,
          Visit__c: visit.id,
          Subject__c: req.body.subject || req.body.ticketType,
          Description__c: req.body.description,
          Status__c: "Open",
          Image_URL__c: req.body.imageUrl || null,
        });
        result = { ...req.body, id: created.id };
      }
    }
    if (requestId) idempotency.set(requestId, result);
    const visit = visits.get(req.body.visitId);
    if (visit)
      (visit as any)[key] =
        key === "orderLines"
          ? req.body.items
          : [...(visit as any)[key], result];
    ok(res, result);
  });
app.post("/api/orders/:orderId/items", (req, res) =>
  ok(res, { orderId: req.params.orderId, items: req.body.items }),
);
app.post("/api/stock-checks", async (request, res) => {
  const req = request as AuthenticatedRequest;
  const visit = visits.get(req.body.visitId);
  if (!visit || visit.employeeId !== req.auth!.employeeId)
    return fail(res, 404, "Visit not found", "VISIT_NOT_FOUND");
  const created: any = env.USE_MOCK_DATA ? { id: `stock-${Date.now()}` } : await salesforce.create(objectMap.stockCheck, {
    Outlet__c: visit.storeId, Visit__c: visit.id, Product__c: req.body.productId,
    Quantity__c: Number(req.body.quantity || 0), Manufacturing_Date__c: req.body.manufacturingDate || null,
  });
  return ok(res, { ...req.body, id: created.id }, "Stock check saved in Salesforce");
});
app.post("/api/asset-surveys", async (request, res) => {
  const req = request as AuthenticatedRequest;
  const visit = visits.get(req.body.visitId);
  if (!visit || visit.employeeId !== req.auth!.employeeId)
    return fail(res, 404, "Visit not found", "VISIT_NOT_FOUND");
  const created: any = env.USE_MOCK_DATA ? { id: `asset-${Date.now()}` } : await salesforce.create(objectMap.assetSurvey, {
    Outlet__c: visit.storeId, Visit__c: visit.id, Asset_Code__c: req.body.assetCode,
    Asset_Name__c: req.body.assetName, Status__c: req.body.status || "Available",
    Given_Date__c: req.body.givenDate || new Date().toISOString().slice(0, 10), Picture_URL__c: req.body.pictureUrl || null,
  });
  return ok(res, { ...req.body, id: created.id }, "Asset survey saved in Salesforce");
});
app.post("/api/store/checkout", async (request, res) => {
  const req = request as AuthenticatedRequest;
  const visit = visits.get(req.body.visitId);
  if (!visit) return fail(res, 404, "Visit not found", "VISIT_NOT_FOUND");
  if (visit.employeeId !== req.auth!.employeeId)
    return fail(res, 403, "This visit belongs to another Employee", "VISIT_ACCESS_DENIED");
  visit.checkOut = {
    ...req.body.location,
    timestamp: new Date().toISOString(),
  };
  visit.remarks = req.body.remarks;
  visit.status = "Completed";
  if (!env.USE_MOCK_DATA)
    await salesforce.update(objectMap.visit, visit.id, {
      Status__c: "Completed",
      Check_Out_Time__c: visit.checkOut?.timestamp,
      Check_Out_Latitude__c: visit.checkOut?.latitude,
      Check_Out_Longitude__c: visit.checkOut?.longitude,
      Notes__c: visit.remarks,
    });
  const receiptItems = Array.isArray(req.body.items) ? req.body.items : [];
  let retailerEmailSent = false;
  let retailerEmailError: string | undefined;
  if (req.body.retailerEmail && receiptItems.length) {
    try {
      const schemeRows = env.USE_MOCK_DATA ? [] : await sfRecords(`SELECT Name FROM ${objectMap.scheme} WHERE Active__c = true ORDER BY End_Date__c LIMIT 20`);
      await sendRetailerOrderSummary(
        String(req.body.retailerEmail),
        String(req.body.outletName || visit.storeName),
        receiptItems,
        Number(req.body.totalAmount || 0),
        schemeRows.map((row) => row.Name),
      );
      retailerEmailSent = true;
    } catch (error: any) {
      retailerEmailError = error?.message || "Retailer email delivery failed";
      console.error("Visit completed, but the retailer email could not be sent", error);
    }
  }
  ok(res, { ...visit, retailerEmailSent, retailerEmailError }, "Visit completed successfully");
});
app.get("/api/visits/:visitId", (request, res) => {
  const req = request as AuthenticatedRequest;
  const visitId = Array.isArray(req.params.visitId) ? req.params.visitId[0] : req.params.visitId;
  const visit = visits.get(visitId);
  return visit && visit.employeeId === req.auth!.employeeId
    ? ok(res, visit)
    : fail(res, 404, "Visit not found", "VISIT_NOT_FOUND");
});
app.post("/api/documents/pdf", async (req, res) => {
  const buffer = await createPdf(req.body);
  res.type("pdf").send(buffer);
});
app.post("/api/documents/excel", async (req, res) => {
  const buffer = await createExcel(req.body);
  res
    .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .send(buffer);
});
async function loadVisitDocument(visitId: string, employeeId: string) {
  const activeVisit = visits.get(visitId);
  if (activeVisit?.employeeId === employeeId) return activeVisit;
  if (env.USE_MOCK_DATA) return undefined;

  const safeVisitId = escapeSoqlLiteral(visitId);
  const safeEmployeeId = escapeSoqlLiteral(employeeId);
  const visitRows = await sfRecords(
    `SELECT Id, Name, Status__c, Retailer__c, Retailer__r.Name, Check_In_Time__c, Check_Out_Time__c, Check_In_Latitude__c, Check_In_Longitude__c, Check_Out_Latitude__c, Check_Out_Longitude__c, Permanent_Journey_Plan__r.Beat__r.Name FROM ${objectMap.visit} WHERE Id = '${safeVisitId}' AND Retailer__c IN (${allocatedOutletIds(safeEmployeeId)}) LIMIT 1`,
  );
  if (!visitRows.length) return undefined;
  const row = visitRows[0];
  const itemRows = await sfRecords(
    `SELECT Product__c, Product__r.Name, Piece_Quantity__c, Unit_Price__c, Line_Amount__c, Scheme__c, Scheme__r.Name FROM ${objectMap.orderItem} WHERE Sales_Order__r.Visit__c = '${safeVisitId}' ORDER BY CreatedDate`,
  );
  return {
    id: row.Id,
    employeeId,
    storeId: row.Retailer__c,
    storeName: row.Retailer__r?.Name || row.Name,
    beatName: row.Permanent_Journey_Plan__r?.Beat__r?.Name || "-",
    status: row.Status__c,
    checkIn: row.Check_In_Time__c ? { latitude: Number(row.Check_In_Latitude__c || 0), longitude: Number(row.Check_In_Longitude__c || 0), timestamp: row.Check_In_Time__c } : undefined,
    checkOut: row.Check_Out_Time__c ? { latitude: Number(row.Check_Out_Latitude__c || 0), longitude: Number(row.Check_Out_Longitude__c || 0), timestamp: row.Check_Out_Time__c } : undefined,
    orderLines: itemRows.map((item) => ({
      productId: item.Product__c,
      productName: item.Product__r?.Name || "Product",
      quantity: Number(item.Piece_Quantity__c || 0),
      unitPrice: Number(item.Unit_Price__c || 0),
      discount: 0,
      amount: Number(item.Line_Amount__c || 0),
      schemeId: item.Scheme__c,
      schemeName: item.Scheme__r?.Name,
    })),
    returns: [],
    competitors: [],
    tickets: [],
  } satisfies VisitPayload;
}
app.get("/api/documents/:kind/:visitId", async (request, res) => {
  const req = request as AuthenticatedRequest;
  const visit = await loadVisitDocument(String(req.params.visitId), req.auth!.employeeId);
  if (!visit)
    return fail(res, 404, "Visit document is no longer available", "VISIT_NOT_FOUND");
  const kind = String(req.params.kind);
  if (kind !== "pdf" && kind !== "excel")
    return fail(res, 400, "Choose PDF or Excel", "DOCUMENT_TYPE_INVALID");
  const buffer = kind === "pdf" ? await createPdf(visit) : await createExcel(visit);
  const extension = kind === "pdf" ? "pdf" : "xlsx";
  res.setHeader("Content-Disposition", `attachment; filename=\"${visit.storeName.replace(/[^a-z0-9]+/gi, "-")}-visit.${extension}\"`);
  res.type(kind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(buffer);
});
app.post("/api/email/send", async (req, res) => {
  if (!env.SMTP_HOST)
    return fail(
      res,
      503,
      "Email service is not configured",
      "EMAIL_NOT_CONFIGURED",
    );
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  await transport.sendMail({
    from: env.EMAIL_FROM,
    to: req.body.to,
    cc: req.body.cc,
    subject: req.body.subject,
    text: req.body.body,
    attachments: req.body.attachments,
  });
  ok(res, {}, "Email sent");
});
app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(error);
    fail(res, 500, "Unable to complete operation", "INTERNAL_ERROR");
  },
);
