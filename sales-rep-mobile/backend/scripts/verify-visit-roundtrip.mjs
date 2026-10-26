// Creates clearly marked temporary Salesforce records, then removes only those records.
// Run from the platform root after `npm run build --workspace backend`.
import assert from 'node:assert/strict';
import { app } from '../dist/app.js';
import { salesforce as sf } from '../dist/salesforce/SalesforceService.js';
import { env } from '../dist/config/env.js';
import jwt from '../node_modules/jsonwebtoken/index.js';
if (!process.argv.includes('--allow-salesforce-test-records') || env.USE_MOCK_DATA) throw new Error('Explicit live-test flag and live Salesforce mode are required.');
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.on('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const created = [];
async function create(object, body) { const row = await sf.create(object, body); created.push([object, row.id]); return row.id; }
let visitId;
try {
  const employee = (await sf.records("SELECT Id, Email__c, Salesforce_User__c FROM Employee__c WHERE Name='Dhanush' LIMIT 1"))[0];
  const allocation = (await sf.records(`SELECT Outlet__c, Beat__c FROM Distributor_Outlet_Allocation__c WHERE Employee__c='${employee.Id}' AND Allocation_Status__c='Active' LIMIT 1`))[0];
  const plan = (await sf.records(`SELECT Id FROM Permanent_Journey_Plan__c WHERE Employee__c='${employee.Id}' AND Status__c='Approved' LIMIT 1`))[0];
  const token = jwt.sign({ sub: employee.Email__c, employeeId: employee.Id, salesforceUserId: employee.Salesforce_User__c }, env.JWT_SECRET, { expiresIn: '10m' });
  async function api(path, body, method = body ? 'POST' : 'GET') {
    const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (path.startsWith('/documents/')) { assert.equal(r.status, 200, `${path}: ${r.status}`); assert((await r.arrayBuffer()).byteLength > 200); return; }
    const result = await r.json();
    assert.equal(result.success, true, `${path}: ${JSON.stringify(result)}`);
    return result.data;
  }
  const stamp = Date.now();
  const productId = await create('Product__c', { Name: `SFA Verification ${stamp}`, Product_Code__c: `VERIFY-${stamp}`, MRP__c: 25, Retailer_Base_Price__c: 20, Selling_Price__c: 20, Units_Per_Case__c: 1, Available_Stock__c: 100, Active__c: true, Sellable__c: true, Returnable__c: true, GST_Percent__c: 0 });
  visitId = await create('Visit__c', { Name: `SFA Verification ${stamp}`, Employee__c: employee.Id, Retailer__c: allocation.Outlet__c, Permanent_Journey_Plan__c: plan.Id, Visit_Date__c: new Date().toISOString().slice(0,10), Status__c: 'Checked In', Check_In_Time__c: new Date().toISOString(), Check_In_Latitude__c: 13.381857, Check_In_Longitude__c: 77.117319, Offline_Key__c: `verify-${stamp}` });
  console.log('PASS restore existing Salesforce visit (not in server memory)', (await api(`/visits/${visitId}`)).id === visitId);
  assert((await api('/products')).some(p => p.id === productId));
  console.log('PASS Salesforce product -> app catalog');
  const items = [{ productId, productName: 'SFA Verification', quantity: 4, unitPrice: 20, discount: 0, amount: 80 }];
  await api(`/visits/${visitId}/order-draft`, { items });
  assert.equal((await api(`/visits/${visitId}`)).orderLines.length, 1);
  console.log('PASS order draft -> Salesforce -> app recovery');
  const refusedProduct = await create('Product__c', { Name: `SFA Refusal Verification ${stamp}`, Product_Code__c: `REFUSE-${stamp}`, MRP__c: 25, Retailer_Base_Price__c: 20, Selling_Price__c: 20, Units_Per_Case__c: 1, Available_Stock__c: 100, Active__c: true, Sellable__c: true, GST_Percent__c: 0 });
  await create('Product_Sales_Configuration__c', { Name: `SFA Verification ${stamp}`, Product__c: refusedProduct, Configuration_Type__c: 'Must Sell', Minimum_Quantity__c: 1, Target_Quantity__c: 2, Active__c: true, Start_Date__c: new Date(Date.now() - 86400000).toISOString().slice(0,10) });
  const refusal = await api('/product-refusals', { visitId, productId: refusedProduct, reason: 'Low demand', notes: 'Temporary employee refusal verification' });
  const savedRefusal = await sf.retrieve('Product_Refusal__c', refusal.id);
  assert.equal(savedRefusal.Employee__c, employee.Id);
  assert.equal(savedRefusal.Notes__c, 'Temporary employee refusal verification');
  console.log('PASS Must Sell refusal linked to Employee, including notes');
  const actions = [
    ['/returns', { productId, quantity: 1, reason: 'Other' }, 'Product_Return__c', 'returns'],
    ['/stock-checks', { productId, quantity: 10 }, 'Stock_Check__c', 'stock-checks'],
    ['/competitor-activities', { competitorName: 'SFA Verification', company: 'Test', mrp: 20 }, 'Competitor_Activity__c', 'competitor-activities'],
    ['/tickets', { subject: 'SFA Verification', description: 'Temporary automated roundtrip check' }, 'SFA_Ticket__c', 'tickets'],
    ['/asset-surveys', { assetCode: `VERIFY-${stamp}`, assetName: 'SFA Verification', status: 'Working' }, 'Asset_Survey__c', 'asset-surveys'],
  ];
  for (const [path, values, object, module] of actions) {
    const payload = { ...values, visitId, requestId: `${stamp}-${module}` };
    const saved = await api(path, payload);
    assert.equal((await api(path, payload)).id, saved.id);
    assert((await api(`/modules/${module}`)).some(r => r.Id === saved.id));
    console.log(`PASS ${module}: save, duplicate retry, Salesforce list readback`);
  }
  const apiRoot = `/services/data/v${env.SALESFORCE_API_VERSION}`;
  await assert.rejects(sf.composite([
    { method: 'POST', url: `${apiRoot}/sobjects/Sales_Order__c`, referenceId: 'rollbackOrder', body: { Order_Date__c: new Date().toISOString().slice(0,10), Status__c: 'Submitted', Retailer__c: allocation.Outlet__c, Visit__c: visitId } },
    { method: 'POST', url: `${apiRoot}/composite/sobjects`, referenceId: 'badItems', body: { allOrNone: true, records: [{ attributes: { type: 'Order_Item__c' }, Sales_Order__c: '@{rollbackOrder.id}', Product__c: 'deliberately-invalid-id', Piece_Quantity__c: 1 }] } },
  ]));
  assert.equal((await sf.records(`SELECT Id FROM Sales_Order__c WHERE Visit__c='${visitId}'`)).length, 0);
  console.log('PASS failed item rolls back the entire order (no partial records)');
  const order = await api('/orders', { visitId, items, requestId: `order-final-${visitId}` });
  assert.equal(Number(order.totalAmount), 80);
  assert.equal((await api('/orders', { visitId, items, requestId: `order-final-${visitId}` })).id, order.id);
  assert.equal((await api('/orders', { visitId, items, requestId: `retry-without-memory-key-${visitId}` })).id, order.id);
  const orders = await sf.records(`SELECT Id FROM Sales_Order__c WHERE Visit__c='${visitId}'`);
  assert.equal(orders.length, 1);
  const appOrder = (await api('/orders')).find(o => o.id === order.id);
  assert.equal(appOrder.items.length, 1);
  assert.equal(appOrder.amount, 80);
  console.log('PASS atomic order + item save, no duplicate, My Orders readback (80 INR)');
  await api('/store/checkout', { visitId, location: { latitude: 13.381857, longitude: 77.117319 } });
  const first = await api(`/visits/${visitId}`);
  await api('/store/checkout', { visitId, location: { latitude: 13.381857, longitude: 77.117319 } });
  const second = await api(`/visits/${visitId}`);
  assert.equal(second.status, 'Completed');
  assert.equal(first.checkOut.timestamp, second.checkOut.timestamp);
  console.log('PASS checkout persisted and repeat preserved original checkout time');
  await api(`/documents/pdf/${visitId}`); await api(`/documents/excel/${visitId}`);
  console.log('PASS PDF and Excel generation');
} finally {
  // Remove dependent test records even if an assertion fails halfway through a write.
  if (visitId) {
    for (const [object, clause] of [
      ['Order_Item__c', `Sales_Order__r.Visit__c='${visitId}'`],
      ['Sales_Order__c', `Visit__c='${visitId}'`],
      ...['Product_Return__c','Stock_Check__c','Competitor_Activity__c','SFA_Ticket__c','Asset_Survey__c','Product_Refusal__c'].map(object => [object, `Visit__c='${visitId}'`]),
    ]) for (const row of await sf.records(`SELECT Id FROM ${object} WHERE ${clause}`)) await sf.request(`/sobjects/${object}/${row.Id}`, { method: 'DELETE' });
  }
  for (const [object, id] of created.reverse()) await sf.request(`/sobjects/${object}/${id}`, { method: 'DELETE' });
  server.close();
  console.log('Temporary verification records removed (Salesforce recycle bin). No retailer email was requested.');
}
