// Temporary local-only credential entry. No credentials are logged or returned to the browser.
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawn } = require('node:child_process');
const nodemailer = require('../sales-rep-mobile/backend/node_modules/nodemailer');
const port = 8096, origin = `http://127.0.0.1:${port}`;
const token = crypto.randomBytes(32).toString('hex');
let busy = false, saved = false, attempts = [];
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DMS private Gmail setup</title>
<style>body{font:17px system-ui;background:#eff7f2;color:#183d31;margin:0;padding:40px}main{max-width:650px;margin:auto;background:white;padding:32px;border-radius:18px}h1{font-size:27px}p,li{line-height:1.6}label{display:block;margin-top:20px;font-weight:600}input,button{box-sizing:border-box;width:100%;padding:15px;margin-top:9px;border:1px solid #bdd5c7;border-radius:8px;font:inherit}button{background:#17724d;color:white;font-weight:700;cursor:pointer}button:disabled{opacity:.6}a{color:#14653e}#status{padding:16px;background:#e5f3eb;margin-top:20px;border-radius:8px}small{display:block;line-height:1.6;margin-top:18px}</style>
<main><h1>Connect Gmail for DMS login codes</h1><p>This private page runs only on your computer.</p>
<ol><li>Open <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">Google App Passwords</a> and complete Google's verification.</li><li>Create an App Password named <strong>DMS portal</strong>.</li><li>Enter it below and click <strong>Verify and save</strong>.</li></ol>
<form id="setup"><label for="user">Gmail sender address</label><input id="user" name="user" type="email" value="aishwaryahs14123@gmail.com" required autocomplete="username"><label for="password">Google App Password (16 letters)</label><input id="password" name="password" type="password" required autocomplete="off" maxlength="64" placeholder="Enter privately here"><button id="save">Verify and save</button></form>
<div id="status" role="status">Not saved yet. Do not enter your normal Gmail password.</div><small>The App Password is encrypted for your Windows account outside the project. This check verifies Gmail authentication; it does not send a test email. Never paste the password into chat.</small></main>
<script nonce="${token}">document.getElementById('setup').addEventListener('submit',async event=>{event.preventDefault();const button=document.getElementById('save'),status=document.getElementById('status'),password=document.getElementById('password');button.disabled=true;status.textContent='Verifying Gmail securely…';try{const response=await fetch('/save',{method:'POST',headers:{'Content-Type':'application/json','X-DMS-Setup':'${token}'},body:JSON.stringify({user:document.getElementById('user').value,password:password.value})});const data=await response.json();status.textContent=data.message;if(data.saved){password.value='';document.getElementById('setup').hidden=true;}}catch{status.textContent='The local setup could not finish. Check that the setup helper is still running.'}finally{button.disabled=false;}});</script></html>`;
const server = http.createServer(async (req,res) => {
  res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',`default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${token}'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`);
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(req.headers.host!==`127.0.0.1:${port}`)return json(403,{message:'Use the private local setup address.'});
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html);}
  if(req.method==='GET'&&req.url==='/status')return json(200,{saved});
  if(req.method!=='POST'||req.url!=='/save')return json(404,{message:'Not found'});
  if(req.headers.origin!==origin||req.headers['x-dms-setup']!==token||req.headers['content-type']!=='application/json')return json(403,{message:'Open the local setup page and try again.'});
  attempts=attempts.filter(time=>Date.now()-time<60000);
  if(saved)return json(409,{message:'Already saved. Return to Codex to activate the sender.',saved:true});
  if(busy||attempts.length>=3)return json(429,{message:'Please wait before trying again.'});
  busy=true; attempts.push(Date.now()); let client,settings;
  try {
    let body=''; for await(const chunk of req){body+=chunk;if(body.length>2048)throw new Error('INVALID_INPUT');}
    settings=JSON.parse(body);body='';settings.user=String(settings.user||'').trim().toLowerCase();settings.password=String(settings.password||'').replace(/\s/g,'');
    if(!/^[a-z0-9._%+-]+@(?:gmail|googlemail)\.com$/.test(settings.user)||!/^[a-z]{16}$/i.test(settings.password))return json(400,{message:'Enter a Gmail address and the 16-letter App Password from Google.'});
    client=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:settings.user,pass:settings.password},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,logger:false,debug:false});
    await client.verify();
    await new Promise((resolve,reject)=>{
      const child=spawn('powershell.exe',['-NoProfile','-File',path.join(__dirname,'Save-DmsGmailSettings.ps1')],{windowsHide:true,stdio:['pipe','pipe','ignore']});
      let output='';child.stdout.on('data',chunk=>output+=chunk);
      const timeout=setTimeout(()=>{child.kill();reject(new Error('SAVE_FAILED'));},30000);
      child.on('error',()=>{clearTimeout(timeout);reject(new Error('SAVE_FAILED'));});
      child.on('close',code=>{clearTimeout(timeout);code===0&&output==='saved'?resolve():reject(new Error('SAVE_FAILED'));});
      child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(settings));
    });
    saved=true;json(200,{saved:true,message:'Saved successfully. Gmail authentication is verified. Tell Codex to activate the sender and test one portal login email.'});
  } catch(error) {
    const message=error.code==='EAUTH'?'Google rejected the credential. Use an App Password created in the Gmail account shown above.':error.message==='SAVE_FAILED'?'Gmail verified, but encrypted storage failed. Tell Codex; do not send the password.':'Could not verify Gmail. Check your connection and App Password, then try again.';
    json(502,{message});
  } finally {client?.close();if(settings)settings.password='';settings=null;busy=false;}
});
server.listen(port,'127.0.0.1',()=>console.log('Private Gmail setup ready on 127.0.0.1:8096'));
setTimeout(()=>{server.close();setTimeout(()=>process.exit(0),1000).unref();},30*60*1000).unref();
