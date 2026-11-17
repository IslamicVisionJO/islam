import fitz,glob,re,json,pathlib
from pdf_coordinates import extract
root=pathlib.Path(__file__).resolve().parents[1];doc=fitz.open(glob.glob('/workspace/attachments/*/مكثف*.pdf')[0]);text='\n'.join(extract(doc[i],fitz.Rect(48,48,550,794)) for i in [37,38]);keys=dict((int(n),a) for n,a in re.findall(r'(\d{2})\s*—\s*([أبجد])',extract(doc[39],fitz.Rect(48,48,550,794))))
lessons=[l for u in json.loads((root/'data/lessons.json').read_text()) for l in u['lessons']];out=[]
for m in re.finditer(r'(?m)^(\d{2})\.\s*(.*?)(?=^\d{2}\.\s*|\Z)',text,re.S|re.M):
 n=int(m[1]);parts=re.split(r'([أبجد])\)\s*',m[2]);assert len(parts)==9,(n,parts)
 out.append({'id':f'compendium-exam-{n:02}','lessonId':lessons[n-1]['id'],'question':parts[0].strip(),'options':[{'id':parts[i],'text':' '.join(parts[i+1].split())} for i in [1,3,5,7]],'answer':keys[n],'sourcePdfPage':38 if n<=13 else 39,'answerPdfPage':40})
assert len(out)==26 and len(keys)==26
(root/'data/compendium-exam.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print('Imported 26 original exam questions and answer key')
