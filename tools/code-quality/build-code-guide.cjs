/* Rebuild the offline code handbook from first-party sources, never .env or dependencies. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('../../sales-rep-mobile/backend/node_modules/typescript');
const { chapters, roles } = require('./guide-content.cjs');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'docs/sfa-dms-code-handbook');
const fileOutput = path.join(output, 'files');
fs.mkdirSync(fileOutput, { recursive: true });
const extensions = new Set(['.cls', '.trigger', '.apex', '.ts', '.tsx', '.js', '.cjs', '.mjs', '.html', '.css', '.xml', '.json', '.ps1', '.cmd', '.yml', '.yaml']);
const excludedDirectories = new Set(['node_modules', 'dist', 'web-build', 'build', '.expo', '.sf', '.sfdx', '.git', '.runtime', 'backups', 'diagnostics', 'tmp', 'releases', 'output', 'android', 'ios']);
const excludedFiles = [];
const files = [];
function walk(relative) {
  for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const name = relative ? relative + '/' + item.name : item.name;
    if (item.isDirectory()) {
      if (excludedDirectories.has(item.name)) { excludedFiles.push(name + '/'); continue; }
      walk(name);
    } else if (extensions.has(path.extname(item.name)) && !/^\./.test(item.name) && !/lock\.json$|\.map$|tsbuildinfo|\.min\./.test(item.name)) {
      files.push(name);
    } else { excludedFiles.push(name); }
  }
}
for (const folder of ['force-app', 'sales-rep-mobile/backend/src', 'sales-rep-mobile/mobile/src', 'dms-mobile/src', 'scripts', 'manifest', 'config']) walk(folder);
// Entrypoints, build configuration, tests and launchers that live outside src/.
for (const folder of ['', 'sales-rep-mobile', 'sales-rep-mobile/backend', 'sales-rep-mobile/mobile', 'dms-mobile']) {
  for (const item of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
    if (!item.isFile() || item.name.startsWith('.') || /lock\.json$|tsbuildinfo/.test(item.name)) continue;
    if (extensions.has(path.extname(item.name))) files.push(folder ? folder + '/' + item.name : item.name);
  }
}
if (fs.existsSync(path.join(root, 'dms-mobile/scripts'))) walk('dms-mobile/scripts');
const uniqueFiles = [...new Set(files)].sort();
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const short = value => value.replace(/\s+/g, ' ').slice(0, 200);
const words = value => value.replace(/__c|__r/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
function group(file) {
  if (file.includes('/classes/')) return 'Apex classes & tests';
  if (file.includes('/triggers/')) return 'Apex triggers';
  if (file.includes('/lwc/')) return 'Lightning components';
  if (file.startsWith('force-app/')) return 'Salesforce metadata';
  if (file.startsWith('dms-mobile/src') || file === 'dms-mobile/App.tsx') return 'DMS portal & mobile';
  if (file.startsWith('sales-rep-mobile/mobile/src') || file === 'sales-rep-mobile/mobile/App.tsx') return 'SFA mobile';
  if (file.startsWith('sales-rep-mobile/backend/src')) return 'Shared backend';
  return 'Configuration & operations';
}
function describe(file, source) {
  const base = path.basename(file).replace(/\.(cls|trigger|ts|tsx|js|cjs|mjs|html|css|apex)$/, '');
  if (file.endsWith('.trigger')) {
    const target = source.match(/trigger\s+\w+\s+on\s+(\w+)\s*\(([^)]+)\)/);
    const handlers = [...new Set([...source.matchAll(/\b([A-Z]\w+)\.(\w+)\(/g)].map(m => m[1] + '.' + m[2]))];
    return 'Salesforce event dispatcher for ' + (target ? target[1] + ' (' + target[2].replace(/\s+/g, ' ') + ')' : base) + '. Delegates to ' + handlers.join(', ') + '. Read the linked service for the business rule; trigger context supplies the incoming/previous records.';
  }
  if (roles[base]) return roles[base];
  if (/Test$|\.test$/.test(base)) return 'Regression tests for ' + base.replace(/Test$|\.test$/, '') + '. Fixture setup creates inputs, the action invokes behavior, and assertions compare actual results to expected outcomes. Tests with stubs do not verify the real mail provider or Salesforce transport.';
  if (file.includes('/objects/') && file.endsWith('.xml')) {
    const type = source.match(/<type>([^<]+)<\/type>/)?.[1];
    const label = source.match(/<label>([^<]+)<\/label>/)?.[1];
    const ref = source.match(/<referenceTo>([^<]+)<\/referenceTo>/)?.[1];
    return 'Salesforce metadata for ' + file.split('/objects/')[1] + '. ' + (label ? 'Label: ' + label + '. ' : '') + (type ? 'Type: ' + type + '. ' : '') + (ref ? 'Relationship target: ' + ref + '. ' : '') + 'Declarative configuration, not sequential Apex execution. Formulas, validation and defaults can affect saves made by either client.';
  }
  if (file.endsWith('-meta.xml')) return 'Salesforce deployment metadata for this component. Defines version, availability, permissions or layout/configuration. XML elements configure platform behavior; they are not executable statements.';
  if (base === 'App') return file.startsWith('dms') ? 'DMS entry component that mounts DmsApp.' : 'SFA navigation entry: registers screens and reconnect-driven queue flushing. Screen registration determines reachable navigation routes.';
  if (base === 'app' && file.includes('/backend/')) return 'Express application: HTTP middleware, separate distributor/employee authentication boundaries, employee field-activity routes, Salesforce writes, recovery, document endpoints and error handling.';
  if (base === 'api') return 'DMS HTTP client: configured backend URL, DMS path prefix, bearer token, timeout, JSON envelope validation and recoverable network errors.';
  if (base === 'client') return 'SFA HTTP client: builds requests with the current session, handles response envelopes/errors and exposes API/recoverable write helpers.';
  if (base === 'storage') return 'DMS persistence helpers: platform-appropriate session storage and distributor-specific snapshot/pending keys. Storage itself does not send records to Salesforce.';
  if (base === 'theme') return 'Shared presentation tokens such as colors, spacing and typography. Changing these affects appearance, not business record persistence.';
  if (file.includes('/data/')) return 'Local catalogue/demo snapshot or mock fixture data. Static data is not proof of current Salesforce state; inspect the caller and USE_MOCK_DATA configuration.';
  if (/\.(ps1|cmd|apex)$/.test(file)) return 'Operational script: ' + words(base) + '. Inspect commands in order before execution. Seed/backfill/reset/deploy scripts can write Salesforce records or local files; documentation generation does not execute them.';
  if (/package\.json$/.test(file)) return 'Package manifest: runtime/dev dependencies, entry point and npm scripts. Scripts run only when invoked; a dependency declaration does not prove a feature is used.';
  if (/tsconfig/.test(file)) return 'TypeScript compiler configuration: module resolution, target, strictness and included files. Type checking is not a runtime integration test.';
  if (/check-|test/.test(file)) return 'Local verification script/configuration. Inspect fixture substitution and assertions to determine which behavior is checked and which external systems are not contacted.';
  if (file.endsWith('.css')) return 'Style declarations for the adjacent component: selectors choose elements and properties control layout/appearance.';
  if (file.endsWith('.html')) return 'Component markup binding displayed content, inputs and events to its JavaScript controller.';
  return 'First-party ' + group(file).toLowerCase() + ' file: ' + words(base) + '. Read imports/exports and the symbol outline to locate its caller and responsibility. Detailed operations appear beside the numbered source.';
}
function symbolsFor(file, source) {
  const symbols = [];
  const add = (name, pos, kind) => symbols.push({ name, line: source.slice(0, pos).split('\n').length, kind });
  if (/\.(tsx?|[cm]?js)$/.test(file)) {
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
    function visit(node) {
      if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && node.name)
        add(node.name.getText(tree), node.getStart(tree), ts.SyntaxKind[node.kind]);
      if (ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) add(node.name.getText(tree), node.getStart(tree), 'Function');
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && /^(get|post|put|patch|delete|use)$/.test(node.expression.name.text) && node.arguments[0] && ts.isStringLiteral(node.arguments[0]))
        add(node.expression.getText(tree) + ' ' + node.arguments[0].text, node.getStart(tree), 'Route/registration');
      ts.forEachChild(node, visit);
    }
    visit(tree);
  } else if (/\.(cls|trigger|apex)$/.test(file)) {
    for (const match of source.matchAll(/(?:public|private|global|protected)\s+(?:(?:static|virtual|override|abstract|with sharing|without sharing)\s+)*(?:[\w<>,\s\[\]]+?)\s+(\w+)\s*\(/g)) add(match[1], match.index, 'Apex method');
  } else if (file.endsWith('.ps1')) {
    for (const match of source.matchAll(/^function\s+([\w-]+)/gm)) add(match[1], match.index, 'PowerShell function');
  }
  return symbols.sort((a,b) => a.line - b.line);
}
function explain(line, file, previous, commentState) {
  const value = line.trim();
  if (!value) return 'Blank line separating logical sections; no executable operation.';
  if (commentState.active || /^\/\*|^\*|^\/\/|^<!--|^#(?!\{)/.test(value)) {
    if (/\/\*/.test(value) && !/\*\//.test(value)) commentState.active = true;
    if (/\*\//.test(value)) commentState.active = false;
    return 'Developer comment/documentation: ' + short(value.replace(/^\/?\*+\/?|^\/\/|^#|^<!--|-->$/g, '')) + ' It is not executed.';
  }
  if (/^<\?xml/.test(value)) return 'Declares XML encoding/version for the Salesforce metadata file.';
  if (file.endsWith('.xml')) {
    const tag = value.match(/^<([\w:]+)(?:\s[^>]*)?>(.*)<\/\1>$/);
    if (tag) {
      const descriptions = { fullName: 'API identifier used by metadata deployment and code references', label: 'human-readable Salesforce UI label', type: 'field/storage type', required: 'whether a value is mandatory', unique: 'whether duplicate stored values are rejected', externalId: 'whether the field is eligible for external-key matching', referenceTo: 'object referenced by this relationship', relationshipName: 'relationship API traversal name', formula: 'formula expression evaluated by Salesforce', errorConditionFormula: 'condition that makes this validation rule fail', errorMessage: 'message displayed when the rule fails', apiVersion: 'Salesforce API version used for this component', status: 'component activation status', readable: 'field read permission', editable: 'field edit permission', allowRead: 'object read permission', allowCreate: 'object create permission', allowEdit: 'object edit permission', allowDelete: 'object delete permission', apexClass: 'Apex class granted by this permission entry', enabled: 'whether this permission is enabled', field: 'field API name configured in this entry', object: 'object API name configured in this entry', value: 'configured value in the surrounding metadata entry', default: 'whether this option is the default', active: 'whether the rule/component is enabled', sharingModel: 'record sharing baseline', precision: 'maximum numeric precision', scale: 'decimal places', length: 'maximum text length', defaultValue: 'initial value expression', target: 'Lightning surface on which the component can be used', fieldUpdates: 'field update action reference', name: 'name within the enclosing metadata component' };
      return 'Sets ' + (descriptions[tag[1]] || words(tag[1]) + ' in the enclosing configuration') + ' to ' + short(tag[2]) + '.';
    }
    if (/^<\//.test(value)) return 'Closes the ' + (value.match(/^<\/([\w:]+)/)?.[1] || 'metadata') + ' configuration block.';
    if (/^</.test(value)) return 'Opens the ' + (value.match(/^<([\w:]+)/)?.[1] || 'metadata') + ' block; child elements specify its configuration.';
    return 'Continues the surrounding metadata/formula text. Read it with the opening XML element above.';
  }
  if (/^import\b/.test(value)) return 'Imports dependencies/types used below: ' + short(value) + '. Importing a function does not call it.';
  if (/^from\b|^}\s*from\b/.test(value)) return 'Completes the dependency import and identifies the module supplying those names.';
  if (/^@IsTest/.test(value)) return 'Marks test code; it verifies behavior with isolated test data rather than serving normal application requests.';
  if (/^@TestVisible/.test(value)) return 'Allows tests to inspect this otherwise private member without making it a public application API.';
  if (/^@AuraEnabled/.test(value)) return 'Exposes this method/property to Lightning. cacheable=true is for reads; the annotation is not a permission check.';
  if (/^@RestResource/.test(value)) return 'Registers the Apex REST URL mapping; authentication/authorization must still be enforced.';
  if (/^@Http/.test(value)) return 'Associates the following Apex method with the indicated HTTP verb.';
  if (/^@api/.test(value)) return 'Exposes a Lightning component property/method to its host, such as the current record ID.';
  if (/\bclass\s+\w+/.test(value)) return 'Declares a class/type: ' + short(value) + '. ' + (/without sharing/.test(value) ? 'Runs without record-sharing enforcement; see the documented internal authorization boundary.' : /with sharing/.test(value) ? 'Uses record sharing, which does not alone enforce field/object permissions.' : 'Members below hold behavior and/or state.');
  if (/^trigger\b/.test(value)) return 'Registers the Salesforce object and save events. The body dispatches work to handlers using Trigger context.';
  if (/\bDatabase\.setSavepoint/.test(value)) return 'Creates a transaction checkpoint so later failure can roll back all command changes.';
  if (/\bDatabase\.rollback/.test(value)) return 'Rolls Salesforce writes back to the saved checkpoint; prevents partial command results.';
  if (/FOR UPDATE/.test(value)) return 'Requests record locks for this query so concurrent commands cannot both use the same old state.';
  if (/WITH (SYSTEM|USER)_MODE|AccessLevel\.(SYSTEM|USER)_MODE/.test(value)) return 'Specifies database execution/access mode explicitly. System mode needs deliberate business authorization; user mode enforces user access restrictions.';
  if (/^SELECT\b/i.test(value)) return 'Selects these Salesforce fields/aggregates: ' + short(value.replace(/^SELECT\s+/i, '')) + '. Query results are used in the surrounding assignment or loop.';
  if (/^FROM\b/i.test(value)) return 'Chooses the Salesforce object/subquery source: ' + short(value) + '.';
  if (/^WHERE\b|^AND\b|^OR\b/i.test(value)) return 'Adds a query/filter condition: ' + short(value) + '. The complete condition determines which records are included.';
  if (/^ORDER BY|^GROUP BY|^LIMIT\b/i.test(value)) return 'Controls query sorting, grouping or result count: ' + short(value) + '.';
  if (/\baddError\(/.test(value)) return 'Marks the incoming Salesforce record invalid with this message; its save fails rather than silently accepting the bad state.';
  if (/\bSystem\.assert|\bexpect\(|\bassert\./.test(value)) return 'Test assertion comparing an expected outcome to actual behavior: ' + short(value) + '. A mismatch fails the test.';
  if (/Test\.startTest/.test(value)) return 'Starts the isolated Apex test execution window and resets the relevant governor-limit counters.';
  if (/Test\.stopTest/.test(value)) return 'Ends the Apex test window and runs queued test asynchronous work before checking outcomes.';
  if (/Test\.isRunningTest/.test(value)) return 'Selects behavior based on whether this runs in an Apex test; check that test-only behavior does not hide production failures.';
  if (/\bApproval\.process\(/.test(value)) return 'Submits the configured Salesforce approval request. Inspect the returned result before claiming submission succeeded.';
  if (/\bMessaging\.sendEmail\(/.test(value)) return 'Asks Salesforce to send the collected emails. Provider acceptance/delivery and partial failures are separate from record saving.';
  if (/\b(insert|update|upsert|delete|undelete)\b/.test(value) && /^(insert|update|upsert|delete|undelete)\s|\bDatabase\.(insert|update|upsert|delete)/.test(value)) return 'Performs Salesforce DML: ' + short(value) + '. It can invoke triggers/validation and fail; collection operations avoid one DML call per record.';
  if (/^throw\b/.test(value)) return 'Stops this execution path with a validation/error exception: ' + short(value) + '. The caller/catch block decides how it is reported.';
  if (/^(}\s*)?catch\b/.test(value)) return 'Handles an exception from the preceding try block. Check whether it rolls back, preserves queued work or only displays an error.';
  if (/^(}\s*)?finally\b/.test(value)) return 'Cleanup section that runs after success or failure, for example clearing a timer or busy flag.';
  if (/^try\b/.test(value)) return 'Starts operations whose failure is handled by the following catch/finally blocks.';
  if (/\buseState\b/.test(value)) return 'Declares/uses React render state. Its setter schedules a re-render; it does not save a Salesforce record by itself.';
  if (/\buseRef\b/.test(value)) return 'Stores a mutable value across renders without causing a re-render, such as a stable request key or sync lock.';
  if (/\buseEffect\b/.test(value)) return 'Registers a lifecycle effect. Read its dependency array and cleanup to understand when it runs or is cancelled.';
  if (/\buseMemo\b/.test(value)) return 'Caches a derived value using the listed dependencies, such as filtered products or totals.';
  if (/\bsetInterval\b|\bsetTimeout\b/.test(value)) return 'Schedules periodic/delayed work. The delay and cleanup determine refresh/retry behavior; it is not immediate server push.';
  if (/\bclearInterval\b|\bclearTimeout\b|\.remove\(\)/.test(value)) return 'Cancels a timer/listener to prevent stale updates after cleanup or screen changes.';
  if (/\bJSON\.parse|\bJSON\.deserialize/.test(value)) return 'Converts JSON into structured data. Invalid JSON can throw; inspect validation and catch handling.';
  if (/\bJSON\.stringify|\bJSON\.serialize/.test(value)) return 'Converts structured data to JSON for HTTP, persistent storage or a fingerprint.';
  if (/\bAsyncStorage\.|\bSecureStore\./.test(value)) return 'Reads/writes device/browser storage, not Salesforce. Inspect the key to see whether it is scoped to the current account.';
  if (/\bfetch\(|\bfetchHttp\(|\bsalesforce\.(records|query|create|update|composite)|\bdeps\.(records|command)/.test(value)) return 'Invokes the external-data boundary: ' + short(value) + '. Await/result checks determine whether the operation is confirmed.';
  if (/\brouter\.(get|post|use)|\bapp\.(get|post|use)/.test(value)) return 'Registers an HTTP route or middleware: ' + short(value) + '. Registration order controls which authentication/validation runs first.';
  if (/\bPromise\.all/.test(value)) return 'Starts independent asynchronous operations together and waits for all; rejection propagates to the surrounding error handler.';
  if (/\bawait\b/.test(value)) return 'Waits for this asynchronous operation before continuing: ' + short(value) + '. The returned result/error must still be handled.';
  if (/^(}\s*)?else\s+if\b|^if\s*\(/.test(value)) return 'Conditional branch: execute the following statement/block only when this Boolean expression is true. Condition begins: ' + short(value) + '.';
  if (/^(}\s*)?else\b/.test(value)) return 'Alternative branch taken when the preceding condition is false.';
  if (/^for\s*\(|^while\s*\(/.test(value)) return 'Repeats work over the specified records/items or while this condition holds: ' + short(value) + '. Check where queries/writes occur relative to the loop.';
  if (/^return\b/.test(value)) return 'Returns ' + short(value.replace(/^return\s*/, '').replace(/;$/, '')) + ' to the caller (or begins returned UI markup) and ends this execution path.';
  if (/^continue\b/.test(value)) return 'Skips the remainder of the current loop iteration and moves to the next item.';
  if (/^break\b/.test(value)) return 'Exits the current loop/switch. For sync, this can deliberately leave a failed request pending.';
  if (/^export\s+(type|interface)|^type\s|^interface\s/.test(value)) return 'Defines a compile-time data contract: ' + short(value) + '. TypeScript types do not validate untrusted runtime JSON by themselves.';
  if (/^<(?!\/)/.test(value)) return 'Renders/opens a UI element or component: ' + short(value) + '. Props and child content below determine appearance and interactions.';
  if (/^<\//.test(value)) return 'Closes the UI element/component opened above.';
  if (/onPress=|onChange=|onChangeText=|onclick=|onchange=/.test(value)) return 'Binds a UI interaction to the referenced handler; trace that handler to see whether it edits state, validates or calls the backend.';
  if (/\bdisabled=/.test(value)) return 'Controls whether this button/input accepts interaction. Evaluate this expression when diagnosing an unclickable control.';
  if (/^function\b|^(export\s+)?(default\s+)?(async\s+)?function\b|^(public|private|global|protected).*\(/.test(value)) return 'Declares a callable function/method: ' + short(value) + '. Parameters supply its inputs; the following block implements the operation.';
  if (/^(const|let|var|final|String|Boolean|Integer|Decimal|Date|Datetime|Id|List<|Set<|Map<)/.test(value)) return 'Declares/initializes local data used by the surrounding operation: ' + short(value) + '. Collection contents and assignments below determine its purpose.';
  if (/^}\s*[);,]*$|^[\])};,]+$/.test(value)) return 'Closes the surrounding block, call, array or object. Match it to the opening statement above; no independent business action.';
  if (/^\w+[?]?:/.test(value)) return 'Sets/declares the named object property or style/type member: ' + short(value) + '. Interpret it in the enclosing object, props or type definition.';
  if (/^\$[\w]+\s*=/.test(value)) return 'Assigns a PowerShell script variable: ' + short(value) + '.';
  if (/Start-Process|Stop-Process|Copy-Item|Remove-Item|New-Item|Register-ScheduledTask|sf\s+project/.test(value)) return 'Operational command with system/filesystem/deployment effects: ' + short(value) + '. Do not execute as part of simply reading this guide.';
  if (/\.map\(|\.filter\(|\.reduce\(|\.find\(|\.some\(/.test(value)) return 'Transforms/selects/aggregates collection values with the callback shown here: ' + short(value) + '. Read the callback body and result assignment together.';
  if (/\b\w+(?:\.\w+)+\(/.test(value)) return 'Calls the named method: ' + short(value) + '. Its implementation defines the side effect/result; use the symbol/file index to follow it.';
  if (/[^=!<>]=[^=>]/.test(value)) return 'Assigns the right-hand expression to the named variable/property: ' + short(value) + '. This is in-memory unless it is later persisted by an explicit call.';
  return 'Continues the surrounding declaration/expression or text: ' + short(value) + '. Read it with the preceding opening statement' + (previous ? ' (' + short(previous) + ')' : '') + '; it is not a standalone business operation.';
}
const stylesheet = `:root{--ink:#173e32;--green:#16744e;--line:#d3e3db;--pale:#f3f8f5}*{box-sizing:border-box}body{margin:0;color:var(--ink);font:16px/1.65 system-ui,Segoe UI,sans-serif;background:var(--pale)}header{background:#fff;border-bottom:1px solid var(--line);padding:26px 4vw}main{max-width:1400px;margin:auto;padding:28px 4vw}h1{line-height:1.2;font-size:32px}h2{line-height:1.3;font-size:24px}h3{font-size:18px}p,li{max-width:1100px}a{color:#12603f}section,.card,details{background:white;border:1px solid var(--line);border-radius:12px;padding:22px;margin:18px 0}summary{cursor:pointer;font-weight:650}table{border-collapse:collapse;width:100%;margin:18px 0;font-size:14px}td,th{padding:12px;border:1px solid var(--line);text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#e7f2eb}pre,code{font-family:Consolas,monospace}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f0f5f2;padding:18px;border-radius:8px}code{font-size:.9em}button,.button{background:var(--green);color:white;border:0;border-radius:7px;padding:10px 16px;cursor:pointer;text-decoration:none;display:inline-block}input,select{padding:11px;border:1px solid #99b4a7;border-radius:6px;font:inherit;max-width:100%}.toolbar{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.muted{color:#526c60;font-size:14px}.warning{border-left:5px solid #8f690c;background:#fff9e8;padding:14px}.source{table-layout:fixed}.source th:first-child{width:65px}.source th:nth-child(2){width:52%}.source td{padding:8px 12px}.source code{white-space:pre-wrap;tab-size:4;overflow-wrap:anywhere;font-size:13px}.source tr:target{background:#e0f5df}.outline{columns:2}.tag{background:#e6f2eb;padding:3px 8px;border-radius:12px;font-size:12px}dt{font-weight:700;margin-top:18px}dd{margin-left:0}footer{padding:28px 4vw;border-top:1px solid var(--line)}@media(max-width:700px){main{padding:15px}section,details{padding:15px}.outline{columns:1}.source th:nth-child(2){width:45%}h1{font-size:25px}.source td{padding:6px}}@media print{body{background:white;font-size:11pt}header,main,footer{padding:0}.toolbar,.no-print{display:none}section,details{break-inside:auto;border:0;padding:0}tr{break-inside:avoid}a{color:black}.source{font-size:9pt}.source code{font-size:8pt}h2{break-after:avoid}}`;
fs.writeFileSync(path.join(output, 'style.css'), stylesheet);
function page(title, body, nested = false) {
  const prefix = nested ? '../' : '';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + escape(title) + '</title><link rel="stylesheet" href="' + prefix + 'style.css"></head><body><header><div class="muted">SFA + DMS • Code review handbook • 26 October 2026</div><h1>' + escape(title) + '</h1><div class="toolbar no-print"><a class="button" href="' + prefix + 'index.html">Handbook home</a><a href="' + prefix + 'index.html#files">Find a file</a><button onclick="window.print()">Print / save as PDF</button></div></header><main>' + body + '</main><footer>Local source snapshot. No business records, emails or approvals were created to generate this documentation. Keep this internal: it contains project implementation details.</footer></body></html>';
}
const manifest = [];
for (let index = 0; index < uniqueFiles.length; index++) {
  const file = uniqueFiles[index];
  const bytes = fs.readFileSync(path.join(root, file));
  const source = bytes.toString('utf8').replace(/\r\n/g, '\n');
  // Stop instead of copying high-confidence credential material into a shareable guide.
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|00D[A-Za-z0-9]{12,15}![A-Za-z0-9._-]{40,}/.test(source)) {
    throw new Error('Potential credential in source; exclude or redact before publishing: ' + file);
  }
  const lines = source.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const symbols = symbolsFor(file, source);
  const name = String(index + 1).padStart(4, '0') + '-' + path.basename(file).replace(/[^a-zA-Z0-9._-]/g, '_') + '.html';
  const description = describe(file, source);
  const category = group(file);
  const commentState = { active: false };
  const table = lines.map((line, i) => '<tr id="L' + (i + 1) + '"><td><a href="#L' + (i + 1) + '">' + (i + 1) + '</a></td><td><code>' + escape(line || ' ') + '</code></td><td>' + escape(explain(line, file, lines[i-1], commentState)) + '</td></tr>').join('\n');
  const outline = symbols.length ? '<h2>Symbol and route outline</h2><ul class="outline">' + symbols.map(s => '<li><a href="#L' + s.line + '">' + escape(s.name) + '</a> <span class="muted">L' + s.line + ' · ' + escape(s.kind) + '</span></li>').join('') + '</ul>' : '';
  const objects = [...new Set(source.match(/\b[A-Za-z]\w*__c\b/g) || [])];
  const body = '<section><p><span class="tag">' + escape(category) + '</span></p><h2>' + escape(file) + '</h2><p>' + escape(description) + '</p><p class="muted">' + lines.length + ' source lines · SHA-256 ' + hash(bytes) + '</p>' + outline + (objects.length ? '<details><summary>Referenced Salesforce API names</summary><p>' + escape(objects.join(', ')) + '</p></details>' : '') + '</section><p class="warning">Line notes explain local syntax/operations, not a separate manual proof for each line. Read multi-line expressions as a block and use the workflow chapters for business meaning. Tests and checks are listed separately in the handbook.</p><table class="source"><thead><tr><th>Line</th><th>Exact local source</th><th>Explanation / reading note</th></tr></thead><tbody>' + table + '</tbody></table>';
  fs.writeFileSync(path.join(fileOutput, name), page(path.basename(file), body, true));
  manifest.push({ file, category, lines: lines.length, sha256: hash(bytes), page: 'files/' + name, description, symbols });
}
const totals = {};
for (const file of manifest) { totals[file.category] ||= {files:0,lines:0}; totals[file.category].files++; totals[file.category].lines += file.lines; }
const totalLines = manifest.reduce((n, f) => n + f.lines, 0);
const verification = `<section id="verification"><h2>Verification and change boundaries</h2><table><tr><th>Check</th><th>Observed result on 26 October 2026</th></tr><tr><td>Salesforce check-only deployment</td><td>0AfjV000004xhxuSAA · Succeeded · 50 tests completed, 0 failures. Classes and triggers validated against sfaNewOrg. Check-only: no deployed code change.</td></tr><tr><td>Backend</td><td>39 tests passed; 8 skipped; TypeScript build passed. Local fixtures/mocks, not end-to-end email delivery.</td></tr><tr><td>SFA mobile</td><td>26 tests passed; TypeScript check passed.</td></tr><tr><td>DMS</td><td>UI, desktop/native navigation, logout, account-isolation and rejected-receipt correction scripts passed; TypeScript check passed. No real network calls in UI scripts.</td></tr><tr><td>Formatter</td><td>Apex debug-check passed before write. TS/LWC debug-check passed except visitRecovery.test.ts (formatter layout instability); that test was left unchanged.</td></tr></table><p>Backups: backups/code-readability-20261026. No actual metadata deployment, record creation, approval, email sending, APK release or Git push was performed for this explanation task. Newly added handler classes/trigger dispatch changes must be deployed together after review.</p><p>Runtime code changes were limited to extracting three existing trigger rules and repairing the identified Apex compilation errors. Other changes are formatting. No wholesale claim of production/security compliance is made.</p></section>`;
const inventory = '<section id="coverage"><h2>Coverage</h2><p><strong>' + manifest.length + ' first-party text files · ' + totalLines.toLocaleString('en-IN') + ' numbered source lines</strong></p><table><tr><th>Area</th><th>Files</th><th>Lines</th></tr>' + Object.entries(totals).map(([name, count]) => '<tr><td>' + escape(name) + '</td><td>' + count.files + '</td><td>' + count.lines + '</td></tr>').join('') + '</table><p><a href="coverage.json">Exact coverage manifest and source hashes</a> · <a href="changes.json">Backup comparison</a></p><p>Use the ZIP to keep all chapters, styles and source pages together. Open index.html after extraction. Print the handbook or any individual source page to PDF when needed; printing every metadata page at once would be unwieldy.</p></section>';
const toc = '<section><h2>Contents</h2><ol>' + chapters.map((c,i) => '<li><a href="#chapter-' + i + '">' + escape(c[0]) + '</a></li>').join('') + '<li><a href="#verification">Verification / boundaries</a></li><li><a href="#files">Every-file explorer</a></li></ol></section>';
const explorer = '<section id="files"><h2>Every-file explorer</h2><p>Search by filename, responsibility or symbol. For a specific line, open the file and use its L-number link. Search source text inside a file with Ctrl+F.</p><div class="toolbar"><input id="search" aria-label="Search files" placeholder="Example: receiveGoods, VisitScreen, PJP" size="48"><select id="category" aria-label="Filter area"><option value="">All areas</option>' + Object.keys(totals).map(name => '<option>' + escape(name) + '</option>').join('') + '</select><span id="count"></span></div><table><thead><tr><th>File / source page</th><th>Purpose</th><th>Lines</th></tr></thead><tbody id="fileRows">' + manifest.map(file => '<tr data-category="' + escape(file.category) + '" data-search="' + escape((file.file + ' ' + file.description + ' ' + file.symbols.map(s=>s.name).join(' ')).toLowerCase()) + '"><td><a href="' + file.page + '">' + escape(file.file) + '</a><br><span class="tag">' + escape(file.category) + '</span></td><td>' + escape(file.description) + '</td><td>' + file.lines + '</td></tr>').join('') + '</tbody></table></section><script>const rows=[...document.querySelectorAll("#fileRows tr")];function filter(){const q=document.getElementById("search").value.toLowerCase();const category=document.getElementById("category").value;let n=0;for(const row of rows){row.hidden=!(row.dataset.search.includes(q)&&(!category||row.dataset.category===category));if(!row.hidden)n++;}document.getElementById("count").textContent=n+" files";}document.getElementById("search").addEventListener("input",filter);document.getElementById("category").addEventListener("change",filter);filter();</script>';
fs.writeFileSync(path.join(output, 'index.html'), page('SFA Mobile & DMS — Process, Logic and Code', toc + inventory + chapters.map((chapter,i) => '<section id="chapter-' + i + '"><h2>' + escape(chapter[0]) + '</h2>' + chapter[1] + '</section>').join('') + verification + explorer));
fs.writeFileSync(path.join(output, 'Manager-Explanation.html'), page('SFA & DMS — Manager Walkthrough', '<p><a href="index.html#files">Open the full line-by-line file explorer</a></p>' + toc + chapters.map((chapter,i) => '<section id="chapter-' + i + '"><h2>' + escape(chapter[0]) + '</h2>' + chapter[1] + '</section>').join('') + verification + '<section id="files"><h2>Detailed source explanations</h2><p><a href="index.html#files">Open the searchable file explorer</a> for all numbered source pages.</p></section>'));
fs.writeFileSync(path.join(output, 'coverage.json'), JSON.stringify({ created:'2026-10-26',root,totalFiles:manifest.length,totalLines,totals,excludedDirectories:[...excludedDirectories],excludedFiles,files:manifest },null,2));
const backup = path.join(root, 'backups/code-readability-20261026');
const changes = [];
for (const file of manifest) {
  let oldFile = path.join(backup, file.file);
  if (file.file.includes('/classes/')) oldFile = path.join(backup, 'classes', path.basename(file.file));
  if (file.file.includes('/triggers/')) oldFile = path.join(backup, 'triggers', path.basename(file.file));
  if (fs.existsSync(oldFile)) { const before=hash(fs.readFileSync(oldFile)); if(before!==file.sha256) changes.push({file:file.file,before,after:file.sha256}); }
  else if (/Dms(DistributorLifecycleHandler|DistributorSurveyHandler|SalesTargetHandler|TriggerHandlersTest)/.test(file.file)) changes.push({file:file.file,state:'Added'});
}
fs.writeFileSync(path.join(output, 'changes.json'), JSON.stringify(changes,null,2));
console.log(JSON.stringify({output,files:manifest.length,lines:totalLines,changedOrAdded:changes.length,totals},null,2));
