type Row = Record<string, any>;
type Reader = (query: string) => Promise<Row[]>;
/**
 * Convert a numeric Salesforce field to a number, treating a missing value as zero.
 */
const amount = (value: unknown) => Number(value || 0);
/**
 * Return a percentage rounded to one decimal place, or null when there is no positive
 * denominator.
 */
const percent = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 1000) / 10 : null;

/** Calendar dates use the business timezone, including the UTC/India midnight boundary. */
export function reportPeriod(now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month] = today.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const previous = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
  const priorDay = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
  /**
   * Offset the current reporting date by whole days to build stock-aging date boundaries.
   */
  const shift = (days: number) =>
    new Date(Date.parse(today + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
  return {
    today,
    start,
    previous,
    priorDay,
    nearExpiry: shift(30),
    movementFrom: shift(-30),
    timezone: "Asia/Kolkata",
  };
}

/**
 * Validate the distributor identifier and query scoped source records for management reports
 * before calculating the metrics.
 */
export async function distributorReports(id: string, records: Reader, now = new Date()) {
  if (!/^[a-zA-Z0-9]{18}$/.test(id)) throw new Error("Invalid distributor");
  const period = reportPeriod(now);
  const outletScope = `SELECT Id FROM Retailer__c WHERE DMS_Distributor__c='${id}'`;
  const orderScope = `DMS_Distributor__c='${id}' AND Order_Date__c>=${period.previous} AND Order_Date__c<=${period.today} AND Status__c IN ('Submitted','Fulfilled') AND (DMS_Status__c=null OR DMS_Status__c!='Rejected')`;
  // records() follows Salesforce nextRecordsUrl: reports must not use the UI's 200-row cap.
  const queries = {
    outlets: `SELECT Id,Name,Active__c,Beat__c,Beat__r.Name,Geography__c,Geography__r.Name FROM Retailer__c WHERE DMS_Distributor__c='${id}'`,
    orders: `SELECT Id,Retailer__c,Visit__c,Visit__r.Employee__c,Visit__r.Employee__r.Name,Order_Date__c,Total_Amount__c FROM Sales_Order__c WHERE ${orderScope}`,
    lines: `SELECT Id,Product__c,Product__r.Name,Line_Amount__c,Sales_Order__c FROM Order_Item__c WHERE Sales_Order__c IN (SELECT Id FROM Sales_Order__c WHERE ${orderScope})`,
    visits: `SELECT Id,Retailer__c,Status__c,Visit_Date__c FROM Visit__c WHERE Retailer__c IN (${outletScope}) AND Visit_Date__c>=${period.start} AND Visit_Date__c<=${period.today} AND Status__c!='Cancelled'`,
    plans: `SELECT Beat__c FROM PJP_Selected_Beat__c WHERE Beat__c IN (SELECT Beat__c FROM Retailer__c WHERE DMS_Distributor__c='${id}') AND PJP__r.Status__c='Approved' AND PJP__r.Planning_Start_Date__c<=${period.today} AND PJP__r.Planning_End_Date__c>=${period.start}`,
    inventory: `SELECT Id,Product__c,Product__r.Name,Batch_Number__c,Expiry_Date__c,On_Hand_Pieces__c,Available_Pieces__c,Low_Stock__c,Last_Stock_Update__c FROM DMS_Inventory__c WHERE Distributor__c='${id}'`,
    movement: `SELECT Product__c,Stock_Out_Pieces__c FROM DMS_Invoice_Line__c WHERE Invoice__r.Distributor__c='${id}' AND Invoice__r.Sales_Order__c != null AND Invoice__r.Status__c='Issued' AND Invoice__r.Invoice_Date__c>=${period.movementFrom} AND Invoice__r.Invoice_Date__c<=${period.today}`,
    targets: `SELECT Id,Month__c,Target_Amount__c,Employee__c,Employee__r.Name,Geography__c,Geography__r.Name,Product__c,Product__r.Name FROM DMS_Sales_Target__c WHERE Distributor__c='${id}' AND Month__c IN (${period.start},${period.previous})`,
  };
  const data: Record<string, Row[]> = {};
  for (const [key, query] of Object.entries(queries)) data[key] = await records(query);
  return calculateReports(data, period, now);
}

/**
 * Aggregate booked sales, targets, beat productivity, outlet coverage and stock observations
 * from the supplied source rows; no Salesforce records are written.
 */
export function calculateReports(
  data: Record<string, Row[]>,
  period: ReturnType<typeof reportPeriod>,
  now = new Date(),
) {
  const outlets = new Map(data.outlets.map((row) => [row.Id, row]));
  const orderMap = new Map(data.orders.map((row) => [row.Id, row]));
  const currentOrders = data.orders.filter((row) => row.Order_Date__c >= period.start);
  const sales: any = {
    current: 0,
    previous: 0,
    target: null,
    previousTarget: null,
    achievement: null,
    byEmployee: [],
    byArea: [],
    byProduct: [],
  };
  const dimensions = {
    byEmployee: new Map<string, Row>(),
    byArea: new Map<string, Row>(),
    byProduct: new Map<string, Row>(),
  };
  /**
   * Create or reuse a report bucket by employee, area or product, using an unassigned bucket
   * when the dimension is missing.
   */
  function group(kind: keyof typeof dimensions, id: string | undefined, name: string | undefined) {
    const key = id || "unassigned";
    if (!dimensions[kind].has(key))
      dimensions[kind].set(key, {
        id: key,
        name: name || "Not assigned",
        current: 0,
        previous: 0,
        target: null,
        previousTarget: null,
      });
    return dimensions[kind].get(key)!;
  }
  for (const row of data.orders) {
    const which = row.Order_Date__c >= period.start ? "current" : "previous";
    sales[which] += amount(row.Total_Amount__c);
    group("byEmployee", row.Visit__r?.Employee__c, row.Visit__r?.Employee__r?.Name)[which] +=
      amount(row.Total_Amount__c);
    const outlet = outlets.get(row.Retailer__c);
    group("byArea", outlet?.Geography__c, outlet?.Geography__r?.Name)[which] += amount(
      row.Total_Amount__c,
    );
  }
  for (const row of data.lines) {
    const order = orderMap.get(row.Sales_Order__c);
    if (order)
      group("byProduct", row.Product__c, row.Product__r?.Name)[
        order.Order_Date__c >= period.start ? "current" : "previous"
      ] += amount(row.Line_Amount__c);
  }
  for (const row of data.targets) {
    const key = row.Month__c === period.start ? "target" : "previousTarget";
    const target = amount(row.Target_Amount__c);
    if (row.Employee__c) group("byEmployee", row.Employee__c, row.Employee__r?.Name)[key] = target;
    else if (row.Geography__c)
      group("byArea", row.Geography__c, row.Geography__r?.Name)[key] = target;
    else if (row.Product__c) group("byProduct", row.Product__c, row.Product__r?.Name)[key] = target;
    else sales[key] = target;
  }
  sales.achievement = percent(sales.current, sales.target || 0);
  for (const [key, values] of Object.entries(dimensions))
    sales[key] = [...values.values()].map((row) => ({
      ...row,
      achievement: percent(row.current, row.target || 0),
    }));
  sales.basis =
    "Booked secondary orders: Submitted/Fulfilled, excluding distributor rejection. Not invoiced revenue or net of returns. Product breakdown uses line values; order totals may include tax.";

  const plannedBeats = new Set(data.plans.map((row) => row.Beat__c));
  const beatGroups = new Map<string, any>();
  const visited = new Set<string>();
  const productive = new Set<string>();
  const orderedVisitIds = new Set(currentOrders.map((row) => row.Visit__c).filter(Boolean));
  for (const visit of data.visits) {
    if (["Checked In", "Completed"].includes(visit.Status__c)) {
      visited.add(visit.Retailer__c);
      if (orderedVisitIds.has(visit.Id)) productive.add(visit.Retailer__c);
    }
  }
  const buyers = new Set(
    currentOrders.filter((row) => amount(row.Total_Amount__c) > 0).map((row) => row.Retailer__c),
  );
  const coverageAreas = new Map<string, any>();
  for (const outlet of data.outlets.filter((row) => row.Active__c)) {
    const beatId = outlet.Beat__c || "unassigned";
    if (!beatGroups.has(beatId))
      beatGroups.set(beatId, {
        id: beatId,
        name: outlet.Beat__r?.Name || "No beat assigned",
        assigned: 0,
        planned: 0,
        visited: 0,
        productive: 0,
      });
    const beat = beatGroups.get(beatId);
    beat.assigned++;
    if (plannedBeats.has(outlet.Beat__c)) beat.planned++;
    if (visited.has(outlet.Id)) beat.visited++;
    if (productive.has(outlet.Id)) beat.productive++;
    const areaId = outlet.Geography__c || "unassigned";
    if (!coverageAreas.has(areaId))
      coverageAreas.set(areaId, {
        id: areaId,
        name: outlet.Geography__r?.Name || "No area assigned",
        outlets: 0,
        buyers: 0,
      });
    const area = coverageAreas.get(areaId);
    area.outlets++;
    if (buyers.has(outlet.Id)) area.buyers++;
  }
  const areas = [...coverageAreas.values()].map((row) => ({
    ...row,
    percent: percent(row.buyers, row.outlets),
  }));
  const coverage = {
    outlets: areas.reduce((n, r) => n + r.outlets, 0),
    buyers: areas.reduce((n, r) => n + r.buyers, 0),
    percent: null as number | null,
    areas,
  };
  coverage.percent = percent(coverage.buyers, coverage.outlets);
  const moved = new Set(
    data.movement.filter((row) => amount(row.Stock_Out_Pieces__c) > 0).map((row) => row.Product__c),
  );
  const batches: Row[] = data.inventory.map((row) => {
    const inStock = amount(row.On_Hand_Pieces__c) > 0;
    return {
      ...row,
      expired: inStock && !!row.Expiry_Date__c && row.Expiry_Date__c < period.today,
      nearExpiry:
        inStock &&
        !!row.Expiry_Date__c &&
        row.Expiry_Date__c >= period.today &&
        row.Expiry_Date__c <= period.nearExpiry,
      noRecentSales: inStock && !moved.has(row.Product__c),
    };
  });
  return {
    period,
    calculatedAt: now.toISOString(),
    sales,
    beats: [...beatGroups.values()].map((row) => ({
      ...row,
      productivity: percent(row.productive, row.visited),
    })),
    coverage,
    stock: {
      onHand: batches.reduce((n, r) => n + amount(r.On_Hand_Pieces__c), 0),
      available: batches.reduce((n, r) => n + amount(r.Available_Pieces__c), 0),
      nearExpiry: batches.filter((r) => r.nearExpiry).length,
      expired: batches.filter((r) => r.expired).length,
      noRecentSales: batches.filter((r) => r.noRecentSales).length,
      batches,
    },
    definitions: {
      beats:
        "Unique active assigned outlets in approved monthly PJP beats; visited = Checked In or Completed; productive = visited outlets with a qualifying order on that visit. Ad-hoc visits can exceed planned shops.",
      coverage:
        "Active assigned outlets with a positive booked order this month / active assigned outlets.",
      stock:
        "Near expiry = next 30 days. No recent sales = no issued invoice stock movement in the past 30 days; new stock may also be flagged. Review before calling it slow-moving.",
    },
  };
}
