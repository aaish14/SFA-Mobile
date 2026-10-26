/* Build one portable HTML document; no requests, external assets or page navigation. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const docs = path.join(root, 'docs/sfa-dms-code-handbook');
const manifest = JSON.parse(fs.readFileSync(path.join(docs, 'coverage.json'), 'utf8'));
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const areas = ['SFA mobile','DMS portal & mobile','Shared backend','Apex classes & tests','Apex triggers','Lightning components','Salesforce metadata','Configuration & operations'];
const destinations = new Map(manifest.files.map((entry,i) => [path.resolve(docs, entry.page), 'file-'+i]));
function main(html) {
  const match = html.match(/<main>([\s\S]*?)<\/main>/);
  if (!match) throw new Error('Missing main content');
  return match[1];
}
function localize(html, original, prefix) {
  html = html.replace(/\bid="([^"]+)"/g, (_,id) => `id="${prefix}-${id}"`);
  return html.replace(/<a\b([^>]*?)href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g, (_,before,url,after,label) => {
    const [relative,fragment] = url.split('#');
    let target;
    if (!relative) target = fragment === 'files' ? 'files' : prefix+'-'+fragment;
    else if (/^(https?:|mailto:|file:)/.test(relative)) return `<span>${label}</span>`;
    else {
      const resolved = path.resolve(path.dirname(original), decodeURIComponent(relative));
      const id = destinations.get(resolved);
      if (id) target = id+(fragment ? '-'+fragment : '');
      else if (path.basename(resolved)==='Manager-Explanation.html') target = 'manager'+(fragment ? '-'+fragment : '');
      else target = 'files';
    }
    return `<a href="#${target}">${label}</a>`;
  });
}
const managerPath = path.join(docs,'Manager-Explanation.html');
const manager = localize(main(fs.readFileSync(managerPath,'utf8')),managerPath,'manager');
let css = fs.readFileSync(path.join(docs,'style.css'),'utf8');
css += `
.controls{position:sticky;top:0;z-index:10;background:#f3f8f5;border-bottom:1px solid #b9d2c5;padding:14px 0}.controls input{width:min(580px,100%)}.controls label{display:block}.entry{padding:0;overflow:hidden}.entry>summary{padding:18px;list-style:none}.entry>summary::before{content:'+';display:inline-block;margin-right:12px;color:#16744e;font-size:22px}.entry[open]>summary::before{content:'−'}.filename{color:#12603f;text-decoration:underline}.filepath{display:block;font-weight:400;font-size:12px;overflow-wrap:anywhere}.description{display:block;font-weight:400;margin-top:6px}.content{padding:0 18px 18px;overflow:auto}.content section{padding:12px}.content:empty{display:none}[hidden]{display:none!important}.area{padding:0;border:0;background:transparent}.toolbar button{font:inherit}.source tr:target{outline:2px solid #16744e}.toplink{display:inline-block;margin-top:12px}@media print{.controls{position:static}.entry:not([open]){display:none}.entry>summary{font-size:16px}}
`;
let html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SFA + DMS - Single-page Code Handbook</title><style>${css}</style></head><body><header id="top"><h1>SFA + DMS - Single-page Code Handbook</h1><p>Click a file name to expand its code and explanation <strong>right here on this page</strong>. Click again to collapse it. No folders, other pages or internet connection are needed.</p><p class="muted">Snapshot: 26 October 2026 · ${manifest.totalFiles} files · ${manifest.totalLines.toLocaleString('en-IN')} source lines. Share this one HTML file with your manager.</p><nav class="toolbar"><a class="button" href="#manager">Manager walkthrough</a><a class="button" href="#files">Find code</a><button type="button" id="collapse">Collapse all files</button></nav></header><main><details id="manager"><summary>Manager walkthrough - process, architecture and logic</summary><div class="content">${manager}</div></details><div id="files" class="controls"><label for="search">Find a file, folder or feature</label><input type="search" id="search" placeholder="Example: DmsPortalApi, login, VisitScreen"><select id="category" aria-label="Filter code area"><option value="">All areas</option>${areas.map(a=>`<option>${escape(a)}</option>`).join('')}</select><p id="count" aria-live="polite"></p></div>`;
for (const area of areas) {
  html += `<section class="area" data-area="${escape(area)}"><h2>${escape(area)}</h2>`;
  manifest.files.forEach((entry,i) => {
    if (entry.category !== area) return;
    const id = 'file-'+i;
    const original = path.join(docs,entry.page);
    const body = localize(main(fs.readFileSync(original,'utf8')),original,id);
    html += `<details class="entry" id="${id}" data-search="${escape([entry.file,entry.description,entry.category].join(' ').toLowerCase())}"><summary><span class="filename">${escape(path.basename(entry.file))}</span><span class="filepath">${escape(entry.file)} · ${entry.lines} lines</span><span class="description">${escape(entry.description)}</span></summary><div class="content"></div><template>${body}</template></details>`;
  });
  html += '</section>';
}
html += `<a class="toplink" href="#top">Back to top</a></main><footer>Documentation only. Source paths are reference labels, not links to other folders. Explanations preserve the existing handbook's scope and verification limitations.</footer><script>
const search=document.getElementById('search'),category=document.getElementById('category');
const entries=[...document.querySelectorAll('details.entry')];
function load(entry){const body=entry.querySelector(':scope > .content');if(!body.childNodes.length)body.append(entry.querySelector('template').content.cloneNode(true));}
entries.forEach(entry=>entry.addEventListener('toggle',()=>{if(entry.open)load(entry);}));
function filter(){const query=search.value.trim().toLowerCase();let count=0;document.querySelectorAll('.area').forEach(area=>{let shown=0;area.querySelectorAll('details.entry').forEach(entry=>{const visible=(!category.value||category.value===area.dataset.area)&&entry.dataset.search.includes(query);entry.hidden=!visible;if(visible)shown++;});area.hidden=!shown;count+=shown;});document.getElementById('count').textContent=count+' matching files - click a filename to expand it below';}
search.addEventListener('input',filter);category.addEventListener('change',filter);
document.getElementById('collapse').addEventListener('click',()=>entries.forEach(entry=>{entry.open=false;}));
function navigate(hash){const id=decodeURIComponent(hash.replace(/^#/,''));const match=id.match(/^file-\\d+/);if(match){const entry=document.getElementById(match[0]);if(entry){search.value='';category.value='';filter();load(entry);entry.open=true;}}if(id.startsWith('manager'))document.getElementById('manager').open=true;const target=document.getElementById(id);if(target&&target.scrollIntoView)target.scrollIntoView({block:'start'});}
document.addEventListener('click',event=>{const link=event.target.closest('a[href^="#"]');if(link){event.preventDefault();const hash=link.getAttribute('href');navigate(hash);history.replaceState(null,'',hash);}});
window.addEventListener('hashchange',()=>navigate(location.hash));filter();if(location.hash)navigate(location.hash);
</script></body></html>`;
// Full source is inert template content until its file is expanded, keeping browsing responsive.
if (/\b(?:href|src)="(?!#)[^"]+"/.test(html)) throw new Error('Non-local resource/navigation found');
const output = path.join(root,'SFA-DMS-Single-Page-Handbook.html');
fs.writeFileSync(output,html,'utf8');
// Existing entry points now open the same inline experience, not the old multi-page index.
for (const target of [
  path.join(root,'SFA-DMS-File-Index.html'),
  path.join(docs,'File-Index.html'),
  ...['START-HERE.html','File-Index.html','index.html'].map(name=>path.join(root,'SFA-DMS-Shareable-Handbook',name)),
]) {
  if (fs.existsSync(path.dirname(target))) fs.writeFileSync(target,html,'utf8');
}
console.log(JSON.stringify({output,files:manifest.totalFiles,bytes:Buffer.byteLength(html),externalDependencies:0},null,2));
