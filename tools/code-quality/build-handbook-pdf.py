"""Publish the existing, verified HTML handbook as bookmarked PDFs.

Uses the handbook snapshot, not live source or Salesforce. No application changes.
"""
import hashlib
import json
import re
from html import escape
from html.parser import HTMLParser
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, PageBreak,
    LongTable, TableStyle, Preformatted, KeepTogether,
)
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'docs/sfa-dms-code-handbook'
OUT = ROOT / 'output/pdf'
TMP = ROOT / 'tmp/pdfs/handbook'
OUT.mkdir(parents=True, exist_ok=True)
TMP.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('Guide', 'C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('GuideBold', 'C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFont(TTFont('Code', 'C:/Windows/Fonts/consola.ttf'))
pdfmetrics.registerFont(TTFont('GuideSymbol', 'C:/Windows/Fonts/seguisym.ttf'))
pdfmetrics.registerFontFamily('Guide', normal='Guide', bold='GuideBold', italic='Guide', boldItalic='GuideBold')
GREEN = colors.HexColor('#146b49')
INK = colors.HexColor('#193e33')
PALE = colors.HexColor('#edf5ef')
LINE = colors.HexColor('#c8dbcf')

class Node:
    def __init__(self, tag='', attrs=None):
        self.tag, self.attrs, self.children = tag, dict(attrs or []), []
    def text(self):
        return ''.join(c if isinstance(c, str) else c.text() for c in self.children)
    def all(self, tag=None):
        for child in self.children:
            if isinstance(child, Node):
                if tag is None or child.tag == tag:
                    yield child
                yield from child.all(tag)

class Parser(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.root = Node('root')
        self.stack = [self.root]
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in {'br', 'hr', 'meta', 'link', 'input', 'img'}:
            self.stack.append(node)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack = self.stack[:i]
                break
    def handle_data(self, data):
        self.stack[-1].children.append(data)

def normal(text):
    return text.replace('\u2011', '-').replace('\u2013', '-').replace('\u2014', ' - ')

def inline(node):
    if isinstance(node, str):
        return escape(normal(node))
    content = ''.join(inline(c) for c in node.children)
    if node.tag in {'strong', 'b', 'dt'}:
        return '<b>' + content + '</b>'
    if node.tag in {'em', 'i'}:
        return '<i>' + content + '</i>'
    if node.tag == 'code':
        return '<font name="Code">' + content + '</font>'
    if node.tag == 'br':
        return '<br/>'
    if node.tag == 'a' and node.attrs.get('href', '').startswith('https://'):
        return '<link href="' + escape(node.attrs['href'], quote=True) + '" color="#146b49">' + content + '</link>'
    return content

styles = {
    'body': ParagraphStyle('body', fontName='Guide', fontSize=10.3, leading=15, textColor=INK, spaceAfter=9),
    'h1': ParagraphStyle('h1', fontName='GuideBold', fontSize=28, leading=34, textColor=INK, spaceAfter=22),
    'h2': ParagraphStyle('h2', fontName='GuideBold', fontSize=19, leading=24, textColor=GREEN, spaceAfter=15, keepWithNext=True),
    'h3': ParagraphStyle('h3', fontName='GuideBold', fontSize=12, leading=16, textColor=INK, spaceAfter=8, keepWithNext=True),
    'small': ParagraphStyle('small', fontName='Guide', fontSize=8.5, leading=12, textColor=INK, spaceAfter=7),
    'cell': ParagraphStyle('cell', fontName='Guide', fontSize=9, leading=12.5, textColor=INK),
    'code': ParagraphStyle('code', fontName='Code', fontSize=7.8, leading=10.5, textColor=INK, wordWrap='CJK'),
    'note': ParagraphStyle('note', fontName='Guide', fontSize=8.4, leading=11.5, textColor=INK),
    'file': ParagraphStyle('file', fontName='GuideBold', fontSize=14, leading=18, textColor=GREEN, wordWrap='CJK', spaceAfter=10),
}

def para(text, style='body'):
    primary = pdfmetrics.getFont(styles[style].fontName).face.charToGlyph
    fallback = pdfmetrics.getFont('GuideSymbol').face.charToGlyph
    text = ''.join(
        '<font name="GuideSymbol">'+char+'</font>'
        if ord(char)>31 and ord(char) not in primary and ord(char) in fallback
        else char for char in text
    )
    return Paragraph(text, styles[style])

def bookmark(title, key, level=0, style='h2'):
    item = para(escape(normal(title)), style)
    item.outline = (title, key, level)
    return item

class Document(BaseDocTemplate):
    def __init__(self, filename, title, pagesize=A4):
        super().__init__(str(filename), pagesize=pagesize, leftMargin=40, rightMargin=40,
                         topMargin=48, bottomMargin=42, title=title, author='SFA / DMS project documentation')
        self.section = ''
        self.addPageTemplates(PageTemplate(id='main', frames=[Frame(40, 42, pagesize[0]-80, pagesize[1]-90,
            leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=self.decorate))
    def decorate(self, canvas, doc):
        width, height = doc.pagesize
        canvas.saveState()
        canvas.setStrokeColor(LINE)
        canvas.line(40, height-32, width-40, height-32)
        canvas.line(40, 30, width-40, 30)
        canvas.setFont('Guide', 8)
        canvas.setFillColor(GREEN)
        canvas.drawString(40, height-23, 'SFA MOBILE + DMS | CODE & BUSINESS LOGIC')
        canvas.drawRightString(width-40, height-23, '26 OCTOBER 2026 | INTERNAL')
        canvas.setFillColor(INK)
        canvas.drawString(40, 18, 'Source snapshot: 26 Oct 2026. Verification scope and limitations are documented.')
        canvas.drawRightString(width-40, 18, ('Reference page ' if width>height else 'Manager page ') + str(doc.page))
        canvas.restoreState()
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'outline'):
            title, key, level = flowable.outline
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(normal(title), key, level, closed=level > 0)

def blocks(node, width):
    result = []
    for child in node.children:
        if isinstance(child, str):
            if child.strip(): result.append(para(escape(normal(child.strip()))))
            continue
        tag = child.tag
        if tag in {'p', 'dd'}:
            result.append(para(inline(child)))
        elif tag in {'h2', 'h3', 'dt'}:
            result.append(para(inline(child), 'h3'))
        elif tag in {'ul', 'ol'}:
            for index, li in enumerate(c for c in child.children if isinstance(c, Node) and c.tag=='li'):
                prefix = str(index+1)+'. ' if tag=='ol' else '- '
                result.append(para('<b>'+prefix+'</b>'+inline(li)))
        elif tag == 'pre':
            # Arrow-heavy flow diagrams are re-typeset using a Unicode font.
            result.append(para(escape(normal(child.text())).replace('\n', '<br/>').replace('  ', '&nbsp;&nbsp;'), 'small'))
            result.append(Spacer(1,8))
        elif tag == 'table':
            rows = []
            for tr in child.all('tr'):
                cells = [c for c in tr.children if isinstance(c,Node) and c.tag in {'td','th'}]
                rows.append([para(('<b>'+inline(c)+'</b>') if c.tag=='th' else inline(c), 'cell') for c in cells])
            if rows:
                sizes = [width*0.31,width*0.69] if len(rows[0])==2 else [width/len(rows[0])]*len(rows[0])
                table=LongTable(rows,colWidths=sizes,repeatRows=1,hAlign='LEFT',splitInRow=1)
                table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),PALE),('GRID',(0,0),(-1,-1),.4,LINE),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
                result += [table, Spacer(1,12)]
        elif tag not in {'script','style','button'}:
            result.extend(blocks(child,width))
    return result

manifest = json.loads((SOURCE/'coverage.json').read_text(encoding='utf8'))
manager_root = Parser((SOURCE/'Manager-Explanation.html').read_text(encoding='utf8')).root
sections = [s for s in manager_root.all('section') if s.attrs.get('id','').startswith('chapter-') or s.attrs.get('id')=='verification']
manager_path = OUT/'SFA-DMS-Manager-Explanation.pdf'
complete_path = OUT/'SFA-DMS-Complete-Code-Explanation.pdf'
story = [Spacer(1,62), para('SFA Mobile &amp; DMS', 'h1'), para('Manager walkthrough<br/>Process, business logic and code architecture', 'h2'),
    para('Prepared from your local project handbook. Covers the employee app, distributor portal, backend, Salesforce classes, triggers and their relationships.'),
    Spacer(1,18), para('<b>Start with this document for your demonstration.</b> The complete companion PDF includes every numbered code explanation from the handbook: '+str(manifest['totalFiles'])+' files and '+format(manifest['totalLines'],',')+' source lines.'),
    para('This is documentation of the 26 October 2026 snapshot, not a new deployment or a guarantee that every runtime path is tested. The verification chapter distinguishes checks that passed from remaining limitations.'),
    Spacer(1,20),para('Internal project documentation. Do not publish source/configuration publicly.', 'small'),PageBreak(),bookmark('Reading map','reading-map')]
for index, section in enumerate(sections):
    title = next(section.all('h2')).text()
    story.append(para('<link href="#chapter-'+str(index)+'" color="#146b49">'+str(index+1)+'. '+escape(title)+'</link>'))
story += [Spacer(1,14),para('Use the PDF bookmarks panel to jump directly to a topic. For a manager meeting, explain the process first; open the complete reference only when asked about a particular file or statement.')]
for index, section in enumerate(sections):
    title = next(section.all('h2')).text()
    story += [PageBreak(),bookmark(title,'chapter-'+str(index))]
    section.children = [c for c in section.children if not(isinstance(c,Node) and c.tag=='h2')]
    story.extend(blocks(section,A4[0]-80))
Document(manager_path,'SFA and DMS - Manager explanation').build(story)
print('Manager PDF written', flush=True)

code_path = TMP/'code-appendix.pdf'
width = landscape(A4)[0]-80
story = [bookmark('Complete numbered code reference','code-reference'),
    para('All included first-party source and metadata from the existing handbook. Use the bookmarks panel to select an area and file. Each source row retains its original local line number. Long code lines wrap inside the source column; wrapping does not create a new source line.'),
    para('<b>How to read:</b> Code is on the left; the reading note is on the right. Multi-line statements must be read together. Generated line notes explain syntax/local operations; the preceding manager chapters explain business intent. They are not a separate manual correctness proof for every line.'),
    para('Excluded from the original snapshot: credentials, installed dependencies, compiled output/APKs, binaries, old backups and generated data exports. These PDFs do not change or deploy any application code.'),
    para('Source coverage: '+str(manifest['totalFiles'])+' files / '+format(manifest['totalLines'],',')+' lines. The appended pages use landscape orientation for code readability.'),PageBreak()]
areas = ['Apex classes & tests','Apex triggers','Lightning components','Shared backend','SFA mobile','DMS portal & mobile','Salesforce metadata','Configuration & operations']
processed = 0
for area_index, area in enumerate(areas):
    if area_index: story.append(PageBreak())
    story.append(bookmark(area,'area-'+str(area_index),0))
    entries = [e for e in manifest['files'] if e['category']==area]
    story.append(para(str(len(entries))+' files. Expand this area in the PDF bookmarks to jump to an individual file.'))
    for entry_index, entry in enumerate(entries):
        story.append(PageBreak())
        key = 'source-'+str(processed)
        story += [bookmark(entry['file'],key,1,'file'),para(escape(normal(entry['description'])),'small'),
                  para(str(entry['lines'])+' numbered source lines | SHA-256 '+entry['sha256'],'small')]
        parsed = Parser((SOURCE/entry['page']).read_text(encoding='utf8')).root
        source_table = next(n for n in parsed.all('table') if 'source' in n.attrs.get('class','').split())
        body = next(source_table.all('tbody'))
        rows = [[para('<b>Line</b>','note'),para('<b>Source code</b>','note'),para('<b>Explanation / reading note</b>','note')]]
        count = 0
        for tr in body.all('tr'):
            cells = [c for c in tr.children if isinstance(c,Node) and c.tag=='td']
            if len(cells)!=3: raise ValueError('Unexpected source row: '+entry['file'])
            number, code, explanation = [c.text() for c in cells]
            if int(number)!=count+1: raise ValueError('Unexpected line numbering: '+entry['file'])
            # Paragraph uses real Unicode fonts. Preserve indentation without forcing wide unbreakable spans.
            indent = len(code)-len(code.lstrip(' '))
            source_html = '&nbsp;'*indent + escape(code[indent:] or ' ')
            rows.append([para(escape(number),'note'),para(source_html,'code'),para(escape(normal(explanation)),'note')])
            count += 1
        if count != entry['lines']: raise ValueError('Coverage mismatch: '+entry['file'])
        table = LongTable(rows,colWidths=[32,(width-32)*.51,(width-32)*.49],repeatRows=1,hAlign='LEFT',splitInRow=1)
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),PALE),('GRID',(0,0),(-1,-1),.25,LINE),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
        story.append(table)
        processed += 1
    print('Prepared '+area+': '+str(len(entries))+' files',flush=True)
Document(code_path,'SFA and DMS - Complete numbered source reference',landscape(A4)).build(story)
print('Source appendix rendered; merging PDFs',flush=True)
writer = PdfWriter()
writer.append(str(manager_path),outline_item='Part 1 - Manager explanation',import_outline=True)
writer.append(str(code_path),outline_item='Part 2 - Complete code reference',import_outline=True)
writer.add_metadata({'/Title':'SFA Mobile and DMS - Complete Code Explanation','/Author':'SFA / DMS project documentation','/Subject':'Manager walkthrough and complete numbered source reference - 26 October 2026'})
writer.page_mode='/UseOutlines'
with complete_path.open('wb') as stream: writer.write(stream)
report={'manager':{'path':str(manager_path),'pages':len(PdfReader(manager_path).pages)},
        'complete':{'path':str(complete_path),'pages':len(PdfReader(complete_path).pages)},
        'sourceFiles':processed,'sourceLines':manifest['totalLines']}
(TMP/'pdf-build-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2),flush=True)
