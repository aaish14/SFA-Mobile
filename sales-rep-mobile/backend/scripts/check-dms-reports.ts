// Read-only verification of report queries through the production DMS HTTP transport.
import { salesforce } from '../src/salesforce/SalesforceService.js';
import { DmsTransport } from '../src/dms/transport.js';
import { distributorReports } from '../src/dms/reports.js';
const transport = new DmsTransport(refresh => salesforce.dmsSession(refresh));
async function main() {
for (const id of process.argv.slice(2)) {
  const reports = await distributorReports(id, query => transport.records(query));
  console.log(JSON.stringify({ distributor: id, ok: true, outlets: reports.coverage.outlets,
    buyers: reports.coverage.buyers, beats: reports.beats.length, sales: reports.sales.current,
    targetConfigured: reports.sales.target !== null, stockBatches: reports.stock.batches.length }));
}
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
