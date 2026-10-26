// Read-only UI regression checks. All authentication/data dependencies are stubs;
// this script never signs in, sends email, or contacts Salesforce.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const native = require("react-native-web");
const root = path.resolve(__dirname, "..");
let overrides = [],
  stateIndex = 0;
let formOverrides = [], formStateIndex = 0, formError = "";
let portalWidth = 390;
const portalPlatform = {OS: "web"};
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  cache.set(file, mod);
  mod.require = (name) => {
    if (name.endsWith(".png")) return {uri: "nestle-logo.png"};
    if (name === "react-native") return file.endsWith("PortalFrame.tsx")
      ? {...native, Platform: portalPlatform, useWindowDimensions: () => ({width: portalWidth, height: 900, scale: 1, fontScale: 1})} : {...native, Platform: portalPlatform};
    if (name === "react" && file.endsWith("PortalFrame.tsx")) return {...React, useState: initial => [initial, () => {}]};
    if (name === "react" && file.endsWith("PrimaryOrderForm.tsx"))
      return { ...React, useEffect: () => {}, useState: initial => {
        const index = formStateIndex++;
        return [index < formOverrides.length ? formOverrides[index] : initial, value => { if(index === 1) formError = value; }];
      } };
    if (name === "react" && file.endsWith("DmsApp.tsx"))
      return {
        ...React,
        useState: (initial) =>
          React.useState(
            stateIndex < overrides.length ? overrides[stateIndex++] : initial,
          ),
      };
    if (name === "./api" || name === "../api")
      return {
        request: () => {
          throw Error("Network calls are forbidden in UI checks");
        },
        ApiError: class extends Error {},
      };
    if (name === "./storage" || name === "expo-crypto") return {};
    if (name.startsWith(".")) {
      const base = path.resolve(path.dirname(file), name);
      for (const ext of [".tsx", ".ts"])
        if (fs.existsSync(base + ext)) return load(base + ext);
    }
    return Module.prototype.require.call(mod, name);
  };
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
  return mod.exports;
}
const App = load(path.join(root, "src/DmsApp.tsx")).default;
const session = {
  id: "ui-only",
  name: "Preview Distributor",
  token: "not-a-real-token",
};
const snapshot = {
  distributor: { Officer__r: { Name: "Preview Officer" } },
  retrievedAt: "2026-10-21T10:00:00Z",
  truncatedLists: [],
  primaryOrders: [],
  secondaryOrders: [],
  receipts: [],
  invoices: [],
  inventory: [],
  outlets: [],
  stockChecks: [],
};
function render(tab, signedIn = true, data = snapshot, offline = false, needsSignIn = false, sent = false, resendSeconds = 0, extraStates = {}) {
  stateIndex = 0;
  overrides = [signedIn ? session : null, signedIn ? data : null, [], tab, "", "", sent, false, "", offline];
  overrides.push("", "Product", "", {}, null, "", "", "", null, false, needsSignIn, resendSeconds);
  Object.assign(overrides, extraStates);
  return renderToStaticMarkup(React.createElement(App));
}
assert.match(render("Home", false), /Distributor login email/);
assert.match(render("Primary"), /Place Primary Order/);
for (const status of ["Pending", "Approved", "Rejected"]) {
  const secondary = render("Secondary", true, {...snapshot,
    secondaryOrders: [{Id: "so-auto", Name: "SO-AUTO-TEST", DMS_Status__c: status,
      Retailer__r: {Name: "Test outlet"}, Total_Amount__c: 100,
      lines: [{Id: "line-auto", Product__r: {Name: "Test product"}, Piece_Quantity__c: 2, Line_Amount__c: 100}]}]});
  assert.match(secondary, new RegExp("SO-AUTO-TEST.*" + status));
  assert.match(secondary, /Test product/);
  assert.doesNotMatch(secondary, /Decision notes|>Approve<|>Reject</);
  if (status === "Pending") assert.match(secondary, /Awaiting Salesforce automatic approval/);
}
assert.match(render("Home"), /Approved outlet orders/);
assert.doesNotMatch(render("Home"), /Outlet orders awaiting decision|record your decision/);
const { receiptExpiry, validateGoodsReceipt } = load(path.join(root, "src/goodsReceipt.ts"));
assert.equal(receiptExpiry("14-12-2026"), "2026-12-14");
assert.equal(receiptExpiry("2026-12-14"), "2026-12-14");
assert.equal(receiptExpiry("29-02-2028"), "2028-02-29");
for (const invalid of ["31-02-2026", "2026-02-29", "2026-13-01", "14/12/26", "", "2026-12-00"])
  assert.equal(receiptExpiry(invalid), null);
