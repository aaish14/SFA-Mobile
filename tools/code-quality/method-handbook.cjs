// Read source structure for documentation; never evaluate application code.
const path = require('node:path');
const ts = require('../../sales-rep-mobile/backend/node_modules/typescript');
const apexNotes = require('./method-descriptions.cjs');
const clientNotes = require('./client-method-descriptions.cjs');
const { methodNotes } = require('./guide-updates-20261028.cjs');
const compact = text => String(text).replace(/\s+/g, ' ').trim();
const limit = (text, size=220) => compact(text).slice(0,size);
const unique = values => [...new Set(values)];

function purpose(file, name, comment, kind) {
  const base = path.basename(file), stem = base.replace(/\.[^.]+$/, '');
  const suffix = Object.keys(clientNotes).find(key => file.endsWith(key));
  return methodNotes[base]?.[name] || (suffix && clientNotes[suffix][name])
    || apexNotes[stem]?.[name] || comment
    || (kind === 'Route/registration'
      ? 'Register this HTTP path and its handler/middleware. Read the branch and call notes below for its response and persistence logic.'
      : 'Implementation of '+name+'. The signature, branch conditions, calls and return paths below are extracted from this method; follow its numbered source for the complete behavior.');
}

function precedingComment(source, start) {
  const tail = source.slice(Math.max(0,start-2200),start);
  const comment = tail.match(/\/\*\*([\s\S]*?)\*\/\s*$/)?.[1];
  return comment ? compact(comment.replace(/^\s*\* ?/gm,'')).slice(0,1500) : '';
}

