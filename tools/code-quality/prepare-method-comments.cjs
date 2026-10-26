// Generate reviewable insertion-only patches; apply_patch, not this tool, edits source files.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const apex = require('./method-descriptions.cjs');
const clients = require('./client-method-descriptions.cjs');
const inventory = require('../../diagnostics/method-comments/inventory.json');
const simple = {
  rad: 'Convert an angle in degrees to radians for the distance formula.',
  radians: 'Convert an angle in degrees to radians for the distance formula.',
  distanceInMeters: 'Calculate the great-circle distance between two GPS coordinates using the Haversine formula and return rounded metres.',
  BottomNav: 'Render the mobile navigation choices and highlight the current section.',
  BrandHeader: 'Render the shared SFA branded header and its supplied screen context.',
  BrandLogo: 'Render the bundled brand image with the requested size and accessible image labeling.',
  ExpenseClaimEditor: 'Render the fields required by the selected expense policy and send field changes to the parent claim form.',
  Card: 'Group related content inside the shared card container.',
  Button: 'Render the shared action control with the supplied style, disabled state and press callback.',
  Label: 'Render a consistently styled section or field label.',
  Money: 'Render a numeric value using the application currency display convention.',
  BeatsScreen: 'Display the employee beat choices and navigate into the selected beat workflow.',
  DayScreen: 'Manage start/end odometer entry, GPS capture and the server-calculated travel summary.',
  ExpensesScreen: 'Load expense policies, collect policy-specific claim details and submit validated employee claims.',
  HomeScreen: 'Render the SFA home dashboard, schemes and navigation using fetched data and explicit fallback states.',
  LoginScreen: 'Manage the employee email-code sign-in flow and its loading and error states.',
  ModuleListScreen: 'Display records for the selected SFA module using the shared loading and error pattern.',
  MoreScreen: 'Provide additional employee modules, manual synchronization and logout controls.',
  OrdersScreen: 'Display employee order records and their available order/invoice details.',
  OutletMapScreen: 'Show the outlet location and provide an action to open external map navigation.',
  OutletsScreen: 'Display allocated outlets with beat/search filters and captured visit details.',
  PrimaryScreen: 'Manage employee-entered primary orders and receipt-based returns in whole cases, including queued submission and issued invoices.',
  ProductsScreen: 'Display and search the product catalogue and its identity/pricing details.',
  StoreGateScreen: 'Gate entry into an outlet visit using location validation and record a nonvisited status when applicable.',
  StoresScreen: 'Display stores for the selected beat and navigate to the chosen outlet workflow.',
  SurveyScreen: 'Render the outlet survey, collect answers and evidence, and save a draft or completed response.',
  VisitScreen: 'Coordinate outlet visit actions, product selection, recoverable order drafts, checkout and visit-document sharing.',
  App: 'Initialize the SFA navigation and session-aware application shell.',
};
const fixture = {
  createData: 'Create isolated records used by the test scenarios in this class.',
  setup: 'Create the shared isolated records required by the test scenarios.',
  setupData: 'Create the shared isolated records required by the test scenarios.',
  data: 'Build the isolated distributor, outlet and related records used by these tests.',
  fixture: 'Build the records and test dependencies needed to exercise this module without relying on production data.',
  permission: 'Assign the permission required for the test actor to exercise the protected workflow.',
  permissions: 'Assign the permissions required for the test actor to exercise the protected workflow.',
  call: 'Invoke the command entry point with the test request and return its response for assertions.',
  configurePool: 'Configure the ordered distributor pool and cursor records used by allocator tests.',
  employees: 'Build employee test records for the requested allocation scenario.',
  cursor: 'Read the allocation cursor so the test can assert round-robin progress or rollback.',
  primaryOrder: 'Build a primary order fixture for invoice approval and replay scenarios.',
  secondaryOrder: 'Build a secondary order fixture for invoice-readiness and replay scenarios.',
  distributor: 'Create the distributor test record needed by the portal command scenario.',
  ticket: 'Build a ticket request fixture for the command lifecycle/replay scenario.',
  order: 'Build the primary order test record used to exercise workflow transitions.',
  orderLine: 'Build a primary order line with the product and quantity used by the scenario.',
  returnRecord: 'Build a primary return record for workflow decision tests.',
  submit: 'Submit the test transaction through the workflow under test and return its result where applicable.',
  decide: 'Apply the test workflow decision so the scenario can assert approval or rejection effects.',
  orderFor: 'Build an order for the supplied outlet to exercise distributor routing.',
  makeUser: 'Create an isolated Salesforce user for the employee/manager access scenario.',
  assignSfaAccess: 'Assign SFA permission access to the test user before running the scenario.',
  draft: 'Build a draft journey plan for the allocation transition being tested.',
  allocation: 'Construct an outlet-allocation fixture for beat-list tests.',
  token: 'Create a test authentication token for requests to the local test application.',
  login: 'Exercise the test sign-in flow and return the session needed by subsequent test requests.',
  send: 'Send an HTTP request to the test router and decode the result for assertions.',
  records: 'Return controlled query fixtures for invoice-route tests; this does not query a live Salesforce org.',
  elements: 'Traverse the rendered test tree to find elements used by component assertions.',
  fields: 'Select rendered input fields so the test can check labels and editing behavior.',
  displayed: 'Extract displayed content from the rendered test tree for identity-field assertions.',
  children: 'Read rendered child elements for component-level assertions.',
  body: 'Construct a queued primary transaction payload for storage and retry tests.',
};
const triggers = {
  DmsDistributorLifecycle: 'Before saving distributors, delegate discontinuation handling to the bulk lifecycle handler.',
  DmsDistributorSurvey: 'Before saving distributor surveys, delegate officer validation with the prior record map when available.',
  DmsEmployeeAllocation: 'After employee creation, delegate the inserted employee IDs to the persistent round-robin allocator.',
  DmsPrimaryOrderLineRules: 'Validate editable primary lines before writes and recalculate affected parent totals after line changes.',
  DmsPrimaryOrderRules: 'Validate primary order headers before writes; after saving, maintain officer access and issue invoices for approved orders.',
  DmsPrimaryReturnLineRules: 'Delegate primary return-line validation with the correct prior/current records and delete/undelete context.',
  DmsPrimaryReturnRules: 'Validate primary return headers before writes and maintain company-officer access after saving.',
  DmsSalesTarget: 'Delegate target-scope validation and unique-key preparation before insert or update.',
  DmsSecondaryOrderRouting: 'Route new secondary orders before insert, then issue eligible invoices after insert/update once the order is ready.',
  DmsSecondaryReturnRouting: 'Assign the outlet supplier to new secondary returns through the shared routing handler.',
  DmsSupportTicket: 'Delegate ticket ownership and status-transition validation before saving.',
  OutletGeographyTrigger: 'Copy beat geography before outlet writes and refresh affected beat summaries after outlet changes.',
  PjpApproverTrigger: 'Populate reporting-manager context before plan writes and synchronize allocations after approved plan changes.',
  SfaAllocationEmployee: 'Populate allocation employee references from linked Salesforce users before saving.',
  SfaEmployeeInvitation: 'Delegate employee invitation processing after insert/update, supplying old values to detect changed emails.',
  SfaSalesRepresentativeInvitation: 'Normalize representative login email before saving and send eligible application invitations after saving.',
};

