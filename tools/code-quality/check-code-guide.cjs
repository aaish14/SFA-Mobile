const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'docs/sfa-dms-code-handbook');
const manifest = JSON.parse(fs.readFileSync(path.join(output, 'coverage.json'), 'utf8'));
let checkedLines = 0, checkedLinks = 0;
function unescape(text) {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
for (const entry of manifest.files) {
  const source = fs.readFileSync(path.join(root, entry.file));
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), entry.sha256, 'Source changed: ' + entry.file);
  const html = fs.readFileSync(path.join(output, entry.page), 'utf8');
  const lines = source.toString('utf8').replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const rows = [...html.matchAll(/<tr id="L(\d+)"><td>.*?<\/td><td><code>([\s\S]*?)<\/code><\/td><td>([\s\S]*?)<\/td><\/tr>/g)];
  assert.equal(rows.length, lines.length, 'Missing line notes: ' + entry.file);
  rows.forEach((row, i) => {
    assert.equal(Number(row[1]), i + 1);
    assert.equal(unescape(row[2]), lines[i] || ' ', entry.file + ':' + (i+1));
    assert.ok(row[3].length > 0);
  });
  checkedLines += rows.length;
  for (const symbol of entry.symbols) assert.ok(symbol.line > 0 && symbol.line <= lines.length);
}
const pages = ['index.html','Manager-Explanation.html', ...manifest.files.map(file => file.page)];
for (const relative of pages) {
  const full = path.join(output, relative);
  const html = fs.readFileSync(full, 'utf8');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.endsWith('</html>'));
  for (const match of html.matchAll(/href="([^"#]+)(?:#[^"]*)?"/g)) {
    const target = unescape(match[1].split('#')[0]);
    if (/^https?:/.test(target)) continue;
    assert.ok(fs.existsSync(path.resolve(path.dirname(full), target)), 'Broken link: ' + relative + ' -> ' + target);
    checkedLinks++;
  }
  for (const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes('id="' + match[1] + '"'), 'Missing anchor: ' + relative + '#' + match[1]);
}
assert.equal(checkedLines, manifest.totalLines);
console.log(JSON.stringify({result:'PASS', files:manifest.files.length,exactSourceLines:checkedLines,localLinks:checkedLinks,scope:'Structural/source-integrity verification; not a visual browser check.'},null,2));
