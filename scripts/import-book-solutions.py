"""Extract the supplied question/answer handout using its text-layer headings."""
import collections
import hashlib
import json
from pathlib import Path
import re
import sys
import unicodedata

import fitz
from pdf_coordinates import extract

book, handout = map(Path, sys.argv[1:3])
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'data/learning-manifest.json').read_text())
lessons = {l['id']: l for u in manifest['units'] for l in u['lessons']}
header = re.compile(r'^الوحدة\s*(\d+)\s*•\s*الدرس\s*(\d+)\s*•\s*التقويم والمراجعة ص\s*(\d+(?:[–-]\d+)?)$')
number = re.compile(r'^س\s*(\d+)(?:\s*/\s*(\d+))?$')
activity_page = re.compile(r'^ص\s*(\d+)$')
types = ['أرجع وأبين', 'أبحث وأستدل', 'أبحث عن', 'أفكر وأناقش', 'أحدد', 'أبين', 'أستنتج', 'أناقش', 'أعلل', 'أستدل', 'القيم المستفادة']
entries = collections.defaultdict(list)
groups = []
lesson = None
assessment = None
current = None

# Reassemble wrapped Arabic references and Latin URLs from the same source.
repairs = {
 ('u01_l02', 'أبحث عن: مظاهر الإتقان في خلق لسان الإنسان'): 'يتكوّن اللسان من عضلات تمنحه مرونة عالية، ويضم براعم التذوق، ويساعد على النطق وتحريك الطعام والبلع. المصدر المذكور في الملف: Cleveland Clinic، my.clevelandclinic.org/health/body/22845-tongue.',
 ('u01_l03', 'وجوه الإعجاز في الآيات الثلاث'): 'أ. إعجاز بياني: التعبير بـ«تستأنسوا» يتضمن الاستئذان والأنس وإعطاء أهل البيت الأمان. ب. إعجاز غيبي: الإخبار بانتصار الروم بعد هزيمتهم. ج. إعجاز علمي: الإشارة إلى مراحل خلق الإنسان (غافر 67).',
 ('u01_l04', 'أرجع إلى قصة أصحاب السبت'): 'قصة أصحاب السبت (الأعراف 163–166): نجاة الناهين عن السوء وعقوبة المعتدين. الدرس: عدم التحايل على أحكام الله والقيام بالنصيحة بالحكمة.',
 ('u01_l05', 'أرجع وأبين: علامات الساعة في النمل والدخان'): 'خروج الدابة (النمل 82)، وظهور الدخان (الدخان 10).',
 ('u03_l01', 'أبحث وأستدل على الصدق والمراقبة والتواضع والنصح'): 'الصدق: «يا أيها الذين آمنوا اتقوا الله وكونوا مع الصادقين» (التوبة 119). مراقبة الله: «إن الله كان عليكم رقيبًا» (النساء 1). التواضع: «وعباد الرحمن الذين يمشون على الأرض هونًا» (الفرقان 63). النصح: «وأبلغكم رسالات ربي وأنا لكم ناصح أمين» (الأعراف 68).',
 ('u03_l02', 'دلالة الآية على الصلح'): 'الصلح بين الزوجين خير من الفراق إذا أمكن إصلاح الخلاف (النساء 128).',
 ('u03_l02', 'وسائل الإصلاح بين الزوجين وأثر عدم تشريع الطلاق'): 'النساء 19: المعاشرة بالمعروف والصبر على ما يكره الزوج. النساء 35: بعث حكم من أهله وحكم من أهلها للإصلاح. ولو لم يشرع الطلاق مع استحالة العشرة لاستمر النزاع والضرر.',
 ('u03_l06', 'أرجع وأبين: دلالة آية لقمان 18'): 'لقمان 18: التواضع وترك الكبر والخيلاء من مظاهر الاعتدال في الأخلاق.',
 ('u04_l02', 'الغاية من خلق الإنسان'): 'عبادة الله (الذاريات 56–57)، وعمارة الأرض (هود 61).',
 ('u04_l02', 'أثر الأمر بالمعروف وتناول الطيبات'): 'الأمر بالمعروف يحث على الالتزام بأحكام الدين والنهي عن المنكر يحمي من المعاصي والانحراف. والآية (البقرة 172) تدعو إلى تناول الطيبات التي تحفظ صحة الإنسان ونفسه.',
 ('u04_l03', 'استنتاج مخاطر الجريمة من النصوص'): 'بالترتيب: إيقاع الفتن والعداوة والبغضاء بين الناس (المائدة 91)، والإخلال بأمن المجتمع وانتشار الفساد (الروم 41)، واستحقاق غضب الله وعقابه (النساء 93).',
 ('u04_l04', 'أدلة حفظ الحقوق والمساواة'): 'الحقوق: حرمة المال (النساء 29) وحرمة النفس (الإسراء 33). المساواة: العدل بين الناس وتطبيق الأحكام دون تمييز.',
 ('u04_l04', 'أرجع وأبين: دلالة النساء 19'): 'النساء 19: إبطال إرث النساء كرهًا، والتضييق عليهن لأخذ ما أعطين من المال، والأمر بمعاشرتهن بالمعروف.',
 ('u04_l05', 'واجبات المواطنة'): 'طاعة ولي الأمر في المعروف واحترام الأنظمة (النساء 59)، والدفاع عن الوطن وبذل المال والنفس عند الحاجة وفق الضوابط (التوبة 41).',
 ('u04_l05', 'دلالة آية البر'): 'آية البر (البقرة 177) تدل على الإنفاق على ذوي القربى واليتامى والمساكين وابن السبيل والسائلين، وأداء الزكاة والوفاء بالعهد.',
 ('u04_l06', 'مفهوم حقوق الإنسان في الإسلام والإعلان العالمي'): 'أ. حقوق الإنسان في الإسلام: الحقوق التي كفلتها الشريعة للإنسان حفظًا لكرامته ومصالحه وحياته. ب. الإعلان العالمي: وثيقة أقرتها الجمعية العامة للأمم المتحدة في 10 كانون الأول 1948، وتتضمن الحقوق والحريات الأساسية للإنسان.'
}
fix_log = []
url_repairs = [
 ('lmth.1661/groi.fia-afii','iifa-aifi.org/1661.html'),
 ('lmth.1667/ra/groi.fia-afii','iifa-aifi.org/ar/1667.html'),
 ('htidah/ten.rarod','dorar.net/hadith'),
 ('sw.alemahs','shamela.ws'),
 ('yrarbil/ra/ten.bewmalsi','islamweb.net/ar/library')
]