assert.deepEqual(validateGoodsReceipt("01", " 01 ", "14-12-2026").value, {cases: 1, batch: "01", expiry: "2026-12-14"});
for (const cases of ["0", "-1", "1.5", "100001", ""])
  assert.ok(validateGoodsReceipt(cases, "01", "2026-12-14").error);
assert.ok(validateGoodsReceipt("1", "", "2026-12-14").error);
assert.match(validateGoodsReceipt("20", "100", "14-12-2026", 1).error, /approves 1 case\(s\), but you entered 20/);
assert.equal(validateGoodsReceipt("1", "100", "14-12-2026", 1).value.cases, 1);
for (const maximum of [0, -1, NaN]) assert.ok(validateGoodsReceipt("1", "100", "14-12-2026", maximum).error);
const receiptForm = render("Primary", true, snapshot, false, false, false, 0, {
  14: {Id: "line1", receiptKind: "Paid", Product__r: {Name: "Yippee"}},
  15: "01", 16: "01", 17: "14-12-2026", 22: "Enter a valid expiry date."
});
assert.match(receiptForm, /YYYY-MM-DD or DD-MM-YYYY/);
assert.match(receiptForm, /Enter a valid expiry date/);
assert.match(receiptForm, /Confirm and save to create the receipt in Salesforce/);
assert.match(receiptForm, /Previous receipts reduce the remaining quantity/);
const receiptList = render("Primary", true, {...snapshot, receipts: [{Id: "grn1", Name: "GRN-TEST", Status__c: "Received", Total_Pieces__c: 72, Total_Value__c: 918}]});
assert.match(receiptList, /Goods receipts saved in Salesforce/);
assert.match(receiptList, /GRN-TEST/);
assert.match(receiptList, /72 pieces/);
assert.match(render("Primary", true, snapshot, true), /Open sync and sign-in/);
assert.doesNotMatch(render("Primary", true, snapshot, true), /No primary records are currently linked/);
assert.match(render("Sync", true, snapshot, true), /Sign in again/);
for (const tab of ["Home", "Primary", "Sync"]) {
  const renewal = render(tab, true, snapshot, true, true);
  assert.match(renewal, /Your distribution workspace/);
  assert.match(renewal, /Distributor login email/);
  assert.match(renewal, /Email my sign-in code/);
  assert.doesNotMatch(renewal, /Business overview|Place Primary Order|Sync centre|Preview Officer/);
}
assert.match(render("Home", false), /Email my sign-in code/);
assert.match(render("Home", false), /I already received a code/);
const codeEntry = render("Home", false, null, false, false, true);
assert.match(codeEntry, /Six-digit code/);
assert.match(codeEntry, /Verify and sign in/);
assert.match(codeEntry, /Send a new code/);
assert.match(codeEntry, /Change email address/);
assert.match(render("Home", false, null, false, false, true, 42), /Resend code in 42s/);
assert.doesNotMatch(codeEntry, /I already received a code/);
assert.match(render("Home"), /Business overview/);
assert.match(render("Home"), /Preview Officer/);
assert.match(render("Home"), /Purchased vs sold/);
assert.match(render("Home"), /Dashboard and reports/);
assert.match(render("More"), /Outlet assets/);
assert.match(render("Assets"), /No assets records are currently linked/);
assert.match(render("Reports"), /Reports have not loaded/);
const returnSnapshot = {...snapshot,
  primaryReturns: [{Id: "pr1", Name: "PRIMARY-RETURN-TEST", Status__c: "Submitted",
    Employee__r: {Name: "Test employee"}, Total_Cases__c: 2, Total_Amount__c: 400}],
  returns: [{Id: "sr1", Name: "SECONDARY-RETURN-TEST", DMS_Status__c: "Pending",
    Outlet__r: {Name: "Test outlet"}, Product__r: {Name: "Test product"}, Quantity__c: 3,
    Return_Reason__c: "Damaged"}]};
