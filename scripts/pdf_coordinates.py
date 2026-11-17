"""Reconstruct logical RTL lines from glyph coordinates, preserving equal-position ligatures."""
import re,unicodedata

def extract(page,rect):
 rows={}
 for block in page.get_text('rawdict')['blocks']:
  for line in block.get('lines',[]):
   for span in line['spans']:
    chars=span['chars'];raw=''.join(c['c'] for c in chars);skip=set();atoms={}
    for m in re.finditer('اهلل',raw):
     part=chars[m.start():m.end()];skip.update(range(m.start(),m.end()));atoms[m.start()]={**part[0],'c':'الله','origin':(max(c['origin'][0] for c in part),part[0]['origin'][1])}
    for i,c in enumerate(chars):
     if i in atoms:c=atoms[i]
     elif i in skip:continue
     x,y=c['origin'];center=(c['bbox'][1]+c['bbox'][3])/2
     if rect.x0<=x<=rect.x1 and rect.y0<=center<rect.y1:
      key=next((k for k in rows if abs(k-y)<5),round(y));rows.setdefault(key,[]).append(c)
 lines=[]
 for y,chars in sorted(rows.items()):
  text=''.join(c['c'] for c in sorted(chars,key=lambda c:-round(c['origin'][0],1)))
  text=re.sub(r'[0-9]+(?:[.,][0-9]+)*',lambda m:m[0][::-1],text)
  text=text.replace('اهلل','الله').replace('اﷲ','الله')
  # PDF lam-alif glyph order verified against the rendered source (e.g. exam p38).
  for raw,logical in [('األ','الأ'),('اإل','الإ'),('اآل','الآ')]:text=text.replace(raw,logical)
  text=re.sub(r'\s+',' ',text).strip()
  if text:lines.append(text)
 return '\n'.join(lines)
