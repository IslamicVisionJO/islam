"""Import genuine attachments with Arabic coordinate transcription and audit excerpts."""
import fitz,glob,json,re,zipfile,pathlib,hashlib,sys
from pdf_coordinates import extract
text_by_image={}
root=pathlib.Path(__file__).resolve().parents[1]; source=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/workspace/attachments')
out=root/'public/content';out.mkdir(parents=True,exist_ok=True)
units=json.loads((root/'data/lessons.json').read_text()); lessons=[dict(l) for u in units for l in u['lessons']]
lessons[13]['startPage']=92
for i,l in enumerate(lessons):
 l.update(endPage=[13, 20, 27, 33, 40, 46, 54, 60, 66, 72, 78, 84, 90, 99, 106, 113, 118, 124, 132, 138, 144, 151, 158, 165, 171, 178][i],cards=[],activities=[],assessment=[],video='videos/'+l['id']+'.mp4')
for p in source.glob('*/*.zip'):
 unit=int(re.search(r'Unit_(\d)',p.name)[1]);z=zipfile.ZipFile(p)
 for n in z.namelist():
  if not n.lower().endswith('.mp4'):continue
  num=int(re.match(r'(\d+)',pathlib.PurePosixPath(n).name)[1]);l=next(l for l in lessons if l['id']==f'u{unit:02}_l{num:02}')
  target=root/'public'/l['video'];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(n));l['originalVideo']=n;l['videoSha256']=hashlib.sha256(target.read_bytes()).hexdigest()
def lines(page):
 groups={}
 for b in page.get_text('dict')['blocks']:
  for ln in b.get('lines',[]):
   for s in ln['spans']:
    y=round(s['origin'][1],0);groups.setdefault(y,[]).append(s)
 return [(y,' '.join(s['text'] for s in sorted(ss,key=lambda s:-s['bbox'][2])),min(s['bbox'][1] for s in ss)) for y,ss in sorted(groups.items()) if 48<y<795]
def crop(doc,pi,y1,y2,name):
 if y2-y1<2:return None
 f=name+'.png';text_by_image['content/'+f]=extract(doc[pi],fitz.Rect(48,y1,doc[pi].rect.width-48,y2));doc[pi].get_pixmap(matrix=fitz.Matrix(2,2),clip=fitz.Rect(48,y1,doc[pi].rect.width-48,y2)).save(out/f);return 'content/'+f
for kind,prefix in [('cards','مكثف'),('solutions','حلول')]:
 doc=fitz.open(next(source.glob('*/'+prefix+'*.pdf')))
 active=None;category='activities';pending=None;entries=[]
 def finish(pi,y):
  global pending
  if not pending:return
  rec,sp,sy,answer=pending
  rec['questionImages']=[];rec['answerImages']=[]
  for page in range(sp,pi+1):
   lo=sy if page==sp else 48;hi=y if page==pi else 794
   ay=answer[1] if answer and page==answer[0] else (lo if answer and page>answer[0] else hi)
   for field,a,b in [('questionImages',lo,min(hi,ay)),('answerImages',max(lo,ay),hi)]:
    f=crop(doc,page,a,b,rec['id']+'-'+field+str(page));
    if f:rec[field].append(f)
  pending=None
 for pi in range(3,len(doc)):
  page_lines=lines(doc[pi])
  for li,(y,t,top) in enumerate(page_lines):
   h=re.search(r'الدرس\s*(\d{2})(?!\d)',t)
   if h and ('|' in t or 'سورة' in t or t.strip().startswith('الدرس')):
    finish(pi,top-2);idx=int(h[1])-1
    if 0<=idx<26:active=lessons[idx];category='activities'
    continue
   if not active:continue
   if 'ثان' in t and ('التقويم' in t or 'المراجعة' in t):finish(pi,top-2);category='assessment';continue
   if ('أول' in t and 'أنشطة' in t) or (t.strip().startswith('الوحدة') and kind=='cards'):finish(pi,top-2);continue
   m=re.match(r'^\s*س\s*(\d{2})\b',t) if kind=='cards' else re.match(r'^\s*(?:نشاط\s*(\d{2})|([1-9]\d?)(?!\d))',t)
   if m and kind=='solutions' and category=='activities' and not t.strip().startswith('نشاط'):m=None
   if m and kind=='solutions' and not t.strip().startswith('نشاط'):
    following=page_lines[li+1:]
    answer_next=False
    for yy,tt,tp in following:
     if 'الإجابة' in tt:answer_next=True;break
     if re.match(r'^\s*\d',tt):break
    if not answer_next:m=None
   if m:
    finish(pi,top-1);cat=kind if kind=='cards' else category
    rec={'id':active['id']+'-'+cat+'-'+str(len(active[cat])+1),'sourcePdfPage':pi+1,'bookPages':[active['startPage'],active['endPage']],'label':t.strip()}
    active[cat].append(rec);pending=(rec,pi,top-1,None)
   elif pending and ((kind=='cards' and re.match(r'^\s*ج',t)) or (kind=='solutions' and 'الإجابة' in t)):
    rec,sp,sy,answer=pending
    if answer is None:pending=(rec,sp,sy,(pi,top-1))
  if kind=='cards' and pi==35:finish(pi,794);break
 finish(len(doc)-1,794)
for l in lessons:
 for category in ['cards','activities','assessment']:
  for rec in l[category]:
   rec['question']='\n'.join(text_by_image[p] for p in rec['questionImages'])
   rec['answer']='\n'.join(text_by_image[p] for p in rec['answerImages'])
   rec['question']=re.sub(r'^(?:س\s*\d+|نشاط\s*\d+)\s*[|.]?\s*','',rec['question']).strip()
   rec['answer']=re.sub(r'^(?:ج\s*|:?الإجابة\s*:?\s*)','',rec['answer']).strip()
   rec['answer']=re.sub(r'(?m)^الوحدة[^\n]* / الدرس \d+\s*$', '', rec['answer']).strip()
   rec['textReview']='coordinate-extracted; independent review pending'
manifest={'units':[{**u,'lessons':[l for l in lessons if l['unitId']==u['id']]} for u in units],'extraction':'Arabic coordinate transcription; original image excerpts retained for audit. Independent editorial verification pending.'}
(root/'data/learning-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print({k:sum(len(l[k]) for l in lessons) for k in ['cards','activities','assessment']})
