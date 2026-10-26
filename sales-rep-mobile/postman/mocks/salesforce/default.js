// Local dependency simulation, based on DmsPortalApi. Never use with live data.
const http = require('http');
http.createServer(async (req, res) => {
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(req.method==='GET' && req.url.startsWith('/services/data/v67.0/query')) {
    const url=new URL(req.url,'http://simulation.invalid');
    const query=url.searchParams.get('q')||'';
    if(query==='SIMULATE_READ_HTML'){res.writeHead(530,{'Content-Type':'text/html'});return res.end('<html>Origin unavailable</html>');}
    if(query==='SIMULATE_PAGE')return reply(200,{done:false,records:[{Id:'first'}],nextRecordsUrl:'/services/data/v67.0/query/test-page'});
    if(url.pathname.endsWith('/test-page'))return reply(200,{done:true,records:[{Id:'second'}]});
    // Invoice read contract fixture. Apex tests independently verify creation.
    if(query.includes('FROM DMS_Invoice__c')) {
      if(!query.includes("Distributor__c='a0T000000000001AAA'") || !query.includes("Status__c='Issued'"))return reply(400,[{errorCode:'MALFORMED_QUERY',message:'Invoice requires account and issued scope'}]);
      const wrongId=query.includes("WHERE Id='") && !query.includes("WHERE Id='a0I000000000001AAA'");
      return reply(200,{done:true,records:wrongId?[]:[{Id:'a0I000000000001AAA',Name:'INV-SIMULATION',Status__c:'Issued',Primary_Order__c:'a03000000000001AAA',Primary_Order__r:{Name:'PO-SIMULATION'},Invoice_Date__c:'2026-10-26',Supplier_Name__c:'Fixture company',Bill_To_Name__c:'Fixture distributor',Gross_Amount__c:200,Discount_Amount__c:0,Tax_Amount__c:10,Total_Amount__c:210,Paid_Amount__c:0,Balance_Due__c:210}]});
    }
    if(query.includes('FROM DMS_Invoice_Line__c') && query.includes("Invoice__c='a0I000000000001AAA'"))return reply(200,{done:true,records:[{Id:'a0L000000000001AAA',Product_Name__c:'Fixture product',Cases__c:2,Case_Price__c:100,Quantity_Pieces__c:20,Unit_Price__c:10,Gross_Amount__c:200,Discount_Amount__c:0,Tax_Amount__c:10,Total_Amount__c:210}]});
    if(query.includes('FROM DMS_Distributor__c'))return reply(200,{done:true,records:[{Id:'a0T000000000001AAA',Name:'Fixture distributor',Login_Email__c:'test@example.invalid',Officer__r:{Name:'Fixture officer',IsActive:true}}]});
    if(query.startsWith('SELECT Id,Name,Product_Code__c'))return reply(200,{done:true,records:[{Id:'a01000000000001AAA',Name:'Fixture cases',Units_Per_Case__c:10,DMS_Case_Price__c:100}]});
    if(query.includes('FROM Scheme__c') && query.includes("Sales_Channel__c='Primary'"))return reply(200,{done:true,records:[{Id:'a02000000000001AAA',Name:'Fixture primary offer',Product__c:'a01000000000001AAA',Minimum_Cases__c:2,Free_Cases__c:1}]});
    if(!query.includes("a0T000000000001AAA"))return reply(400,[{errorCode:'MALFORMED_QUERY',message:'Missing fixture distributor scope'}]);
    if(query.includes('FROM DMS_Goods_Receipt__c')) {
      const receipts=(await pm.state.get('salesforce:receipts'))||{};
      return reply(200,{done:true,records:Object.values(receipts).map(row=>({Id:row.result.id,Name:'GRN-SIMULATION',Status__c:'Received',Total_Pieces__c:row.payload.cases*72}))});
    }
    if(query.startsWith('SELECT Id,Name,Active__c,Beat__c'))return reply(200,{done:true,records:[{Id:'outlet-1',Active__c:true,Beat__c:'beat-1',Beat__r:{Name:'Fixture beat'}}]});
    if(query.startsWith('SELECT Id,Retailer__c,Visit__c'))return reply(200,{done:true,records:[{Id:'order-1',Retailer__c:'outlet-1',Visit__c:'visit-1',Order_Date__c:'2026-10-10',Total_Amount__c:200}]});
    if(query.startsWith('SELECT Id,Retailer__c,Status__c'))return reply(200,{done:true,records:[{Id:'visit-1',Retailer__c:'outlet-1',Status__c:'Completed'}]});
    if(query.startsWith('SELECT Beat__c'))return reply(200,{done:true,records:[{Beat__c:'beat-1'}]});
    return reply(200,{done:true,records:[]});
  }
  if(req.method!=='POST'||req.url.replace(/\/$/,'')!=='/services/apexrest/dms/portal')return reply(501,{error:'Endpoint not modelled'});
  const body=req.body;
  if(!body||!body.distributorId)return reply(400,{error:'Distributor is not active.'});
  if(body.action==='receiveGoods') {
    // Narrow fixture of the approved-order receipt contract; Apex tests verify
    // actual approvals, conversion, posting and over-receipt checks separately.
    if(!body.requestKey || body.recordId!=='a0U000000000001AAA' || !Number.isInteger(body.cases) || body.cases<1 || body.cases>1 || !body.batch || !/^\d{4}-\d{2}-\d{2}$/.test(body.expiry))
      return reply(400,{error:'Select an approved line, valid date and remaining whole cases.'});
    const key=body.distributorId+':'+body.requestKey;
    const rows=(await pm.state.get('salesforce:receipts'))||{};
    if(rows[key] && JSON.stringify(rows[key].payload)!==JSON.stringify(body))return reply(400,{error:'This receipt key was already used with different details.'});
    if(!rows[key]){rows[key]={payload:body,result:{id:'a0Z000000000001AAA',status:'Received'}};await pm.state.set('salesforce:receipts',rows);}
    return reply(200,rows[key].result);
  }
  if(body.action==='distributorPrimaryOrder') {
    if(body.employeeId || !body.requestKey || !body.lines?.length || body.lines.some(line=>!Number.isInteger(line.cases)||line.cases<1))return reply(400,{error:'Use positive whole cases.'});
    if(body.lines.some(line=>line.schemeId && line.cases<2))return reply(400,{error:'Meet Minimum Cases.'});
    const key=body.distributorId+':'+body.requestKey;
    const rows=(await pm.state.get('salesforce:primaryOrders'))||{};
    if(rows[key] && JSON.stringify(rows[key].payload)!==JSON.stringify(body))return reply(400,{error:'This request was already used with different details.'});
    if(!rows[key]){rows[key]={payload:body,result:{id:'a03000000000001AAA',status:'Submitted'}};await pm.state.set('salesforce:primaryOrders',rows);}
    return reply(200,rows[key].result);
  }
  if(body.subject==='SIMULATE_HTML_530'){res.writeHead(530,{'Content-Type':'text/html'});return res.end('<html>Origin unavailable</html>');}
  if(body.subject==='SIMULATE_INVALID_SUCCESS')return reply(200,{unexpected:true});
  if(body.category==='Invalid')return reply(400,{error:'Enter a subject, description and valid issue category.'});
  if(body.action!=='ticket')return reply(400,{error:'Unsupported transaction.'});
  if(!body.requestKey||!body.subject||!body.description)return reply(400,{error:'Enter ticket details and a stable request key.'});
  const key=body.distributorId+':'+body.requestKey;
  const rows=(await pm.state.get('salesforce:tickets'))||{};
  const old=rows[key];
  if(old&&JSON.stringify(old.payload)!==JSON.stringify(body))return reply(400,{error:'This request key was already used for different ticket details.'});
  if(!old){rows[key]={payload:body,result:{id:'a0T000000000001AAA',status:'Open'}};await pm.state.set('salesforce:tickets',rows);}
  return reply(200,rows[key].result);
}).listen(process.env.PORT||4901);
