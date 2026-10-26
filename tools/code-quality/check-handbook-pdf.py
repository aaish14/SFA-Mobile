"""Verify PDF coverage/navigation and render representative final pages."""
import json
import subprocess
from pathlib import Path
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/pdf'
TMP=ROOT/'tmp/pdfs/handbook'
manifest=json.loads((ROOT/'docs/sfa-dms-code-handbook/coverage.json').read_text(encoding='utf8'))
complete=PdfReader(OUT/'SFA-DMS-Complete-Code-Explanation.pdf')
manager=PdfReader(OUT/'SFA-DMS-Manager-Explanation.pdf')
bookmarks=[]
def walk(items):
    for item in items:
        if isinstance(item,list): walk(item)
        else: bookmarks.append((item.title,complete.get_destination_page_number(item)+1))
walk(complete.outline)
titles={title for title,page in bookmarks}
assert all(entry['file'] in titles for entry in manifest['files'])
assert len(manager.pages)==15
assert len(complete.pages)>len(manager.pages)
assert all(1<=page<=len(complete.pages) for title,page in bookmarks)
targets=[(1,'cover'),(3,'architecture'),(8,'primary'),(15,'verification')]
for suffix in ['classes/DmsPortalApi.cls','classes/DmsPrimarySchemes.cls','triggers/PjpApproverTrigger.trigger','src/DmsApp.tsx','screens/VisitScreen.tsx','fields/Discontinued__c.field-meta.xml','dms-mobile/Start-DmsLocal.ps1']:
    matches=[(title,page) for title,page in bookmarks if title.endswith(suffix)]
    if matches:
        title,page=matches[0]
        targets.append((page,Path(title).name.replace('.','-')))
targets.append((len(complete.pages),'last-page'))
poppler=Path('C:/Users/aishw/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe')
for page,label in targets:
    text=complete.pages[page-1].extract_text()
    assert len(text)>50, ('Empty page',page)
    subprocess.run([str(poppler),'-f',str(page),'-l',str(page),'-scale-to','1500','-singlefile','-png',str(OUT/'SFA-DMS-Complete-Code-Explanation.pdf'),str(TMP/('qa-'+label))],check=True)
report={'result':'PASS','managerPages':len(manager.pages),'completePages':len(complete.pages),'fileBookmarksVerified':len(manifest['files']),'bookmarks':len(bookmarks),'renderedSamples':targets}
(TMP/'pdf-qa-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2))
