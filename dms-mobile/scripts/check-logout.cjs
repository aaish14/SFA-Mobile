// Local component-handler tests only: no real credentials, email or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const native = require('react-native-web');
const root = path.resolve(__dirname, '..');
let states = [], refs = [], stateIndex = 0, refIndex = 0;
let storedSession, failStorage = false, requestHandler, calls = [];
const outboxes = new Map(), snapshots = new Map();
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file, module);
  mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
  cache.set(file, mod);
  mod.require = name => {
    if (name.endsWith(".png")) return {uri: "nestle-logo.png"};
    if (name === 'react-native') return native;
    if (name === 'react' && file.endsWith('DmsApp.tsx')) return {
      ...React, useEffect: () => {},
      useState: initial => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
      },
      useRef: initial => {
        const index = refIndex++;
        if (!refs[index]) refs[index] = {current: initial};
        return refs[index];
      }
    };
    if (name === './api') return {
      ApiError: class extends Error {},
      request: async (...args) => { calls.push(args); return requestHandler(...args); }
    };
    if (name === './storage') return {
      saveSession: async value => { if (failStorage) throw Error('storage unavailable'); storedSession = value; },
      readSession: async () => storedSession,
      readPending: async id => structuredClone(outboxes.get(id) || []),
      savePending: async (id, value) => outboxes.set(id, structuredClone(value)),
      readSnapshot: async id => snapshots.get(id),
      saveSnapshot: async (id, value) => snapshots.set(id, value),
    };
    if (name === 'expo-crypto') return {};
    if (name.startsWith('.')) {
      const base = path.resolve(path.dirname(file), name);
      for (const ext of ['.tsx', '.ts']) if (fs.existsSync(base + ext)) return load(base + ext);
    }
    return Module.prototype.require.call(mod, name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2022}
  }).outputText, file);
  return mod.exports;
}
const App = load(path.join(root, 'src/DmsApp.tsx')).default;
const account = {id: 'distributor-A', token: 'fixture-only-A', name: 'Fixture A'};
const pending = {key: 'stable-receipt-key', path: '/transactions', label: 'Receipt', body: {action: 'receiveGoods'}};
function reset() {
  states = [account, {distributor: {}, retrievedAt: '2026-10-22', truncatedLists: []}, [pending], 'More'];
  refs = []; outboxes.clear(); snapshots.clear(); calls = []; failStorage = false;
  storedSession = account; outboxes.set(account.id, [pending]);
  outboxes.set('distributor-B', []);
  requestHandler = () => { throw Error('Unexpected network attempt'); };
}
function render() { stateIndex = 0; refIndex = 0; return App(); }
function find(node, predicate) {
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const match = find(child, predicate); if (match) return match;
  }
}
const button = (tree, title) => find(tree, node => node.props?.title === title);
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve=yes; reject=no; }); return {promise, resolve, reject}; }
async function logout() { button(render(), 'Log out').props.onPress(); await flush(); }
(async () => {
  // Exercise receipt quantity handlers against approved order pricing without saving data.
  const {goodsReceiptAmount} = load(path.join(root, 'src/goodsReceipt.ts'));
  const paidLine = {Id: 'receipt-price-test', receiptKind: 'Paid', Cases__c: 3,
    Case_Price__c: 918, Discount_Amount__c: 0, Product__r: {Name: 'Fixture product'}};
  const totalText = tree => React.Children.toArray(find(tree,
    node => node.props?.accessibilityLiveRegion === 'polite').props.children).join('');
  reset();
  states[2] = []; states[3] = 'Primary'; states[14] = paidLine;
  let receiptTree = render();
  assert.equal(totalText(receiptTree), 'Total receipt amount: —');
  for (const [quantity, expected] of [['1', '₹918.00'], ['2', '₹1836.00'], ['01', '₹918.00'], ['', '—'], ['1.5', '—']]) {
    find(receiptTree, node => node.props?.label === 'Received cases — whole number').props.onChange(quantity);
    receiptTree = render();
    assert.equal(totalText(receiptTree), `Total receipt amount: ${expected}`);
  }
  states[14] = {...paidLine, Case_Price__c: 100, Discount_Amount__c: 1};
  states[15] = '2'; states[16] = 'fixture-batch'; states[17] = '2030-12-14';
  receiptTree = render();
  assert.equal(totalText(receiptTree), 'Total receipt amount: ₹199.34', 'Round per-case cost as Salesforce does before multiplying');
  button(receiptTree, 'Review goods receipt').props.onPress();
  assert.match(states[18].label, /Receipt amount ₹199.34 \(excluding GST\)/);
  assert.deepEqual(states[18].body, {action: 'receiveGoods', receiptKind: 'Paid',
    recordId: paidLine.Id, cases: 2, batch: 'fixture-batch', expiry: '2030-12-14'});
  states[14] = {...paidLine, receiptKind: 'Free'};
  assert.equal(totalText(render()), 'Total receipt amount: ₹0.00', 'Free cases must never use the paid case price');
  assert.equal(goodsReceiptAmount({...paidLine, Case_Price__c: 280}, '2').total, 560, 'Changing the selected product changes its price');
  for (const missing of [null, undefined, '']) assert.equal(goodsReceiptAmount({...paidLine, Case_Price__c: missing}, '1'), null);
  assert.equal(goodsReceiptAmount({...paidLine, Discount_Amount__c: 3000}, '1'), null);
  for (const quantity of ['0', '-1', 'text', '100001']) assert.equal(goodsReceiptAmount(paidLine, quantity).total, null);
  assert.equal(calls.length, 0, 'Changing quantity or reviewing does not create a receipt or call Salesforce');
  console.log('PASS: live receipt totals for 1/2 cases, per-case discount rounding, product changes, free cases, invalid input and unchanged save payload.');
  reset();
  states[3] = 'Primary'; states[19] = true; states[7] = true;
  let orderTree = render();
  let orderForm = find(orderTree, node => typeof node.props?.onReview === 'function');
  assert.equal(orderForm.props.disabled, false, 'Background sync must not disable selecting/reviewing products');
  const draft = {lines: [{productId: 'fixture-product', cases: 1}], notes: 'Keep my selection'};
  orderForm.props.onReview(draft, 'Fixture product: 1 case');
  orderTree = render();
  assert.ok(find(orderTree, node => node.props?.visible === true && node.props?.transparent === true), 'Review must open a visible modal, not a card above the product list');
  assert.equal(button(orderTree, 'Waiting for current sync…').props.disabled, true, 'Do not overlap queue writes with an active sync');
  assert.deepEqual(states[18].body, draft);
  assert.equal(calls.length, 0, 'Reviewing must not submit the order');
  states[7] = false;
  orderTree = render();
  assert.equal(button(orderTree, 'Confirm and save').props.disabled, false);
  button(orderTree, 'Back to edit order').props.onPress();
  assert.equal(states[18], null);
  assert.equal(states[19], true, 'Returning to edit must keep the existing product form mounted');
  assert.equal(calls.length, 0, 'Returning to edit must not submit');
  reset();
  states[3] = 'Returns';
  let returnsTree = render();
  assert.equal(find(returnsTree, node => node.props?.accessibilityLabel === 'Primary returns').props.accessibilityState.selected, true);
  find(returnsTree, node => node.props?.accessibilityLabel === 'Secondary returns').props.onPress();
  returnsTree = render();
  assert.equal(find(returnsTree, node => node.props?.accessibilityLabel === 'Secondary returns').props.accessibilityState.selected, true);
  find(returnsTree, node => node.props?.accessibilityLabel === 'Primary returns').props.onPress();
  assert.equal(states[25], 'Primary');
  assert.equal(calls.length, 0, 'Switching return tabs must not submit any transaction');
  reset();
  states[7] = true; // background sync must not disable logout
  assert.equal(button(render(), 'Log out').props.disabled, false);
  await logout();
  assert.equal(storedSession, null);
  assert.equal(states[0], null); assert.equal(states[1], null);
  assert.deepEqual(states[2], []);
  assert.deepEqual(outboxes.get(account.id), [pending]);
  assert.deepEqual(outboxes.get('distributor-B'), []);
  assert.ok(button(render(), 'Email my sign-in code'));
  assert.match(states[8], /pending changes remain saved/);
  assert.equal(calls.length, 0);

  reset();
  failStorage = true;
  await logout();
  assert.equal(storedSession.id, account.id);
  assert.equal(states[0].id, account.id);
  assert.match(states[8], /Could not remove the saved sign-in/);
  assert.deepEqual(outboxes.get(account.id), [pending]);

  for (const succeeds of [true, false]) {
    reset();
    const flight = deferred();
    requestHandler = () => flight.promise;
    find(render(), node => node.props?.accessibilityLabel === 'Refresh and sync').props.onPress();
    await flush();
    assert.equal(calls.length, 1);
    await logout();
    if (succeeds) flight.resolve({id: 'receipt-A', status: 'Received'});
    else flight.reject(Error('Connection lost'));
    await flush();
    assert.equal(states[0], null); assert.equal(states[1], null);
    assert.deepEqual(states[2], []); assert.equal(states[23], '');
    assert.match(states[8], /Signed out/);
    assert.equal(calls.length, 1, 'No follow-up request after logout');
    assert.equal(outboxes.get(account.id).length, succeeds ? 0 : 1);
    if (!succeeds) assert.equal(outboxes.get(account.id)[0].key, pending.key);
    assert.deepEqual(outboxes.get('distributor-B'), []);
  }
  reset();
  const rejected = {...pending, status: 400, error: 'Received cases exceed the remaining approved quantity.',
    body: {action: 'receiveGoods', recordId: 'line-A', receiptKind: 'Paid', cases: 20, batch: '100', expiry: '2026-12-14', requestKey: pending.key}};
  states[1].primaryOrders = [{Id: 'order-A', Status__c: 'Approved', Order_Lines__r: {records: [
    {Id: 'line-A', Cases__c: 1, Product__r: {Name: 'Fixture product'}}]}}];
  states[2] = [rejected]; states[3] = 'Primary'; states[7] = true;
  outboxes.set(account.id, [rejected]);
  const correct = button(render(), 'Correct rejected receipt');
  assert.equal(correct.props.disabled, false, 'Correction remains available during refresh');
  correct.props.onPress();
  assert.equal(states[14].correctionKey, rejected.key);
  assert.equal(states[15], '20'); assert.equal(states[16], '100'); assert.equal(states[17], '2026-12-14');
  assert.deepEqual(outboxes.get(account.id), [rejected], 'Opening form must not delete pending work');
  button(render(), 'Review goods receipt').props.onPress();
  assert.equal(states[18], null); assert.match(states[22], /approves 1 case/);
  states[15] = '1';
  button(render(), 'Review goods receipt').props.onPress();
  assert.equal(states[18].replacesKey, rejected.key);
  assert.equal(states[18].body.cases, 1);
  assert.deepEqual(outboxes.get(account.id), [rejected], 'Review must not replace pending work before confirmation');
  states[7] = false;
  const saving = deferred(); requestHandler = () => saving.promise;
  button(render(), 'Confirm and save').props.onPress(); await flush();
  assert.equal(outboxes.get(account.id).length, 1);
  assert.equal(outboxes.get(account.id)[0].key, rejected.key);
  assert.equal(outboxes.get(account.id)[0].body.cases, 1);
  assert.equal(outboxes.get(account.id)[0].status, undefined);
  assert.equal(calls.length, 1); assert.equal(calls[0][2].requestKey, rejected.key);
  saving.reject(Error('Offline fixture')); await flush();
  assert.equal(outboxes.get(account.id).length, 1, 'Failed send retains corrected request');
  console.log('PASS: logout, account isolation, late sync, and rejected receipt correction/preservation/idempotency. No real network calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
