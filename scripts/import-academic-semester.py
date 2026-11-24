"""Import the 2026 academic first-semester handout with Poppler."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
UNITS = ['واعتصموا بحبل الله جميعًا', 'وجعلناكم شعوبًا وقبائل لتعارفوا',
         'قل جاء الحق وزهق الباطل', 'لتسكنوا إليها']
ORDINALS = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة']
# Printed pages from the table of contents of the second edition (2026).
PAGES = [6, 12, 20, 26, 31, 37, 44, 50, 55, 60, 66, 72, 77, 83, 89,
         95, 100, 105, 112, 117, 124, 130, 137, 141, 146, 152]
TITLE_REPAIRS = {
    6: 'سورة آل عمران، الآيات الكريمة (102–105)',
    12: 'الحديث الشريف: اتقاء الشبهات',
    26: 'كرامة الإنسان في الشريعة الإسلامية',
    31: 'الزواج: مشروعيته، ومقدماته',
    44: 'جهود علماء المسلمين في خدمة القرآن الكريم',
    55: 'معركة مؤتة (8 هـ)',
    77: 'سورة آل عمران، الآيات الكريمة (169–174)',
    83: 'الحديث الشريف: رضا الله تعالى',
    89: 'فتح مكة (8 هـ)',
    95: 'من خصائص الشريعة الإسلامية: الإيجابية',
    112: 'سورة الروم، الآيات الكريمة (21–24)',
    117: 'مكانة السنة النبوية الشريفة في التشريع الإسلامي',
}
SPACING_REPAIRS = {'ال خير': 'الخير', 'التفر يق': 'التفريق',
                   'الشر يع': 'الشريع', 'التشر يع': 'التشريع', 'تشر يع': 'تشريع',
                   'الشر يف': 'الشريف', 'البائث': 'الخبائث', 'اللكريم': 'الكريم',
                   'القر ية': 'القرية', 'ال خنزير': 'الخنزير', 'ر يحكم': 'ريحكم',
                   'الز ي': 'الزي', 'التار يخ': 'التاريخ', 'املسلمين': 'المسلمين',
                   'الر ياء': 'الرياء', 'الحر ية': 'الحرية', 'الإ يجابية': 'الإيجابية',
                   'الطر يق': 'الطريق', 'الل يفة': 'الخليفة', 'الليفة': 'الخليفة',
                   'الطبة': 'الخطبة', 'الاص': 'الخاص', 'اللكرامة': 'الكرامة',
                   'يحخترم': 'يحترم', 'البشر ية': 'البشرية', 'العنصر ية': 'العنصرية',
                   'الصيصة': 'الخصيصة', 'إ يجابية': 'إيجابية', 'ز يادة': 'زيادة', 'ب خير': 'بخير'}


def clean(line):
    line = ''.join(c for c in unicodedata.normalize('NFC', line) if unicodedata.category(c) != 'Cf')
    line = ' '.join(line.split()).replace('(.)3 ،2', '(2، 3)')
    for old, new in SPACING_REPAIRS.items():
        line = line.replace(old, new)
    line = re.sub(r' ([،؛.؟])(?=\s|$)', r'\1', line)
    line = re.sub(r'\s+([،؛])\s*', r'\1 ', line)
    line = re.sub(r" +: *", ": ", line)
    return re.sub(r'\bو (?=[\u0621-\u064a])', 'و', line)


def repair_row_text(text):
    # Apply after assembling the lines so PDF extraction cannot split a citation.
    for old, new in {
        'اللك': 'الك', 'للكم': 'لكم', 'ير يكم': 'يريكم', 'السماو ية': 'السماوية',
        'تفر يغ': 'تفريغ', ' .هل .الإيمان': '. هـ. الإيمان',
        'أ﴿ .': 'أ. ﴿', 'ب﴿ .': 'ب. ﴿', 'تعالى﴿: ': 'تعالى: ﴿',
        'ﷺ«: ': 'ﷺ: «', 'ص.)84': 'ص 84).', '(الإسراء.)31:': '(الإسراء، 31).',
        '(البقرة: )233:': '(البقرة، 233):',
    }.items():
        text = text.replace(old, new)
    text = re.sub(r'(?<=[ء-ي]) +(?=[ً-ْ])', '', text)
    text = re.sub(r'(\d+)هل\b', r'\1 هـ', text)
    text = re.sub(r'﴾ \( *\.\)(\d+)', r'﴾ (\1). ', text)
    text = re.sub(r' +\.(?=[ء-ي])', '. ', text)
    return text.strip()


def load(path):
    lessons = []
    block = None
    current = None
    assessment = False
    pages = subprocess.check_output(['pdftotext', '-layout', str(path), '-'], text=True).split('\f')
    for source_page, page in enumerate(pages[2:], 3):
        for raw_line in page.splitlines():
            line = clean(raw_line)
            if not line or '• 2026' in line or re.match(r'^التربية الإسلامية\s*\|', line):
                continue
            header = re.fullmatch(r'الوحدة (\S+) \| الدرس (\d+)', line)
            if header:
                unit = ORDINALS.index(header[1]) + 1
                number = int(header[2])
                block = dict(id=f'academic-s1-u{unit}-l{number:02}', unit=unit, number=number, rows=[])
                lessons.append(block)
                current = None
                continue
            if line in ('أنشطة الدرس', 'التقويم والمراجعة'):
                assessment = line == 'التقويم والمراجعة'
                current = None
                continue
            if 'name' not in block:
                block['name'] = TITLE_REPAIRS.get(PAGES[len(lessons) - 1], line)
                continue
            question = re.fullmatch(r'ص\s*(.*?)\s*\|\s*(\d+)(.*)', line)
            if question:
                prefix, page_number, prompt = question.groups()
                assert bool(prefix) == assessment, line
                if prefix.startswith('« '):
                    prefix = prefix[2:] + ' «'
                ordinal = re.fullmatch(r'(?:\.\)(\d+)\( (\d+)|\.(\d+))(?:\s*(«))?', prefix) if prefix else None
                assert not prefix or ordinal, line
                number = (ordinal[3] or f'{ordinal[2]}.{ordinal[1]}') if ordinal else ''
                prompt = clean((ordinal[4] or '') + prompt.strip() if ordinal else prompt)
                category = 'التقويم والمراجعة'
                if not assessment:
                    category = prompt.split(':', 1)[0] if ':' in prompt else 'أنشطة الدرس'
                    if prompt.startswith('القيم المستفادة'):
                        category = 'القيم المستفادة'
                        number = '2، 3'
                    elif ':' not in prompt:
                        category = next((label for label in ['أبحث عن', 'أذكر', 'أحدد', 'أتعاون وأذكر']
                                         if prompt.startswith(label)), category)
                current = dict(id=f'{block["id"]}-q{len(block["rows"])+1:02}', page=int(page_number),
                               handoutPage=source_page, number=number, category=category, question=prompt, answer='')
                block['rows'].append(current)
            elif re.match(r'^الإجابة(?: .[0-9]+)?:', line):
                assert current and not current['answer'], line
                label, answer = line.split(':', 1)
                first = label.removeprefix('الإجابة').strip(' .')
                current['answer'] = (first + '. ' if first else '') + answer.strip()
            elif current is not None:
                key = 'answer' if current['answer'] else 'question'
                current[key] += ' ' + line
            else:
                raise ValueError((source_page, line))
    assert len(lessons) == 25
    assert sum(len(l['rows']) for l in lessons) == 333
    for lesson, start, next_start in zip(lessons, PAGES, PAGES[1:]):
        lesson['startPage'] = start
        # Unit introductions occupy their own printed page.
        lesson['endPage'] = next_start - (2 if start in (37, 72, 105, 130) else 1)
        if start == 137:
            lesson['actualStartPage'] = 136
        for row in lesson['rows']:
            for key in ('question', 'answer'):
                row[key] = repair_row_text(row[key])
            assert row['answer'] and (136 if start == 137 else start) <= row['page'] <= lesson['endPage'], row
            if re.match(r'^[أبجد] — ', row['answer']):
                row['option'] = row['answer'][0]
            if row['id'] == 'academic-s1-u1-l01-q14':
                row['question'] = row['question'].replace('فأل ّف', 'فألّف')
            if row['id'] == 'academic-s1-u1-l01-q16':
                row['answer'] = 'الآيات من 102 إلى 105 من سورة آل عمران، كما في ص 7؛ نشاط حفظ وتسميع.'
            if row['id'] == 'academic-s1-u4-l02-q13':
                row['answer'] = 'ج — تحريم الجمع بين المرأة وعمتها أو خالتها في الزواج.'
                row['editorialNote'] = 'ضُبط التعبير وفق بيان الدرس ونص الحديث في كتاب الطالب، ص 123.'
            if re.search(r'إرشادي|لم يُتحقق|لم أتحقق|يحتاج إلى تحقق|مصدر خارجي|الرابط الخارجي|رمز QR', row['answer']):
                row['status'] = 'verify'
            elif 'مقترحة' in row['answer']:
                row['status'] = 'suggested'
            elif re.search(r'رأي|نقاش|أناقش|القيم|أطبق|مثال', row['category'] + ' ' + row['question']):
                row['status'] = 'suggested'
    return dict(edition=2026, handout=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                units=[dict(number=i, name=name, lessons=[l for l in lessons if l['unit'] == i])
                       for i, name in enumerate(UNITS, 1)])


if __name__ == '__main__':
    data = load(Path(sys.argv[1]))
    (ROOT / 'data/academic-semester-one.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