const primaryReturns = render("Returns", true, returnSnapshot);
assert.match(primaryReturns, /Primary returns/);
assert.match(primaryReturns, /Secondary returns/);
assert.match(primaryReturns, /PRIMARY-RETURN-TEST/);
assert.match(primaryReturns, /2 cases/);
assert.doesNotMatch(primaryReturns, /SECONDARY-RETURN-TEST|Decision notes/);
const secondaryReturns = render("Returns", true, returnSnapshot, false, false, false, 0, {25: "Secondary"});
assert.match(secondaryReturns, /SECONDARY-RETURN-TEST/);
assert.match(secondaryReturns, /3 pieces/);
assert.match(secondaryReturns, /Damaged/);
assert.match(secondaryReturns, /Approve/);
assert.match(secondaryReturns, /Reject/);
assert.doesNotMatch(secondaryReturns, /PRIMARY-RETURN-TEST/);
assert.match(render("Returns"), /No primary returns/);
assert.match(render("Returns", true, snapshot, false, false, false, 0, {25: "Secondary"}), /No secondary returns/);
const reports = {
  period: { start: "2026-10-01", today: "2026-10-21" },
  calculatedAt: "2026-10-21T10:00:00Z",
  sales: {
    current: 200,
    previous: 100,
    target: 500,
    previousTarget: null,
    achievement: 40,
    byEmployee: [],
    byArea: [],
    byProduct: [],
    basis: "Booked sales",
  },
  beats: [
    {
      id: "beat1",
      name: "Fixture beat",
      assigned: 2,
      planned: 2,
      visited: 1,
      productive: 1,
      productivity: 100,
    },
  ],
  coverage: { buyers: 1, outlets: 2, percent: 50, areas: [] },
  stock: {
    onHand: 20,
    available: 18,
    nearExpiry: 1,
    expired: 0,
    noRecentSales: 1,
    batches: [],
  },
  definitions: {
    beats: "Planned shops",
    coverage: "Active buyers",
    stock: "No invoice movement",
  },
};
const reportMarkup = render("Reports", true, { ...snapshot, reports });
for (const title of [
  "BEAT PRODUCTIVITY",
  "OUTLET COVERAGE",
  "DISTRIBUTOR STOCK",
])
  assert.ok(reportMarkup.includes(title));
for (const screen of ["Home", "Reports"]) {
  assert.doesNotMatch(render(screen, true, {...snapshot, reports}), /SALES VS TARGET|By employee|By area|By product|Target not configured/);
}
assert.doesNotMatch(render("More"), /Sales targets/);
for (const platform of ["android", "ios"]) {
  portalPlatform.OS = platform;
  for (const screen of ["Home", "Reports"]) {
    assert.match(render(screen, true, {...snapshot, reports}), /SALES VS TARGET/);
  }
}
portalPlatform.OS = "web";
assert.match(reportMarkup, /Fixture beat/);
assert.match(
  render("Assets", true, {
    ...snapshot,
    assets: [
      {
        Id: "asset1",
        Asset_Name__c: "Display cooler",
        Status__c: "Working",
        Outlet__r: { Name: "Fixture outlet" },
      },
    ],
  }),
  /Display cooler/,
);
assert.match(render("Home", true, null), /No Salesforce snapshot/);
for (const tab of [
  "Primary",
  "Secondary",
  "Inventory",
  "Outlets",
  "Stock checks",
]) {
  assert.match(render(tab), /No .* records are currently linked/);
}
assert.match(render("More"), /Support tickets/);
assert.match(render("More"), /Log out/);
for (const tab of ["Returns", "Tickets", "Sync"])
  assert.ok(render(tab).includes("DMS Distributor Portal") || render(tab).includes("DISTRIBUTOR PORTAL") || render(tab).includes("Expand sidebar"));
