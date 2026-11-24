import {readFile,writeFile,mkdir} from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=file=>readFile(new URL(file,root),'utf8');
const {valid,standalone}=vm.runInNewContext(await read('src/core.js')+'\n;({valid:validQuestion,standalone:isStandaloneGameQuestion})');
const lessons=JSON.parse(await read('data/learning-manifest.json')).units.flatMap(u=>u.lessons);
const scope=new Map(lessons.map(l=>[l.id,l]));
const seen=new Set();
const questions=JSON.parse(await read('review/bank/questions.json')).questions.filter(q=>{
 const key=q.prompt.normalize('NFKC').replace(/[\p{M}\p{P}\p{Z}\u0640]/gu,'');
 const lesson=scope.get(q.lesson_id);
 if(!lesson||q.delivery_allocation!=='games_challenges'||q.type!=='multiple_choice'||!q.review.source_checked||
  !q.review.answer_checked||q.review.excluded||q.source.document_id!=='islamic_education_g11_s2_2025'||
  !q.source.printed_pages.every(p=>p>=lesson.startPage&&p<=lesson.endPage)||!valid(q)||!standalone(q)||seen.has(key))return false;
 seen.add(key);return true;
}).map(q=>({id:q.id,lesson_id:q.lesson_id,difficulty:q.difficulty,prompt:q.prompt,options:q.payload.options,
 correct_id:q.answer.option_id,explanation:q.explanation,page:q.source.printed_pages[0]}));
const tag=(json,delimiter)=>{const text=JSON.stringify(json);if(text.includes('$'+delimiter+'$'))throw Error('SQL delimiter collision');return '$'+delimiter+'$'+text+'$'+delimiter+'$::jsonb';};
const dir=new URL('supabase/wall-seed/',root);
await mkdir(dir,{recursive:true});
const lessonSql='insert into school_private.wall_lessons(id,first_page,last_page) select x.id,x.first_page,x.last_page from jsonb_to_recordset('+
 tag(lessons.map(l=>({id:l.id,first_page:l.startPage,last_page:l.endPage})),'wall_lessons')+
 ') x(id text,first_page int,last_page int) on conflict(id) do nothing;';
const parts=[];
for(const q of questions){
 if(!parts.length||Buffer.byteLength(JSON.stringify([...parts.at(-1),q]))>48000)parts.push([]);
 parts.at(-1).push(q);
}
for(const [i,list] of parts.entries()){
 const sql=`-- Generated from the textbook-linked game bank; run after migration 011.
begin;
${i===0?lessonSql:''}
insert into school_private.wall_questions(id,lesson_id,difficulty,prompt,options,correct_id,explanation,page)
select x.id,x.lesson_id,x.difficulty,x.prompt,x.options,x.correct_id,x.explanation,x.page
from jsonb_to_recordset(${tag(list,'wall_questions')})
 x(id text,lesson_id text,difficulty text,prompt text,options jsonb,correct_id text,explanation text,page int)
on conflict(id) do nothing;
commit;
`;
 await writeFile(new URL(String(i+1).padStart(2,'0')+'.sql',dir),sql);
}
await writeFile(new URL('data/wall-question-ids.json',root),JSON.stringify(questions.map(q=>q.id))+'\n');
console.log(questions.length,'wall questions;',new Set(questions.map(q=>q.lesson_id)).size,'lessons;',parts.length,'SQL Editor parts.');
