// Index each teaching surface independently. A reused question is a reference, not a new bank item.
import {readFile,writeFile} from 'node:fs/promises';
import {revisionData} from './revision-data.mjs';

const read=async name=>JSON.parse(await readFile('data/'+name+'.json','utf8'));
const {catalog,chapters}=revisionData();
const academic=await read('academic-semester-one');
const academicLessons=new Map(academic.units.flatMap(unit=>unit.lessons.map(l=>[l.id,l])));
const solutions=(await read('book-solutions')).lessons;
const guides=await read('lesson-guides');
const firstStudy=await read('academic-semester-one-study');
const handout=(await read('learning-manifest')).units.flatMap(unit=>unit.lessons);
const exam=await read('compendium-exam');
const rows=[];
function add(surface,id,lesson,question,answer,pages,extra={}){
 if(!id||!lesson||!question?.trim()||!answer?.trim())throw Error('Missing content: '+surface+' '+id);
 rows.push({surface,id,lesson,originalQuestion:question,correctedQuestion:null,answer,pages,...extra});
}
for(const l of catalog){
 for(const q of chapters[l.id])add('revision',q.id,l.id,q.question,q.answer,q.pages,{source:q.source,status:q.status||'unmarked',range:q.range});
 const records=l.academicId?academicLessons.get(l.academicId).rows:solutions[l.id];
 records.forEach((q,i)=>add('book_solutions',q.id||l.id+'-solution-'+i,l.id,q.question,q.answer,q.pages||[q.page],{status:q.status||'unmarked'}));
 if(l.academicId){
  for(const q of firstStudy[l.academicId].questions)add('academic_quiz',q.id,l.id,q.prompt,q.options[q.correct],[q.page],{options:q.options});
 }else{
  for(const group of guides[l.id])for(const q of group.items)add('lesson_guide',q.questionId,l.id,q.question,q.answer,q.pages);
 }
}
for(const l of handout){
 for(const group of ['cards','activities','assessment'])for(const q of l[group]||[]){
  // Image-only excerpts can be audited through the exact asset paths and handout page.
  rows.push({surface:'study_'+group,id:q.id,lesson:l.id,originalQuestion:q.question||q.label||null,correctedQuestion:null,
   answer:q.answer||null,pages:q.bookPages,handoutPage:q.sourcePdfPage,questionImages:q.questionImages,answerImages:q.answerImages});
 }
}
for(const q of exam)add('compendium_exam',q.id,q.lessonId,q.question,q.options.find(o=>o.id===q.answer)?.text,[],{options:q.options,handoutPage:q.sourcePdfPage,answerHandoutPage:q.answerPdfPage});
const ids=new Set(rows.map(q=>q.surface+'/'+q.id));
if(ids.size!==rows.length)throw Error('Duplicate ID within a teaching surface');
await writeFile('review/reports/study-question-register.jsonl',rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
console.log(rows.reduce((counts,row)=>({...counts,[row.surface]:(counts[row.surface]||0)+1}),{}));
