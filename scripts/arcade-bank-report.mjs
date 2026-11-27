import {readFile, writeFile} from 'node:fs/promises';

const bank = JSON.parse(await readFile(new URL('../public/arcade/bank.json', import.meta.url)));
const levels = ['easy','medium','hard'];
const rows = bank.lessons.map(lesson => {
  const items = bank.questions.filter(q => q.lesson === lesson.id);
  const counts = levels.map(level => items.filter(q => q.level === level).length);
  const missing = counts.reduce((sum, count) => sum + Math.max(0, 30-count), 0);
  return [lesson.semester,lesson.unitTitle,lesson.title,...counts,missing];
});
const gap = rows.reduce((sum,row) => sum+row.at(-1),0);
const text = [
  '# تدقيق بنك الألعاب الأربع',
  '',
  `يضم البنك المشترك ${bank.questions.length} سؤال اختيار من متعدد. تتضمن الخيارات إجابة واحدة مع تفسير ورقم الصفحة المطبوعة. يبيّن الجدول رصيد كل نطاق من الهدف المطلوب، وهو ثلاثون سؤالًا في كل مستوى. تبقى ${gap} خانة للوصول إلى الهدف عبر جميع الدروس والمستويات.`,
  '',
  'قوبلت المفاهيم ومفاتيح الإجابة بصفحات الكتابين المرفقين، واستُخدمت نتائج مقابلات الصفحات المحفوظة للأسئلة السابقة عند توافرها. اختيرت الأسئلة التي أمكن التثبت من مضمونها، وحررت بعض الصياغات لتستقل عن جدول أو نشاط غير معروض. يقتصر هذا الفحص على المطابقة التحريرية. لم يرد اعتماد من المعلم. كتاب الفصل الأول هو طبعة 2026 قيد المراجعة، وكتاب الفصل الثاني إعادة طباعة 2025.',
  '',
  'يحمل كل سجل معرفًا ثابتًا ومفتاح الدرس ورقم الإجابة ضمن الخيارات الأربعة. يشير الفصل الأول إلى السنة الأولى BTEC في واجهة المشروع، والفصل الثاني إلى السنة الثانية. تظهر الأسئلة في الألعاب الأربع من الملف نفسه.',
  '',
  '| الفصل | الوحدة | الدرس | سهل | متوسط | صعب | النقص |',
  '|---|---|---|---:|---:|---:|---:|',
  ...rows.map(row => '| '+row.join(' | ')+' |'),
  ''
].join('\n');
await writeFile(new URL('../ARCADE_QUESTION_COVERAGE.md', import.meta.url),text);