const { BottomNavigation, MenuItem } = load(
  path.join(root, "src/components/Workspace.tsx"),
);
for (const tab of [
  "Home",
  "Primary",
  "Secondary",
  "Inventory",
  "Outlets",
  "More",
  "Returns",
  "Tickets",
  "Stock checks",
  "Sync",
]) {
  let target;
  const nav = BottomNavigation({ tab, onSelect: (value) => (target = value) });
  const items = nav.props.children;
  assert.equal(
    items.filter((item) => item.props.accessibilityState.selected).length,
    1,
  );
  items.forEach((item) => {
    item.props.onPress();
    assert.equal(target, item.key);
  });
}
let opened = false;
MenuItem({
  title: "Support",
  description: "",
  icon: "",
  onPress: () => (opened = true),
}).props.onPress();
assert.ok(opened);
// Exercise the real form validation and review callback with synthetic catalogue data.
const Form = load(path.join(root, "src/components/PrimaryOrderForm.tsx")).default;
const primaryProduct = { Id: "product", Name: "Fixture cases", DMS_Case_Price__c: 100, Units_Per_Case__c: 10,
  schemes: [{ Id: "scheme", Name: "Buy two get one", Minimum_Cases__c: 2, Free_Cases__c: 1 }] };
function form(cases = "2", price = 100) {
  formStateIndex = 0; formError = "";
  formOverrides = [{ distributor: { Name: "Fixture distributor", Officer__r: { Name: "Fixture DO", IsActive: true } }, products: [{ ...primaryProduct, DMS_Case_Price__c: price }] }, "", "", "", { product: { cases, schemeId: "scheme" } }, false];
  let reviewed;
  const tree = Form({ token: "synthetic", disabled: false, onReview: body => { reviewed = body; } });
  function walk(node) {
    if (!node || typeof node !== "object") return [];
    return [node, ...React.Children.toArray(node.props?.children).flatMap(walk)];
  }
  const review = walk(tree).find(node => node.props?.onPress && node.props?.children?.props?.children === "Review order for approval");
  assert.ok(review); review.props.onPress();
  return { markup: renderToStaticMarkup(tree), reviewed };
}
const valid = form();
assert.deepEqual(valid.reviewed.lines, [{ productId: "product", cases: 2, schemeId: "scheme" }]);
assert.match(valid.markup, /Quantity \(whole cases\)/); assert.match(valid.markup, /Applicable Primary schemes/);
assert.match(valid.markup, /Buy two get one/); assert.match(valid.markup, /Fixture DO/);
assert.equal(form("1").reviewed, undefined); assert.match(formError, /scheme minimum/);
assert.equal(form("0.5").reviewed, undefined); assert.match(formError, /whole cases/);
assert.equal(form("2", null).reviewed, undefined); assert.match(formError, /case pricing/);
formStateIndex = 0;
formOverrides = [null, "Please sign in to DMS again", "", "", {}, false, true];
let renewalOpened = false;
const expiredForm = Form({ token: "expired", disabled: false, onReview: () => {}, onSignIn: () => { renewalOpened = true; } });
function findRenewal(node) {
  if (!node || typeof node !== "object") return undefined;
  if (node.props?.onPress && node.props?.children?.props?.children === "Sign in again") return node;
  return React.Children.toArray(node.props?.children).map(findRenewal).find(Boolean);
}
const renewalButton = findRenewal(expiredForm);
assert.ok(renewalButton); renewalButton.props.onPress(); assert.equal(renewalOpened, true);
assert.match(renderToStaticMarkup(expiredForm), /Saved pending work stays on this device/);
console.log(
  "PASS: workspace routes, navigation, primary order button, case validation, scheme minimum and review payload. No network calls.",
);
if (process.argv.includes("--preview")) {
  // A static visual test artifact, not an authenticated app or a login bypass.
  const screens = [
    "Home",
    "Primary",
    "Secondary",
    "Inventory",
    "Outlets",
    "More",
    "Returns",
    "Tickets",
    "Stock checks",
    "Sync",
  ];
  const panels = screens
    .map(
      (tab) =>
        `<section><h2>${tab} · UI test only</h2><div class="phone">${render(tab)}</div></section>`,
    )
    .join("");
  const sheet = native.StyleSheet.getSheet();
  const output = path.join(root, "../docs/dms-ui-preview.html");
  fs.writeFileSync(
    output,
    `<!doctype html><html><head><meta charset="utf-8"><title>DMS visual checks — synthetic data</title><style>${sheet.textContent}</style><style>body{margin:20px;background:#E8E1D3;font-family:Arial}main{display:flex;gap:24px;align-items:flex-start}h1{font-size:20px}h2{font-size:14px}.phone{width:390px;height:844px;display:flex;overflow:hidden;border:1px solid #D6E3DE;border-radius:16px}section{flex-shrink:0}</style></head><body><h1>Visual test only — synthetic distributor, no Salesforce connection</h1><main>${panels}</main></body></html>`,
  );
  console.log(`Visual test artifact: ${output}`);
}
// Desktop portal routes delegate to the existing application handlers.
const {default: PortalFrame, portalLinks} = load(path.join(root, "src/components/PortalFrame.tsx"));
portalWidth = 1440;
let portalSelected, portalRefresh = 0, portalLogout = 0;
const portalProps = {signedIn: true, tab: "Primary", name: "Fixture distributor", pending: 1, busy: false, loggingOut: false,
  onSelect: value => {portalSelected = value;}, onRefresh: () => portalRefresh++, onLogout: () => portalLogout++, children: React.createElement("div", null, "Existing screen")};
