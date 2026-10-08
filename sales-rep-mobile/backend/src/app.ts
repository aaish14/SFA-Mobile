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
import { authenticateDistributor } from "./services/authService.js";
import { escapeSoqlLiteral } from "./utils/salesforce.js";
export const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "5mb" }));
const visits = new Map<string, VisitPayload>();
const idempotency = new Map<string, unknown>();
const sfRecords = async (soql: string) => salesforce.records(soql);
type AuthClaims = {
  sub: string;
  displayName: string;
  distributorId: string;
  distributorName: string;
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
app.post("/api/auth/login", async (req, res) => {
  const username = String(req.body.username || req.body.email || "").trim();
  const password = String(req.body.password || "");
  if (!username || !password)
    return fail(
      res,
      400,
      "Email and password are required",
      "VALIDATION_ERROR",
    );
  const configuredUser = authenticateDistributor(username, password);
  if (!configuredUser)
    return fail(res, 401, "Invalid username or password", "INVALID_LOGIN");
  let distributorId = `mock-${configuredUser.accountName.toLowerCase().replace(/\W+/g, "-")}`;
  if (!env.USE_MOCK_DATA) {
    const accountName = escapeSoqlLiteral(configuredUser.accountName);
    const accounts = await sfRecords(
      `SELECT Id, Name FROM Account WHERE Name = '${accountName}' LIMIT 1`,
    );
    if (!accounts.length)
      return fail(
        res,
        403,
        "The distributor account is not available in Salesforce",
        "DISTRIBUTOR_NOT_FOUND",
      );
    distributorId = accounts[0].Id;
  }
  const claims: AuthClaims = {
    sub: configuredUser.username,
    displayName: configuredUser.displayName,
    distributorId,
    distributorName: configuredUser.accountName,
  };
  ok(res, {
    token: jwt.sign(claims, env.JWT_SECRET, {
      expiresIn: "8h",
    }),
    user: claims,
  });
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
      distributorName: req.auth?.distributorName,
      schemes,
      dataState: "LIVE",
    });
  const distributorId = escapeSoqlLiteral(req.auth!.distributorId);
  const [users, schemeRows, pendingOrders, todayVisits, completedVisits] =
    await Promise.all([
      sfRecords("SELECT Name FROM User WHERE IsActive = true ORDER BY LastLoginDate DESC NULLS LAST LIMIT 1"),
      sfRecords(`SELECT Id, Name, Scheme_Code__c, Scheme_Type__c, Description__c, Discount_Percent__c, Minimum_Quantity__c, Free_Quantity__c, Product__r.Name, Free_Product__r.Name, End_Date__c FROM ${objectMap.scheme} WHERE Active__c = true ORDER BY End_Date__c DESC NULLS LAST`),
      sfRecords(`SELECT COUNT(Id) total FROM ${objectMap.order} WHERE Status__c != 'Completed' AND Retailer__r.Distributor__c = '${distributorId}'`),
      sfRecords(`SELECT COUNT(Id) total FROM ${objectMap.visit} WHERE Visit_Date__c = TODAY AND Retailer__r.Distributor__c = '${distributorId}'`),
      sfRecords(`SELECT COUNT(Id) total FROM ${objectMap.visit} WHERE Visit_Date__c = TODAY AND Status__c = 'Completed' AND Retailer__r.Distributor__c = '${distributorId}'`),
    ]);
  const mappedSchemes = schemeRows.map((row) => ({
    id: row.Id,
    name: row.Name,
    code: row.Scheme_Code__c,
    type: row.Scheme_Type__c,
    product: row.Product__r?.Name || row.Free_Product__r?.Name,
    description: row.Description__c,
    benefit: row.Free_Quantity__c
      ? `Minimum ${row.Minimum_Quantity__c || 0} • Get ${row.Free_Quantity__c} free`
      : `${row.Discount_Percent__c || 0}% discount`,
    endDate: row.End_Date__c,
  }));
  ok(res, {
    distributorName: req.auth?.distributorName,
    userName: req.auth?.displayName || users[0]?.Name,
    pendingOrders: Number(pendingOrders[0]?.total || 0),
    todayVisits: Number(todayVisits[0]?.total || 0),
    completedVisits: Number(completedVisits[0]?.total || 0),
    schemes: mappedSchemes,
    dataState: "LIVE",
  });
});

