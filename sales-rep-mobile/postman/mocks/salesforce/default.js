// Local dependency simulation, based on DmsPortalApi. Never use with live data.
const http = require('http');
http.createServer(async (req, res) => {
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  // Synthetic mailbox for local tests only; contains no live credentials or email.
  if(req.method==='GET' && req.url==='/test/mailbox')return reply(200,(await pm.state.get('salesforce:loginMessages'))||[]);
  if(req.method==='GET' && req.url==='/services/data/v67.0/limits') {
    if(req.headers.authorization==='Bearer limits-unavailable')return reply(503,{error:'Synthetic limits outage'});
    return reply(200,{SingleEmail:{Max:15,Remaining:req.headers.authorization==='Bearer limits-available'?1:-1},DailyWorkflowEmails:{Max:8040,Remaining:8027}});
  }
  if(req.method==='POST' && req.url==='/services/data/v67.0/actions/standard/emailSimple') {
    if(req.headers.authorization==='Bearer expired-session')return reply(401,{message:'Synthetic expired session'});
    // Recipient collection name comes from the live org's action describe schema.
    const input=req.body?.inputs?.[0], email=input?.emailAddressesArray?.[0];
    if(req.body?.inputs?.length!==1 || 'logEmailOnSend' in input || input.emailTemplateId || input.senderType!=='CurrentUser')
      return reply(400,[{isSuccess:false,errors:[{statusCode:'INVALID_INPUT'}]}]);
    if(email==='email-failure@example.invalid')return reply(500,[{isSuccess:false,errors:[{statusCode:'UNKNOWN_EXCEPTION'}]}]);
    if(email==='limit@example.invalid')return reply(200,[{isSuccess:false,errors:[{statusCode:'DAILY_WORKFLOW_EMAIL_LIMIT_EXCEEDED'}]}]);
    if(email==='ambiguous-limit@example.invalid')return reply(400,[{isSuccess:false,errors:[{statusCode:'EMAIL_NOT_PROCESSED_DUE_TO_PRIOR_ERROR',message:'Probably Limit Exceeded or 0 recipients'}]}]);
    if(email==='unconfirmed@example.invalid')return reply(200,[{isSuccess:false,errors:[]}]);
    const code=input.emailBody?.match(/code is (\d{6})/)?.[1]
      || (input.emailSubject?.startsWith('Your SFA Mobile sign-in code')
        ? input.emailBody?.match(/letter-spacing:6px">(\d{6})/)?.[1] : undefined);
    if(email!=='test@example.invalid'||!code)return reply(400,[{isSuccess:false,errors:[{statusCode:'INVALID_INPUT'}]}]);
    const messages=(await pm.state.get('salesforce:loginMessages'))||[];
    messages.push({email,code,via:'emailSimple'});
    await pm.state.set('salesforce:loginMessages',messages);
    return reply(200,[{actionName:'emailSimple',isSuccess:true,errors:null,outputValues:null}]);
  }
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
    if(query.includes('FROM DMS_Invoice_Line__c') && query.includes("Invoice__c='a0I000000000001AAA'"))return reply(200,{done:true,records:[{Id:'a0L000000000001AAA',Product__c:'a0P000000000001AAA',Product__r:{Product_Code__c:'TEST-SKU',Brand__c:'Fixture brand'},Product_Name__c:'Fixture product',Cases__c:2,Case_Price__c:100,Quantity_Pieces__c:20,Unit_Price__c:10,Gross_Amount__c:200,Discount_Amount__c:0,Tax_Amount__c:10,Total_Amount__c:210}]});
    if(query.includes('FROM DMS_Distributor__c'))return reply(200,{done:true,records:[{Id:'a0T000000000001AAA',Name:'Fixture distributor',Login_Email__c:'test@example.invalid',Officer__r:{Name:'Fixture officer',IsActive:true}}]});
    if(query.startsWith('SELECT Id,Name,Product_Code__c'))return reply(200,{done:true,records:[{Id:'a01000000000001AAA',Name:'Fixture cases',Units_Per_Case__c:10,DMS_Case_Price__c:100}]});
    if(query.includes('FROM Scheme__c')) {
      const primary={Id:'a02000000000001AAA',Name:'Fixture primary offer',Product__c:'a01000000000001AAA',Active__c:true,Sales_Channel__c:'Primary',Minimum_Cases__c:2,Free_Cases__c:1};
      const legacy={Id:'a02000000000002AAA',Name:'Fixture legacy piece offer',Product__c:'a01000000000001AAA',Active__c:true,Sales_Channel__c:null,Minimum_Quantity__c:2,Free_Quantity__c:1};
      return reply(200,{done:true,records:query.includes("Sales_Channel__c='Primary'")?[primary]:[primary,legacy]});
    }
    const returnRows=Object.values((await pm.state.get('salesforce:returns'))||{});
    const primaryReturn=returnRows.find(row=>row.payload.action==='distributorPrimaryReturn');
    const secondaryReturn=returnRows.find(row=>row.payload.action==='distributorSecondaryReturn');
    // Child reads follow an already scoped header, just as the actual transport does.
    if(query.includes('FROM DMS_Primary_Return_Line__c') && query.includes("Primary_Return__c='a0X000000000001AAA'"))
      return reply(200,{done:true,records:primaryReturn?primaryReturn.payload.lines.map((line,index)=>({Id:`a0N00000000000${index+1}AAA`,Product__c:'a0P000000000001AAA',Product__r:{Name:'Received fixture'},Cases__c:line.cases,Reason__c:line.reason,Notes__c:line.notes,Receipt_Line__r:{Goods_Receipt__r:{Primary_Order__c:'a0O000000000001AAA',Primary_Order__r:{Name:'PO-FIXTURE'}}}})):[]});
    if(!query.includes("a0T000000000001AAA"))return reply(400,[{errorCode:'MALFORMED_QUERY',message:'Missing fixture distributor scope'}]);
    if(query.includes('FROM DMS_Primary_Return__c'))return reply(200,{done:true,records:primaryReturn?[{Id:primaryReturn.result.id,Name:'PR-FIXTURE',Status__c:primaryReturn.result.status,Primary_Order__c:'a0O000000000001AAA',Officer__r:{Name:'Fixture officer'}}]:[]});
    if(query.includes('FROM DMS_Primary_Order_Line__c'))return reply(200,{done:true,records:[{Id:'a0U000000000001AAA',Product__r:{Name:'Received fixture'},Cases__c:3,Free_Cases__c:0,Order__r:{Name:'PO-FIXTURE'}}]});
    if(query.includes('FROM Product_Return__c')) {
      const rows=secondaryReturn?secondaryReturn.payload.lines.map((line,index)=>({Id:`a0Y00000000000${index+1}AAA`,Name:`RET-FIXTURE-${index+1}`,DMS_Distributor__c:secondaryReturn.payload.distributorId,Product__c:'a0P000000000001AAA',Product__r:{Name:index?'Second ordered fixture':'Ordered fixture'},Quantity__c:line.pieces,Return_Reason__c:line.reason,Return_Notes__c:line.notes,Order_Item__c:line.orderItemId,Order_Item__r:{Sales_Order__c:'a0O000000000002AAA',Sales_Order__r:{Name:'SO-FIXTURE'}},Mobile_Request_Key__c:`${secondaryReturn.payload.distributorId}:${secondaryReturn.payload.requestKey}:${line.orderItemId}`,DMS_Status__c:secondaryReturn.result.status})):[];
      const id=query.match(/WHERE Id='([^']+)'/)?.[1];
      return reply(200,{done:true,records:id?rows.filter(row=>row.Id===id):rows});
    }
    if(query.includes('FROM DMS_Goods_Receipt_Line__c'))return reply(200,{done:true,records:[{Id:'a0R000000000001AAA',Product__c:'a0P000000000001AAA',Product__r:{Name:'Received fixture'},Received_Cases__c:3,Free_Cases__c:0,Goods_Receipt__c:'a0Z000000000001AAA',Goods_Receipt__r:{Name:'GRN-FIXTURE',Primary_Order__c:'a0O000000000001AAA',Primary_Order__r:{Name:'PO-FIXTURE'}}}]});
    if(query.includes('FROM Order_Item__c') && query.includes('Piece_Quantity__c'))return reply(200,{done:true,records:[1,2].map(index=>({Id:`a0L00000000000${index}AAA`,Product__c:'a0P000000000001AAA',Product__r:{Name:index===1?'Ordered fixture':'Second ordered fixture'},Piece_Quantity__c:10,Sales_Order__c:'a0O000000000002AAA',Sales_Order__r:{Name:'SO-FIXTURE',Retailer__r:{Name:'Fixture outlet'}}}))});
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
  if(body?.action==='sendLoginCode') {
    if(body.email==='limit@example.invalid')return reply(400,{error:'Salesforce daily email limit has been reached. A new code cannot be sent until the limit resets.'});
    if(body.email==='unconfirmed@example.invalid')return reply(200,{id:'a0T000000000001AAA',status:'Not accepted'});
    if(body.email==='email-failure@example.invalid')return reply(500,{error:'Synthetic email rejection'});
    if(body.email!=='test@example.invalid'||!/^[0-9]{6}$/.test(body.code||''))return reply(400,{error:'Invalid synthetic sign-in request'});
    const messages=(await pm.state.get('salesforce:loginMessages'))||[];
    messages.push({email:body.email,code:body.code});
    await pm.state.set('salesforce:loginMessages',messages);
    return reply(200,{id:'a0T000000000001AAA',status:'Email accepted'});
  }
  if(!body||!body.distributorId)return reply(400,{error:'Distributor is not active.'});
  if(body.action==='distributorPrimaryReturn' || body.action==='distributorSecondaryReturn') {
    // Contract-derived HTTP fixture; real approval and quantity rules run in Apex tests.
    const primary=body.action==='distributorPrimaryReturn';
    if(body.employeeId || !body.lines?.length || body.distributorId!=='a0T000000000001AAA')return reply(400,{error:'Invalid return scope.'});
    if(body.lines.some(line => primary ? line.receiptLineId!=='a0R000000000001AAA'||line.cases>3 : !['a0L000000000001AAA','a0L000000000002AAA'].includes(line.orderItemId)||line.pieces>10))return reply(400,{error:'Return exceeds the remaining ordered quantity.'});
    const key=body.distributorId+':'+body.requestKey;
    const rows=(await pm.state.get('salesforce:returns'))||{};
    if(rows[key] && JSON.stringify(rows[key].payload)!==JSON.stringify(body))return reply(400,{error:'This request key was already used with different details.'});
    if(!rows[key]) {rows[key]={payload:body,result:{id:primary?'a0X000000000001AAA':'a0Y000000000001AAA',status:primary?'Submitted':'Pending'}};await pm.state.set('salesforce:returns',rows);}
    return reply(200,rows[key].result);
  }
  if(body.action==='returnGroupDecision') {
    const rows=(await pm.state.get('salesforce:returns'))||{};
    const row=Object.values(rows).find(item=>item.result.id===body.recordId && item.payload.distributorId===body.distributorId);
    if(!row || row.payload.action!=='distributorSecondaryReturn')return reply(400,{error:'Return is not available.'});
    if(!['Approved','Rejected'].includes(body.decision) || (body.decision==='Rejected'&&!body.notes))return reply(400,{error:'Enter a valid decision and reason.'});
    if(!['Pending',body.decision].includes(row.result.status))return reply(400,{error:'This return already has another decision.'});
    row.result.status=body.decision; await pm.state.set('salesforce:returns',rows);
    return reply(200,{id:row.result.id,status:row.result.status,count:row.payload.lines.length});
  }
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
