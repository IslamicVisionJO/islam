import {writeFile} from 'node:fs/promises';
import {revisionData} from './revision-data.mjs';

const published=revisionData();
const review=revisionData({review:true});
const lines=[['الفصل','الوحدة','معرّف الدرس','الدرس','الصفحة المطبوعة','أسئلة منشورة تشير إلى الصفحة','أسئلة طوبقت مع الصورة المطبوعة في هذه الجولة','مواد إضافية قيد المراجعة تشير إلى الصفحة','مواد قيد المراجعة تشير إلى نطاق الدرس']];
for(const lesson of published.catalog){
 const chapter=published.chapters[lesson.id];
 const publishedIds=new Set(chapter.map(row=>row.id));
 const pending=review.chapters[lesson.id].filter(row=>!publishedIds.has(row.id));
 for(let page=lesson.pages[0];page<=lesson.pages[1];page++){
  const direct=row=>!row.range&&row.pages.includes(page);
  const cite=row=>row.id+' — '+row.question;
  const rows=chapter.filter(direct);
  lines.push([lesson.semester,lesson.unit,lesson.id,lesson.title,page,rows.map(cite).join(' | '),
   rows.filter(r=>r.status==='checked').map(r=>r.id).join(' | '),pending.filter(direct).map(r=>r.id).join(' | '),
   pending.filter(r=>r.range&&r.pages[0]<=page&&r.pages.at(-1)>=page).map(r=>r.id).join(' | ')]);
 }
}
const csv=lines.map(line=>line.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\n');
await writeFile(new URL('../TEXTBOOK_COVERAGE.csv',import.meta.url),'\ufeff'+csv+'\n');