/** Resolve reviewed descriptions, with scenario-name wording only for named tests. */
function description(file, symbol) {
  const name = path.basename(file).replace(/\.cls$/, '');
  const map = apex[name] || Object.entries(clients).find(([suffix]) => file.endsWith(suffix))?.[1];
  if (file.endsWith('dms/transport.ts') && symbol.name === 'constructor' && symbol.body.includes('private session'))
    return 'Inject the Salesforce session provider and HTTP client, allowing the same transport to run against controlled test servers.';
  if (file.endsWith('screens/StatusScreens.tsx')) {
    const legacy = {
      VisitsScreen: 'Render the legacy static visit-progress example; these counts are not loaded from Salesforce.',
      OrdersScreen: 'Render the legacy order-status placeholder; this component does not fetch order records.',
      ProfileScreen: 'Render the legacy static profile heading with the live local pending-queue count and retry action.',
    };
    if (legacy[symbol.name]) return legacy[symbol.name];
  }
  if (map?.[symbol.name]) return map[symbol.name];
  if (/Test\.cls$|\.test\./.test(file)) {
    if (fixture[symbol.name]) return fixture[symbol.name];
    if (/Test\.cls$/.test(file) && /@IsTest|testMethod/i.test(symbol.body)) {
      const scenario = symbol.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
      return `Regression scenario: ${scenario}. Arrange isolated test data, exercise the workflow and assert the expected outcome.`;
    }
  }
  return simple[symbol.name];
}

/** Wrap prose without altering source or inserting executable statements. */
function wrap(value, limit = 90) {
  const lines = [''];
  for (const word of value.split(/\s+/)) {
    if (lines.at(-1).length && lines.at(-1).length + word.length + 1 > limit) lines.push('');
    lines[lines.length - 1] += (lines.at(-1) ? ' ' : '') + word;
  }
  return lines;
}

const patches = [], missing = [];
let added = 0;
for (const row of inventory) {
  const source = fs.readFileSync(path.join(root, row.file), 'utf8');
  const insertions = new Map();
  for (const symbol of row.symbols.filter(item => !item.doc)) {
    const prose = description(row.file, symbol);
    if (!prose) { missing.push(`${row.file}#${symbol.name}`); continue; }
    if (!insertions.has(symbol.start)) insertions.set(symbol.start, []);
    insertions.get(symbol.start).push(prose);
    added++;
  }
  if (row.file.endsWith('.trigger') && !source.trimStart().startsWith('/**'))
    insertions.set(0, [triggers[path.basename(row.file, '.trigger')]]);
  const hunks = [...insertions].sort(([a], [b]) => a - b).map(([start, prose]) => {
    const lineStart = source.lastIndexOf('\n', start - 1) + 1;
    const indentation = source.slice(lineStart, start);
    if (indentation.trim()) throw Error('Refusing inline insertion: ' + row.file);
    const text = wrap([...new Set(prose)].join(' '), 94 - indentation.length);
    const comment = [indentation + '/**', ...text.map(line => indentation + ' * ' + line), indentation + ' */'];
    const firstLine = source.slice(lineStart).split(/\r?\n/)[0];
    return '@@\n' + comment.map(line => '+' + line).join('\n') + '\n ' + firstLine;
  });
  if (hunks.length) patches.push(`*** Begin Patch\n*** Update File: ${root.replace(/\\/g, '/')}/${row.file}\n${hunks.join('\n')}\n*** End Patch`);
}
if (missing.length) { console.error(JSON.stringify({missing})); process.exitCode = 1; }
else {
  fs.writeFileSync(path.join(root, 'diagnostics/method-comments/patches.json'), JSON.stringify(patches));
  console.log(JSON.stringify({files:patches.length, methodComments:added, triggerComments:Object.keys(triggers).length}));
}
