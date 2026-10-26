/* Package documentation only. Never move application source or Salesforce metadata. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'docs/sfa-dms-code-handbook');
const output = path.join(root, 'SFA-DMS-Shareable-Handbook');
fs.mkdirSync(output, { recursive: true });
const mapping = new Map();
for (const file of fs.readdirSync(source)) {
  if (/\.html$|\.css$|\.json$/.test(file)) mapping.set(path.join(source, file), file === 'index.html' ? 'Handbook.html' : file);
}
for (const file of fs.readdirSync(path.join(source, 'files'))) {
  if (file.endsWith('.html')) mapping.set(path.join(source, 'files', file), file);
}
for (const file of ['SFA-DMS-Complete-Code-Explanation.pdf', 'SFA-DMS-File-Index.pdf', 'SFA-DMS-Manager-Explanation.pdf']) {
  mapping.set(path.join(root, 'output/pdf', file), file);
}
const unhandled = [];
for (const [original, name] of mapping) {
  if (!name.endsWith('.html')) {
    fs.copyFileSync(original, path.join(output, name));
    continue;
  }
  let text = fs.readFileSync(original, 'utf8');
  text = text.replace(/\b(href|src)="([^"]*)"/g, (match, attr, url) => {
    if (url === '#files' && path.basename(original) === 'Manager-Explanation.html') return `${attr}="File-Index.html"`;
    if (url.startsWith('#') || /^(https?:|mailto:|data:)/.test(url)) return match;
    const hashAt = url.indexOf('#');
    const relative = hashAt < 0 ? url : url.slice(0, hashAt);
    const fragment = hashAt < 0 ? '' : url.slice(hashAt);
    const absolute = path.resolve(path.dirname(original), decodeURIComponent(relative));
    const target = mapping.get(absolute);
    if (!target) { unhandled.push({ original, url }); return match; }
    return `${attr}="${target}${fragment}"`;
  });
  fs.writeFileSync(path.join(output, name), text, 'utf8');
}
if (unhandled.length) throw new Error(JSON.stringify(unhandled, null, 2));
// The entry page is the searchable file index; everything lives beside it.
const index = fs.readFileSync(path.join(output, 'File-Index.html'), 'utf8');
const note = '<p><strong>One-folder edition:</strong> All explanations and PDFs are stored in this folder. Share the entire ZIP and extract it before opening START-HERE.html. The source paths shown below are labels, not links to your project.</p>';
const entry = index.replace('<h1>SFA + DMS File Index</h1>', '<h1>SFA + DMS File Index</h1>' + note);
fs.writeFileSync(path.join(output, 'START-HERE.html'), entry, 'utf8');
fs.writeFileSync(path.join(output, 'index.html'), entry, 'utf8');
let checked = 0;
const failures = [];
const ids = new Map();
for (const file of fs.readdirSync(output).filter(file => file.endsWith('.html'))) {
  const text = fs.readFileSync(path.join(output, file), 'utf8');
  ids.set(file, new Set([...text.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])));
}
for (const [file] of ids) {
  const text = fs.readFileSync(path.join(output, file), 'utf8');
  for (const match of text.matchAll(/\b(?:href|src)="([^"]*)"/g)) {
    const url = match[1];
    if (/^(https?:|mailto:|data:)/.test(url)) continue;
    const [target, fragment] = url.split('#');
    const name = target || file;
    if (name.includes('/') || name.includes('\\') || !fs.existsSync(path.join(output, name))) failures.push({ file, url });
    if (fragment && ids.has(name) && !ids.get(name).has(fragment)) failures.push({ file, url, reason: 'Missing anchor' });
    checked++;
  }
}
if (failures.length) throw new Error(JSON.stringify(failures, null, 2));
console.log(JSON.stringify({ output, packagedFiles: fs.readdirSync(output).length, localLinksVerified: checked, outsideFolderLinks: 0 }, null, 2));
