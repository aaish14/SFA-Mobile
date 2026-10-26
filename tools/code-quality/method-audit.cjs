// Read-only source inventory plus generated audit reports; never rewrites application code.
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'sales-rep-mobile/node_modules/typescript'));
const areas = ['force-app/main/default/classes', 'force-app/main/default/triggers', 'force-app/main/default/lwc', 'sales-rep-mobile/backend/src', 'sales-rep-mobile/mobile/src', 'dms-mobile/src'];
function files(dir) {
  return fs.readdirSync(path.join(root, dir), {withFileTypes:true}).flatMap(entry => entry.isDirectory() ? files(`${dir}/${entry.name}`) : /\.(cls|trigger|ts|tsx|js)$/.test(entry.name) ? [`${dir}/${entry.name}`] : []);
}
function previousDoc(source, start) {
  return /\/\*\*(?:(?!\/\*\*)[\s\S])*?\*\/\s*$/.exec(source.slice(0, start))?.[0]?.trim() || '';
}
function canonicalApex(value) {
  if (Array.isArray(value)) return value.map(canonicalApex);
  if (!value || typeof value !== 'object') return value;
  // rawQuery duplicates the parsed query tree; forcedHardline is a printer layout hint.
  // The parsed query still retains identifiers, predicates, bind expressions and literals.
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['loc','location','hiddenTokenMap','comments','leadingComments','trailingComments','danglingComments','trailingEmptyLine','parent','startLine','endLine','column','line','startIndex','endIndex','prettierIgnore','printed','rawQuery','forcedHardline'].includes(key)).map(([key,item]) => [key, canonicalApex(item)]));
}
function canonicalTs(node) {
  const result = {kind:node.kind};
  // SourceFile.text is the entire input, including comments; literal text is executable data.
  if (!ts.isSourceFile(node) && typeof node.text === 'string') result.text = node.text;
  const children=[]; ts.forEachChild(node, child => {children.push(canonicalTs(child));});
  if(children.length) result.children=children;
  return result;
}
async function inspect(file, source, prettier, plugin) {
  const symbols=[];
  let canonical;
  if (/\.(cls|trigger)$/.test(file)) {
    const parsed = await prettier.__debug.parse(source, {parser:'apex',plugins:[plugin]});
    canonical=canonicalApex(parsed.ast);
    function walk(node) {
      if (!node || typeof node!=='object') return;
      if (node['@class']==='apex.jorje.data.ast.BlockMember$MethodMember') {
        const method=node.methodDecl;
        const start=node.loc.startIndex, end=node.loc.endIndex;
        symbols.push({name:method.name.value,start,end,params:method.parameters.map(p=>p.name.value),body:source.slice(start,end),doc:previousDoc(source,start)});
      }
      for (const [key,value] of Object.entries(node)) if(key!=='comments') if(Array.isArray(value)) value.forEach(walk); else if(value&&typeof value==='object') walk(value);
    }
    walk(parsed.ast);
  } else {
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:file.endsWith('.js')?ts.ScriptKind.JS:ts.ScriptKind.TS);
    if(ast.parseDiagnostics.length) throw Error(`Parse error in ${file}: ${ast.parseDiagnostics[0].messageText}`);
    canonical=canonicalTs(ast);
    function walk(node) {
      if ((ts.isFunctionDeclaration(node)||ts.isMethodDeclaration(node)||ts.isGetAccessor(node)||ts.isSetAccessor(node)||ts.isConstructorDeclaration(node))&&node.body) {
        const start=node.getStart(ast),end=node.end;
        symbols.push({name:node.name?.getText(ast)||'constructor',start,end,params:node.parameters.map(p=>p.name.getText(ast)),body:source.slice(start,end),doc:previousDoc(source,start)});
      } else if(ts.isVariableDeclaration(node)&&node.initializer) {
        let fn=node.initializer;
        if(ts.isCallExpression(fn)&&/useCallback|useMemo/.test(fn.expression.getText(ast))) fn=fn.arguments.find(a=>ts.isArrowFunction(a)||ts.isFunctionExpression(a));
        if(fn&&(ts.isArrowFunction(fn)||ts.isFunctionExpression(fn))) {
          let statement=node; while(statement.parent&&!ts.isVariableStatement(statement)&&!ts.isSourceFile(statement.parent)) statement=statement.parent;
          const start=statement.getStart(ast),end=statement.end;
          symbols.push({name:node.name.getText(ast),start,end,params:fn.parameters.map(p=>p.name.getText(ast)),body:source.slice(start,end),doc:previousDoc(source,start)});
        }
      }
      ts.forEachChild(node,walk);
    }
    walk(ast);
  }
  return {file,canonical,symbols};
}
async function main() {
  const prettier=await import(pathToFileURL(path.join(__dirname,'node_modules/prettier/index.mjs')));
  const plugin=path.join(__dirname,'node_modules/prettier-plugin-apex/dist/src/index.js');
  const list=[...areas.flatMap(files),'sales-rep-mobile/mobile/App.tsx','dms-mobile/App.tsx'];
  const result=[];
  for(const file of list) result.push(await inspect(file,fs.readFileSync(path.join(root,file),'utf8'),prettier,plugin));
  const output=path.join(root,'diagnostics/method-comments'); fs.mkdirSync(output,{recursive:true});
  if(process.argv.includes('--baseline')) {
    if(fs.existsSync(path.join(output,'baseline.json'))) throw Error('Refusing to replace the original baseline');
    fs.writeFileSync(path.join(output,'baseline.json'),JSON.stringify(result));
    const backup=path.join(root,'backups/method-comments-20261026');
    for(const file of list) {const target=path.join(backup,file); if(fs.existsSync(target)) throw Error('Refusing to overwrite backup: '+target);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
  } else {
    const baseline=JSON.parse(fs.readFileSync(path.join(output,'baseline.json'),'utf8'));
    // Compatibility with the first snapshot, which retained SourceFile.text.
    for (const row of baseline) {
      if (row.canonical.kind === ts.SyntaxKind.SourceFile) delete row.canonical.text;
      else row.canonical=canonicalApex(row.canonical);
    }
    const changed=result.filter(row=>JSON.stringify(row.canonical)!==JSON.stringify(baseline.find(old=>old.file===row.file)?.canonical)).map(row=>row.file);
    fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({checked:list.length,astChanges:changed,methods:result.reduce((n,row)=>n+row.symbols.length,0),undocumented:result.flatMap(row=>row.symbols.filter(s=>!s.doc).map(s=>`${row.file}#${s.name}`))},null,2));
    if(changed.length) {
      console.log('Executable AST differences:',changed);
      function firstDiff(a,b,key='root') {
        if(JSON.stringify(a)===JSON.stringify(b)) return null;
        if(!a||!b||typeof a!=='object'||typeof b!=='object') return {key,before:a,after:b};
        for(const name of new Set([...Object.keys(a),...Object.keys(b)])) {
          const diff=firstDiff(a[name],b[name],key+'.'+name); if(diff) return diff;
        }
      }
      for(const file of changed) console.log(JSON.stringify({file,difference:firstDiff(baseline.find(row=>row.file===file).canonical,result.find(row=>row.file===file).canonical)}));
      process.exitCode=1;
    }
    if(result.some(row=>row.symbols.some(symbol=>!symbol.doc))) process.exitCode=1;
  }
  fs.writeFileSync(path.join(output,'inventory.json'),JSON.stringify(result.map(({canonical,...row})=>row),null,2));
  console.log(JSON.stringify({files:list.length,methods:result.reduce((n,row)=>n+row.symbols.length,0),documented:result.reduce((n,row)=>n+row.symbols.filter(s=>s.doc).length,0)}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
