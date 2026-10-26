"""Build navigable file indexes from the documented snapshot, not secret/live files."""
import json
from collections import defaultdict
from html import escape
from pathlib import Path
from urllib.parse import quote

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, LongTable, TableStyle, PageBreak

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs/sfa-dms-code-handbook'
OUT = ROOT / 'output/pdf'
manifest = json.loads((DOCS / 'coverage.json').read_text(encoding='utf8'))
reader = PdfReader(OUT / 'SFA-DMS-Complete-Code-Explanation.pdf')
pages = {}
def walk(items):
    for item in items:
        if isinstance(item, list):
            walk(item)
        else:
            pages[item.title] = reader.get_destination_page_number(item) + 1
walk(reader.outline)
groups = defaultdict(list)
for entry in manifest['files']:
    assert entry['file'] in pages
    assert (DOCS / entry['page']).is_file()
    groups[entry['category']].append(entry)
areas = ['SFA mobile', 'DMS portal & mobile', 'Shared backend', 'Apex classes & tests', 'Apex triggers', 'Lightning components', 'Salesforce metadata', 'Configuration & operations']
folder_map = [
    ('SFA mobile screens', 'sales-rep-mobile/mobile/src/screens'),
    ('DMS portal and mobile', 'dms-mobile/src'),
    ('Shared backend', 'sales-rep-mobile/backend/src'),
    ('Salesforce Apex classes', 'force-app/main/default/classes'),
    ('Salesforce triggers', 'force-app/main/default/triggers'),
    ('Lightning web components', 'force-app/main/default/lwc'),
    ('Salesforce objects and fields', 'force-app/main/default/objects'),
]
pdfmetrics.registerFont(TTFont('Index', 'C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('IndexBold', 'C:/Windows/Fonts/arialbd.ttf'))
style = ParagraphStyle('body', fontName='Index', fontSize=8.5, leading=12, textColor=colors.HexColor('#183e30'), wordWrap='CJK')
heading = ParagraphStyle('heading', parent=style, fontName='IndexBold', fontSize=18, leading=23, spaceAfter=14)
small = ParagraphStyle('small', parent=style, fontSize=8, leading=11)
def p(text, s=style):
    return Paragraph(escape(text), s)
def table(rows, widths):
    result = LongTable(rows, colWidths=widths, repeatRows=1)
    result.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e6f3eb')),('GRID',(0,0),(-1,-1),.3,colors.HexColor('#bdd4c6')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
    return result
story = [p('SFA + DMS | File index', heading), p('Find the source folder, code explanation and complete-handbook PDF page for every documented file.'), Spacer(1,14), p('How to use', heading), p('Search this PDF with Ctrl+F for a file name, product feature or folder. The last column gives the PDF viewer page number in the 3,003-page complete code explanation, not the printed Reference page number. Use the HTML File Index for clickable explanation links and live search.'), Spacer(1,12), p('Snapshot: 26 October 2026 | 1,048 documented files. Dependencies, credentials, compiled outputs and backups are excluded.'), Spacer(1,18), p('Main source folders', heading), table([[p('Area'),p('Project-relative folder')]]+[[p(a),p(b)] for a,b in folder_map],[160,355]), Spacer(1,15), p('Project root: '+str(ROOT)), Spacer(1,10), p('These indexes document existing code; opening them does not execute scripts or change Salesforce.')]
html_sections = []
for i, area in enumerate(areas):
    entries = sorted(groups[area], key=lambda e:e['file'].lower())
    story.extend([PageBreak(), p(area, heading), p(str(len(entries))+' files. Paths are relative to the SFA-Mobile project root.'), Spacer(1,12)])
    rows = [[p('File / source folder'),p('Lines'),p('PDF page')]]
    items = []
    for e in entries:
        name = e['file']
        rows.append([p(name,small),p(str(e['lines'])),p(str(pages[name]))])
        items.append('<article class="entry"><h3><a href="'+escape(e['page'],quote=True)+'">'+escape(Path(name).name)+'</a></h3><code>'+escape(name)+'</code><p>'+escape(e['description'])+'</p><span>'+str(e['lines'])+' lines · Complete PDF page '+str(pages[name])+'</span> <a href="../../output/pdf/SFA-DMS-Complete-Code-Explanation.pdf#page='+str(pages[name])+'">Open PDF page</a></article>')
    story.append(table(rows,[405,45,65]))
    html_sections.append('<section data-area="'+escape(area,quote=True)+'"><h2 id="area'+str(i)+'">'+escape(area)+' ('+str(len(entries))+')</h2>'+''.join(items)+'</section>')
def footer(canvas, doc):
    canvas.setFont('Index',8)
    canvas.setFillColor(colors.HexColor('#48685a'))
    canvas.drawString(40,23,'SFA + DMS | File index | 26 October 2026')
    canvas.drawRightString(A4[0]-40,23,'Index page '+str(doc.page))
target = OUT / 'SFA-DMS-File-Index.pdf'
SimpleDocTemplate(str(target),pagesize=A4,rightMargin=40,leftMargin=40,topMargin=36,bottomMargin=40,title='SFA and DMS - File Index',author='SFA / DMS project documentation').build(story,onFirstPage=footer,onLaterPages=footer)
html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SFA + DMS File Index</title><style>
*{box-sizing:border-box}body{margin:0;background:#f3f8f5;color:#173e30;font:16px/1.5 Arial,sans-serif}header,main{max-width:1200px;margin:auto;padding:24px}header{background:white}h1{margin:0}nav{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}a{color:#087348}input,select{padding:12px;font:inherit;border:1px solid #9bb9a9;border-radius:7px}input{width:min(600px,100%)}.entry{background:white;border:1px solid #d3e3d9;border-radius:9px;margin:12px 0;padding:18px}h3{margin:0 0 7px}code{overflow-wrap:anywhere;font-size:13px}span{font-size:14px;color:#48685a}p{margin:8px 0}.controls{position:sticky;top:0;background:#f3f8f5;padding:15px 0;z-index:1}.folders{padding:16px;background:#e6f3eb}section[hidden],article[hidden]{display:none}</style>
<header><h1>SFA + DMS File Index</h1><p>Search by file name, folder or purpose. Click a file name to open its line-by-line explanation.</p><nav><a href="index.html">Full handbook</a><a href="Manager-Explanation.html">Manager guide</a><a href="../../output/pdf/SFA-DMS-File-Index.pdf">Download PDF index</a></nav></header><main><div class="folders"><strong>Where is the code?</strong>'''
html += ''.join('<p>'+escape(a)+': <code>'+escape(b)+'</code></p>' for a,b in folder_map)
html += '</div><nav>'+''.join('<a href="#area'+str(i)+'">'+escape(a)+'</a>' for i,a in enumerate(areas))+'</nav>'
html += '<div class="controls"><label for="search">Find a file</label><br><input id="search" type="search" placeholder="Example: DmsPortalApi, login, trigger, VisitScreen"><select id="area" aria-label="Filter area"><option value="">All areas</option>'+''.join('<option>'+escape(a)+'</option>' for a in areas)+'</select><p id="count" aria-live="polite"></p></div>'
html += ''.join(html_sections)+'''<script>
const search=document.getElementById('search'),area=document.getElementById('area');
function filter(){const query=search.value.trim().toLowerCase();let total=0;document.querySelectorAll('section[data-area]').forEach(section=>{let shown=0;section.querySelectorAll('.entry').forEach(entry=>{const match=(!area.value||section.dataset.area===area.value)&&entry.textContent.toLowerCase().includes(query);entry.hidden=!match;if(match)shown++;});section.hidden=shown===0;total+=shown;});document.getElementById('count').textContent=total+' matching files';}
search.addEventListener('input',filter);area.addEventListener('change',filter);filter();
</script></main></html>'''
(DOCS/'File-Index.html').write_text(html,encoding='utf8')
# A visible entry point in the project root avoids searching inside docs.
(ROOT/'SFA-DMS-File-Index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><title>SFA + DMS File Index</title><h1>SFA + DMS Code Handbook</h1><p><a href="docs/sfa-dms-code-handbook/File-Index.html">Open searchable file index</a></p><p><a href="output/pdf/SFA-DMS-File-Index.pdf">Open PDF file index</a></p></html>',encoding='utf8')
for file in (DOCS/'files').glob('*.html'):
    content=file.read_text(encoding='utf8')
    updated=content.replace('href="../index.html#files">Find a file','href="../File-Index.html">Find a file')
    if content!=updated:
        file.write_text(updated,encoding='utf8')
print(json.dumps({'files':sum(map(len,groups.values())),'pdfPages':len(PdfReader(target).pages),'pdf':str(target),'html':str(DOCS/'File-Index.html')},indent=2))