function nodes(node) { return !node || typeof node !== "object" ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)]; }
const portal = PortalFrame(portalProps);
const portalButtons = nodes(portal).filter(node => node.props?.accessibilityRole === "button");
for (const [key, label] of portalLinks) {
  portalButtons.find(node => node.props.accessibilityLabel === label).props.onPress();
  assert.equal(portalSelected, key);
}
assert.equal(portalButtons.filter(node => node.props.accessibilityState?.selected).length, 1);
portalButtons.find(node => node.props.accessibilityLabel === "Refresh portal data").props.onPress();
portalButtons.find(node => node.props.accessibilityLabel === "Log out of distributor").props.onPress();
assert.equal(portalRefresh, 1); assert.equal(portalLogout, 1);
const portalMarkup = renderToStaticMarkup(portal);
assert.match(portalMarkup, /WORKSPACE/); assert.match(portalMarkup, /Fixture distributor/); assert.match(portalMarkup, /Existing screen/);
assert.doesNotMatch(renderToStaticMarkup(PortalFrame({...portalProps, signedIn: false})), /WORKSPACE|Log out of distributor/);
portalWidth = 390;
const narrowWeb = renderToStaticMarkup(PortalFrame(portalProps));
assert.match(narrowWeb, /Expand sidebar/);
assert.doesNotMatch(narrowWeb, /DMS PORTAL/);
portalPlatform.OS = "android";
assert.doesNotMatch(renderToStaticMarkup(PortalFrame(portalProps)), /WORKSPACE/);
assert.match(renderToStaticMarkup(PortalFrame(portalProps)), /DMS PORTAL/);
console.log("PASS: full-browser portal at wide and narrow widths, native mobile navigation, existing routes, refresh, logout and login isolation.");