function analyze(file, source) {
  const symbols=[], methods=[];
  const lineAt = pos => source.slice(0,pos).split('\n').length;
  function add(name, start, end, kind, signature, parameters, body, details={}) {
    const symbol={name,line:lineAt(start),endLine:lineAt(Math.max(start,end-1)),kind};
    symbols.push(symbol);
    if (!body) return;
    methods.push({...symbol, signature:compact(signature),parameters,
      purpose:purpose(file,name,precedingComment(source,start),kind),
      calls:[],guards:[],returns:[],steps:[],...details});
  }
  if (/\.(tsx?|[cm]?js)$/.test(file)) {
    const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    const seen=new Set();
    function register(name,node,fn,kind) {
      if(seen.has(fn))return; seen.add(fn);
      const calls=[],guards=[],returns=[];
      function inspect(child) {
        // Nested functions receive their own card; don't attribute their effects to an outer helper.
        if(child!==fn && (ts.isFunctionDeclaration(child)||ts.isArrowFunction(child)||ts.isFunctionExpression(child)||ts.isMethodDeclaration(child)))return;
        if(ts.isCallExpression(child))calls.push(child.expression.getText(tree));
        if(ts.isIfStatement(child))guards.push(limit(child.expression.getText(tree)));
        if(ts.isReturnStatement(child))returns.push(child.expression ? limit(child.expression.getText(tree)) : '(no value; early exit)');
        if(ts.isThrowStatement(child))guards.push('throws: '+limit(child.expression.getText(tree)));
        ts.forEachChild(child,inspect);
      }
      inspect(fn);
      const body=fn.body;
      if(body&&!ts.isBlock(body))returns.push(limit(body.getText(tree)));
      const statements=body&&ts.isBlock(body)?[...body.statements]:[];
      const steps=statements.slice(0,16).map(statement=>{
        if(ts.isIfStatement(statement))return 'Branch on '+limit(statement.expression.getText(tree))+'.';
        if(ts.isTryStatement(statement))return 'Run the try block; its catch/finally blocks handle failure or cleanup where present.';
        if(ts.isReturnStatement(statement))return 'Return '+(statement.expression?limit(statement.expression.getText(tree)):'without a value')+'.';
        if(ts.isForOfStatement(statement)||ts.isForInStatement(statement))return 'Iterate '+limit(statement.initializer.getText(tree))+' over '+limit(statement.expression.getText(tree))+'.';
        if(ts.isForStatement(statement)||ts.isWhileStatement(statement))return 'Repeat the loop according to '+limit(statement.getText(tree).split('{')[0])+'.';
        return limit(statement.getText(tree));
      });
      const signature=source.slice(node.getStart(tree),body?body.getStart(tree):node.end);
      add(name,node.getStart(tree),fn.end,kind,signature,(fn.parameters||[]).map(p=>compact(p.getText(tree))),body,
        {calls:unique(calls),guards:unique(guards),returns:unique(returns),steps,moreSteps:statements.length>16});
    }
    function visit(node) {
      if((ts.isFunctionDeclaration(node)||ts.isMethodDeclaration(node)||ts.isGetAccessorDeclaration(node)||ts.isSetAccessorDeclaration(node))&&node.name)
        register(node.name.getText(tree),node,node,ts.SyntaxKind[node.kind]);
      if(ts.isVariableDeclaration(node)&&node.initializer) {
        let fn=node.initializer;
        if(ts.isCallExpression(fn)&&/^(useCallback|React\.useCallback)$/.test(fn.expression.getText(tree)))fn=fn.arguments[0];
        if(fn&&(ts.isArrowFunction(fn)||ts.isFunctionExpression(fn)))register(node.name.getText(tree),node,fn,'Function');
      }
      if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&/^(get|post|put|patch|delete|use)$/.test(node.expression.name.text)&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])) {
        const fn=[...node.arguments].reverse().find(a=>ts.isArrowFunction(a)||ts.isFunctionExpression(a));
        if(fn)register(node.expression.getText(tree)+' '+node.arguments[0].text,node,fn,'Route/registration');
      }
      if((ts.isClassDeclaration(node)||ts.isInterfaceDeclaration(node)||ts.isTypeAliasDeclaration(node))&&node.name)
        add(node.name.getText(tree),node.getStart(tree),node.end,ts.SyntaxKind[node.kind],'',[],null);
      ts.forEachChild(node,visit);
    }
    visit(tree);
  } else if (/\.(cls|trigger|apex|ps1)$/.test(file)) {
    // Mask comments/strings while preserving positions, then match balanced braces.
    const uncommented=file.endsWith('.ps1')?source.replace(/#[^\n]*/g,text=>' '.repeat(text.length)):source;
    const masked=uncommented.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,
      text=>text.replace(/[^\n]/g,' '));
    const pattern=file.endsWith('.ps1')?/^[ \t]*function\s+([\w-]+)\s*(?:\([^)]*\))?\s*\{/gm
      :/^[ \t]*(?:@[\w.]+(?:\([^\n]*?\))?\s*)*(?:(?:public|private|global|protected|static|virtual|override|abstract|testMethod|webservice)\s+)+(?:(?:[\w.]+(?:<[^;{}]+?>)?(?:\[\])?)\s+)?(\w+)\s*\([^;{}]*\)\s*\{/gm;
    for(const match of masked.matchAll(pattern)) {
      const start=match.index, opening=start+match[0].lastIndexOf('{');
      let depth=1,end=opening+1;
      while(end<masked.length&&depth){if(masked[end]==='{')depth++;else if(masked[end]==='}')depth--;end++;}
      const signature=source.slice(start,opening).trim(),body=source.slice(opening,end);
      const calls=unique([...body.matchAll(/\b([A-Za-z_$][\w$]*(?:\.[\w$]+)+)\s*\(/g)].map(m=>m[1]));
      const guards=[...body.matchAll(/\bif\s*\(([^\n]+)|\bthrow\s+([^;\n]+)/g)].map(m=>limit(m[1]||'throws: '+m[2]));
      const returns=unique([...body.matchAll(/\breturn\s*([^;\n]*)[;\n]/g)].map(m=>limit(m[1])||'(no value)'));
      const params=signature.match(/\(([\s\S]*)\)/)?.[1]
        || (file.endsWith('.ps1') ? body.match(/\bparam\s*\(([\s\S]*?)\n\s*\)/i)?.[1] : undefined);
      const steps=[];
      if(/\bSELECT\b/i.test(body))steps.push('Reads Salesforce records with the SOQL queries shown in the numbered source. Inspect WHERE filters and FOR UPDATE locks.');
      if(/\b(insert|update|upsert|delete)\s+[A-Za-z]/.test(body))steps.push('Performs the DML statements shown in the source. The surrounding transaction and savepoint determine rollback behavior.');
      if(/FOR UPDATE/i.test(body))steps.push('Locks queried records while the transaction validates or changes their state.');
      if(/Approval\.process/.test(body))steps.push('Invokes the configured Salesforce approval workflow; an API submission is distinct from final approval.');
      add(match[1],start,end,file.endsWith('.ps1')?'PowerShell function':'Apex method',signature,params?[compact(params)]:[],body,{calls,guards,returns,steps});
    }
  }
  return {symbols:symbols.sort((a,b)=>a.line-b.line),methods:methods.sort((a,b)=>a.line-b.line)};
}

function renderMethods(methods,escape) {
  if(!methods.length)return '';
  const list=(values,empty)=>values.length?'<ul>'+values.slice(0,14).map(value=>'<li><code>'+escape(value)+'</code></li>').join('')+'</ul>'+(values.length>14?'<p>Additional items remain in the full source.</p>':''):'<p>'+empty+'</p>';
  return '<section class="method-section"><h2>Methods, inputs and logic</h2><p>Purpose notes are curated or taken from source comments. Conditions, calls and return expressions are extracted from the displayed method; a listed call may run only on one branch.</p>'+methods.map((m,i)=>
    '<details class="method-card" id="method-'+i+'"><summary>'+escape(m.name)+' · L'+m.line+'–'+m.endLine+'</summary><p><strong>Purpose:</strong> '+escape(m.purpose)+'</p><pre>'+escape(m.signature)+'</pre><p><strong>Inputs:</strong> '+(m.parameters.length?m.parameters.map(p=>'<code>'+escape(p)+'</code>').join('; '):'No explicit parameters in this declaration; state, closures or instance fields may still supply inputs.')+'</p>'+
    (m.steps.length?'<h3>Read the execution in this order</h3><ol>'+m.steps.map(step=>'<li>'+escape(step)+'</li>').join('')+'</ol>'+(m.moreSteps?'<p>Continue in the numbered source for the remaining statements.</p>':''):'')+
    '<h3>Branch and validation expressions</h3>'+list(m.guards,'No explicit if/throw expression was extracted from this method. Validation may be delegated to another call.')+
    '<h3>Calls to trace</h3>'+list(m.calls,'No method calls were extracted from this declaration.')+
    '<h3>Return paths</h3>'+list(m.returns,'No explicit return value was extracted; the method may work through side effects or callbacks.')+
    '<a href="#L'+m.line+'">Read the complete method in the numbered source</a></details>').join('')+'</section>';
}
module.exports={analyze,renderMethods};