app.get("/api/visits", async (request, res) => {
  if (env.USE_MOCK_DATA) return ok(res, []);
  const req = request as AuthenticatedRequest;
  const distributorId = escapeSoqlLiteral(req.auth!.distributorId);
  const rows = await sfRecords(`SELECT Id, Name, Visit_Number__c, Visit_Date__c, Status__c, Employee__r.Name, Sales_Representative__r.Name, Retailer__c, Retailer__r.Name, Outlet_Name__c, Outlet_Geo_Location__Latitude__s, Outlet_Geo_Location__Longitude__s, Previous_Order_Date__c, Previous_Order_Value__c, Order_Gross_Amount__c, Order_Tax__c, Order_Total__c, Order_Total_Quantity__c FROM ${objectMap.visit} WHERE Retailer__r.Distributor__c = '${distributorId}' ORDER BY Visit_Date__c DESC, CreatedDate DESC LIMIT 200`);
  ok(res, rows.map((row) => ({
    id: row.Id,
    visitNumber: row.Visit_Number__c,
    name: row.Name,
    date: row.Visit_Date__c,
    status: row.Status__c,
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
  const distributorId = escapeSoqlLiteral(req.auth!.distributorId);
  const outletId = escapeSoqlLiteral(String(req.body.outletId));
  const outlets = await sfRecords(
    `SELECT Id, Beat__c FROM ${objectMap.store} WHERE Id = '${outletId}' AND Distributor__c = '${distributorId}' LIMIT 1`,
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
    Employee__c: req.body.employeeId || null,
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
  const rows = await sfRecords(
    `SELECT Id, Name, Scheme_Code__c, Description__c, Discount_Percent__c, End_Date__c FROM ${objectMap.scheme} WHERE Active__c = true ORDER BY End_Date__c`,
  );
  ok(
    res,
    rows.map((row) => ({
      id: row.Id,
      name: row.Name,
      code: row.Scheme_Code__c,
      description: row.Description__c,
      discountPercent: row.Discount_Percent__c,
      endDate: row.End_Date__c,
    })),
  );
});
app.get("/api/products", async (_, res) => {
  if (env.USE_MOCK_DATA) return ok(res, products);
  const rows = await sfRecords(
    `SELECT Id, Name, Product_Code__c, Brand__c, Package_Type__c, MRP__c, Retailer_Base_Price__c, Selling_Price__c, GST_Percent__c, Available_Stock__c, Units_Per_Case__c, Active__c FROM ${objectMap.product} WHERE Sellable__c = true ORDER BY Name`,
  );
  ok(
    res,
    rows.map((row) => ({
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
    })),
  );
});
app.get("/api/outlets", async (request, res) => {
  const req = request as AuthenticatedRequest;
  if (env.USE_MOCK_DATA) return ok(res, stores);
  const distributorId = escapeSoqlLiteral(req.auth!.distributorId);
  const rows = await sfRecords(
    `SELECT Id, Name, Address__c, Phone__c, Email__c, Outlet_Owner_Name__c, Outlet_Type__c, Outstanding_Amount__c, Active__c, Beat__c, Beat__r.Name, Geography__r.Name, Geo_Location__Latitude__s, Geo_Location__Longitude__s, Latitude__c, Longitude__c FROM ${objectMap.store} WHERE Distributor__c = '${distributorId}' ORDER BY Name LIMIT 500`,
  );
  ok(
    res,
    rows.map((row) => ({
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
    })),
  );
});

app.get("/api/orders", async (request, res) => {
  const req = request as AuthenticatedRequest;
  if (env.USE_MOCK_DATA) return ok(res, []);
  const distributorId = escapeSoqlLiteral(req.auth!.distributorId);
  const rows = await sfRecords(
    `SELECT Id, Name, Order_Date__c, Status__c, Total_Amount__c, Total_Quantity__c, Retailer__c, Retailer__r.Name FROM ${objectMap.order} WHERE Retailer__r.Distributor__c = '${distributorId}' ORDER BY Order_Date__c DESC, CreatedDate DESC LIMIT 200`,
  );
  ok(
    res,
    rows.map((row) => ({
      id: row.Id,
      orderNumber: row.Name,
      date: row.Order_Date__c,
      status: row.Status__c,
      amount: row.Total_Amount__c || 0,
      totalQuantity: row.Total_Quantity__c || 0,
      outletId: row.Retailer__c,
      outletName: row.Retailer__r?.Name,
    })),
  );
});
app.get("/api/beats", async (request, res) => {
  if (env.USE_MOCK_DATA) return ok(res, beats);
  const req = request as AuthenticatedRequest;
  const distributorId = escapeSoqlLiteral(req.auth!.distributorId);
  const rows = await sfRecords(
    `SELECT Id, Name, Outlet_Count__c, Outlet_Names__c FROM ${objectMap.beat} WHERE Active__c = true AND Id IN (SELECT Beat__c FROM ${objectMap.store} WHERE Distributor__c = '${distributorId}') ORDER BY Name`,
  );
  ok(
    res,
    rows.map((row) => ({
      id: row.Id,
      name: row.Name,
      storeCount: row.Outlet_Count__c || 0,
      outletNames: row.Outlet_Names__c,
    })),
  );
});
app.get("/api/beats/:beatId/stores", async (request, res) => {
  const req = request as AuthenticatedRequest;
  if (env.USE_MOCK_DATA)
    return ok(
      res,
      stores.filter((store) => store.beatId === req.params.beatId),
    );
  const beatId = escapeSoqlLiteral(String(req.params.beatId));
  const distributorId = escapeSoqlLiteral(req.auth!.distributorId);
  const rows = await sfRecords(
    `SELECT Id, Name, Address__c, Phone__c, Outlet_Type__c, Outstanding_Amount__c, Beat__r.Name, Geo_Location__Latitude__s, Geo_Location__Longitude__s, Latitude__c, Longitude__c FROM ${objectMap.store} WHERE Beat__c = '${beatId}' AND Distributor__c = '${distributorId}' AND Active__c = true ORDER BY Name`,
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
    const distributorId = escapeSoqlLiteral(req.auth!.distributorId);
    const rows = await sfRecords(
      `SELECT Id, Name, Beat__c, Beat__r.Name, Address__c, Phone__c, Outlet_Type__c, Outstanding_Amount__c, Active__c, Geo_Location__Latitude__s, Geo_Location__Longitude__s, Latitude__c, Longitude__c FROM ${objectMap.store} WHERE Id = '${storeId}' AND Distributor__c = '${distributorId}' LIMIT 1`,
    );
    if (!rows.length)
      return fail(res, 404, "Store not found", "STORE_NOT_FOUND");
    const row = rows[0];
    return ok(res, {
      id: row.Id,
      beatId: row.Beat__c,
      code: row.Id.slice(-6).toUpperCase(),
      name: row.Name,
      address: row.Address__c,
      phone: row.Phone__c,
      type: row.Outlet_Type__c,
      beatName: row.Beat__r?.Name,
      active: row.Active__c,
      outstandingAmount: row.Outstanding_Amount__c || 0,
      latitude: row.Geo_Location__Latitude__s || row.Latitude__c,
      longitude: row.Geo_Location__Longitude__s || row.Longitude__c,
    });
  }
  const store = stores.find((s) => s.id === req.params.storeId);
  return store
    ? ok(res, store)
    : fail(res, 404, "Store not found", "STORE_NOT_FOUND");
});
app.post("/api/day/start", async (req, res) => {
  const data = {
    id: `day-${Date.now()}`,
    startTime: new Date().toISOString(),
    location: req.body.location,
    status: "Started",
  };
  if (!env.USE_MOCK_DATA)
    await salesforce.create(objectMap.attendance, {
      Attendance_Date__c: new Date().toISOString().slice(0, 10),
      Start_Time__c: data.startTime,
      Start_Latitude__c: req.body.location.latitude,
      Start_Longitude__c: req.body.location.longitude,
      Status__c: "Started",
    });
  ok(res, data, "Day started");
});
app.post("/api/day/end", async (request, res) => {
  const req = request as AuthenticatedRequest;
  const requestId = String(req.body.requestId || "");
  if (requestId && idempotency.has(requestId))
    return ok(res, idempotency.get(requestId), "Duplicate request safely reused");
  const endTime = new Date().toISOString();
  const location = req.body.location;
  if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude)))
    return fail(res, 400, "A valid end-day location is required", "LOCATION_REQUIRED");
  let attendanceId: string | undefined;
  if (!env.USE_MOCK_DATA) {
    const rows = await sfRecords(
      `SELECT Id FROM ${objectMap.attendance} WHERE Attendance_Date__c = TODAY AND Status__c = 'Started' ORDER BY CreatedDate DESC LIMIT 1`,
    );
    if (!rows.length)
      return fail(res, 422, "Start Day must be completed before End Day", "DAY_NOT_STARTED");
    attendanceId = rows[0].Id;
    await salesforce.update(objectMap.attendance, attendanceId!, {
      End_Time__c: endTime,
      End_Latitude__c: Number(location.latitude),
      End_Longitude__c: Number(location.longitude),
      Status__c: "Completed",
    });
  }
  const result = { attendanceId, endTime, location, distributorName: req.auth!.distributorName };
  if (requestId) idempotency.set(requestId, result);
  return ok(res, result, "Day ended successfully");
});
app.post("/api/store/validate-location", async (request, res) => {
  const req = request as AuthenticatedRequest;
  const storeId = escapeSoqlLiteral(String(req.body.storeId || ""));
  const distributorId = escapeSoqlLiteral(req.auth!.distributorId);
  const store = env.USE_MOCK_DATA
    ? stores.find((item) => item.id === req.body.storeId)
    : (
        await sfRecords(
          `SELECT Id, Name, Beat__c, Address__c, Geo_Location__Latitude__s, Geo_Location__Longitude__s, Latitude__c, Longitude__c FROM ${objectMap.store} WHERE Id = '${storeId}' AND Distributor__c = '${distributorId}' LIMIT 1`,
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
  const distributorId = escapeSoqlLiteral(req.auth!.distributorId);
  const store = env.USE_MOCK_DATA
    ? stores.find((item) => item.id === req.body.storeId)
    : (
        await sfRecords(
          `SELECT Id, Name, Beat__c FROM ${objectMap.store} WHERE Id = '${storeId}' AND Distributor__c = '${distributorId}' LIMIT 1`,
        )
      ).map((row) => ({ id: row.Id, name: row.Name, beatId: row.Beat__c }))[0];
  if (!store) return fail(res, 404, "Store not found", "STORE_NOT_FOUND");
  let salesforceVisitId: string | undefined;
  if (!env.USE_MOCK_DATA) {
    const plans = await sfRecords(
      `SELECT Id FROM ${objectMap.journeyPlan} WHERE Beat__c = '${store.beatId}' AND Status__c = 'Approved' ORDER BY Planned_Date__c DESC LIMIT 1`,
    );
    if (!plans.length)
      return fail(
        res,
        422,
        "No approved journey plan exists for this outlet's beat.",
        "APPROVED_PJP_REQUIRED",
      );
    const created: any = await salesforce.create(objectMap.visit, {
      Name: `${store.name} ${new Date().toLocaleDateString("en-IN")}`,
      Retailer__c: store.id,
      Permanent_Journey_Plan__c: plans[0].Id,
      Visit_Date__c: new Date().toISOString().slice(0, 10),
      Status__c: "Checked In",
      Check_In_Time__c: new Date().toISOString(),
      Check_In_Latitude__c: req.body.location.latitude,
      Check_In_Longitude__c: req.body.location.longitude,
      Outlet_Geo_Location__Latitude__s: req.body.location.latitude,
      Outlet_Geo_Location__Longitude__s: req.body.location.longitude,
      Offline_Key__c: id,
    });
    salesforceVisitId = created.id;
  }
  const visit: VisitPayload = {
    id: salesforceVisitId || id,
    distributorId: req.auth!.distributorId,
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
      if (visit.distributorId !== req.auth!.distributorId)
        return fail(res, 403, "This visit belongs to another distributor", "VISIT_ACCESS_DENIED");
      if (path === "/api/orders") {
        const requestedItems = Array.isArray(req.body.items) ? req.body.items : [];
        if (!requestedItems.length)
          return fail(res, 400, "At least one order item is required", "ORDER_ITEMS_REQUIRED");
        const productIds = [...new Set(requestedItems.map((item: any) => String(item.productId || "")))]
          .filter(Boolean);
        const safeIds = productIds.map((id) => `'${escapeSoqlLiteral(id)}'`).join(",");
        const productRows = await sfRecords(
          `SELECT Id, Name, Product_Code__c, Selling_Price__c, GST_Percent__c, Available_Stock__c, Units_Per_Case__c, Active__c, Sellable__c FROM ${objectMap.product} WHERE Id IN (${safeIds})`,
        );
        const productById = new Map(productRows.map((product) => [product.Id, product]));
        const lines = requestedItems.map((item: any) => {
          const product = productById.get(String(item.productId));
          const quantity = Number(item.quantity || 0);
          if (!product || !product.Active__c || !product.Sellable__c)
            throw new Error(`Product ${item.productId} is not available for sale`);
          if (!Number.isFinite(quantity) || quantity <= 0)
            throw new Error(`Quantity must be greater than zero for ${product.Name}`);
          if (quantity > Number(product.Available_Stock__c || 0))
            throw new Error(`Insufficient stock for ${product.Name}`);
          const unitPrice = Number(product.Selling_Price__c || 0);
          const grossAmount = quantity * unitPrice;
          const taxAmount = grossAmount * Number(product.GST_Percent__c || 0) / 100;
          return { product, quantity, unitPrice, grossAmount, taxAmount, totalAmount: grossAmount + taxAmount };
        });
        const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
        const grossAmount = lines.reduce((sum, line) => sum + line.grossAmount, 0);
        const taxAmount = lines.reduce((sum, line) => sum + line.taxAmount, 0);
        const totalAmount = grossAmount + taxAmount;
        const createdOrder: any = await salesforce.create(objectMap.order, {
          Order_Date__c: new Date().toISOString().slice(0, 10),
          Status__c: "Submitted",
          Retailer__c: visit.storeId,
          Visit__c: visit.id,
          Total_Quantity__c: totalQuantity,
          Gross_Amount__c: grossAmount,
          Tax_Amount__c: taxAmount,
          Total_Amount__c: totalAmount,
        });
        const records = [];
        for (const line of lines) {
          const createdItem: any = await salesforce.create(objectMap.orderItem, {
            Sales_Order__c: createdOrder.id,
            Product__c: line.product.Id,
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
app.post("/api/store/checkout", async (request, res) => {
  const req = request as AuthenticatedRequest;
  const visit = visits.get(req.body.visitId);
  if (!visit) return fail(res, 404, "Visit not found", "VISIT_NOT_FOUND");
  if (visit.distributorId !== req.auth!.distributorId)
    return fail(res, 403, "This visit belongs to another distributor", "VISIT_ACCESS_DENIED");
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
  ok(res, visit, "Visit completed successfully");
});
app.get("/api/visits/:visitId", (request, res) => {
  const req = request as AuthenticatedRequest;
  const visit = visits.get(req.params.visitId);
  return visit && visit.distributorId === req.auth!.distributorId
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