def clean(text):
    return ''.join(c for c in unicodedata.normalize('NFC', text) if unicodedata.category(c) != 'Cf').strip().replace('اهلل', 'الله').replace('هلل', 'لله')

def flush():
    global current
    if current is None:
        return
    current['answer'] = ' '.join(current['answer']).strip()
    if current['answer']:
        before = current['answer']
        current['answer'] = repairs.get((current['lesson'], current['question']), before)
        for old, new in url_repairs:
            current['answer'] = current['answer'].replace(old, new)
        if before != current['answer']:
            fix_log.append(dict(lesson=current['lesson'], handoutPage=current['handoutPage'],
                                question=current['question'], before=before, after=current['answer']))
        if re.search(r'غير موثق|لم يراجع|لم أتحقق|لم يتم فحص|لم يتحقق|يحتاج (?:إلى )?مراجعة|تحقّق من', current['answer']):
            current['status'] = 'verify'
        if current['lesson']=='u01_l06' and current['question']=='القيم المستفادة':
            current['status'] = 'verify'
            current['note'] = 'يكرر الملف جواب نشاط الاجتهادات المعاصرة تحت عنوان القيم المستفادة. يلزم التحقق من الإجابة الخاصة بهذا النشاط.'
        entries[current['lesson']].append(current)
    elif current['question'] not in ('أختار الإجابة الصحيحة', 'اختر الإجابة الصحيحة'):
        groups.append({k: v for k, v in current.items() if k != 'answer'})
    current = None

with fitz.open(book) as original, fitz.open(handout) as pdf:
    for source_page, page in enumerate(pdf, 1):
        for raw in extract(page,page.rect).splitlines():
            line = clean(raw)
            match = header.fullmatch(line)
            if match:
                flush()
                lesson = f'u{int(match[1]):02}_l{int(match[2]):02}'
                assessment = sorted(map(int, re.split('[–-]', match[3])))
                assert lesson in lessons
                continue
            if ' — ' in line:
                label, question = line.split(' — ',1)
                n = number.fullmatch(label)
                p = activity_page.fullmatch(label)
                assert n or p, (source_page, line)
                flush()
                pages = [int(p[1])] if p else assessment
                bounds = lessons[lesson]
                assert all(bounds['startPage'] <= x <= bounds['endPage'] and 1 <= x <= len(original) for x in pages), (lesson, pages)
                category = 'التقويم والمراجعة' if n else next((t for t in types if question.startswith((t+':',t+' ')) or question==t), 'أنشطة الدرس')
                current = dict(lesson=lesson, pages=pages, handoutPage=source_page, category=category,
                               number='.'.join(x for x in [n[1], n[2]] if x) if n else '', question=question, answer=[],
                               status='suggested' if p else 'source')
                continue
            if re.search(r'\|\s*\d+$', line) or line in ('أنشطة الدرس','التقويم والمراجعة') or line.startswith('إجابات الأنشطة المفتوحة'):
                flush()
                continue
            if current and line not in ('الجواب:', ':الجواب'):
                current['answer'].append(re.sub(r'^:?الجواب[.:]*\s*', '', line).strip())
        flush()
assert set(entries) == set(lessons)
for rows in entries.values():
    rows.sort(key=lambda row: row['pages'][0])
result = dict(source=handout.name, sha256=hashlib.sha256(handout.read_bytes()).hexdigest(),
              lessons=entries, unresolved=groups, extractionRepairs=fix_log)
(root / 'data/book-solutions.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print('Lessons:', len(entries), 'answered:', sum(map(len, entries.values())), 'unresolved:',len(groups))
