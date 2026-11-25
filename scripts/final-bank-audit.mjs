import {readFile,writeFile,mkdir} from 'node:fs/promises';
import vm from 'node:vm';
import {revisionData} from './revision-data.mjs';
const {catalog}=revisionData(), index=new Map(catalog.map(l=>[l.id,l]));
const validQuestion=vm.runInNewContext(await readFile('src/core.js','utf8')+'\nvalidQuestion');
const ids=new Set();
const records=[],groups=new Map(),counts={};
const norm=s=>String(s||'').normalize('NFKC').replace(/[\p{M}\p{P}\p{Z}ـ]/gu,'').replace(/[أإآ]/g,'ا');
const pageChecked=new Set([1,2,3,4,6,8,10,13,17,18,20,21,22,23,24,28,29,32,33,35,36,38,43,45,48,49,50,51,54,55,56,62,63,64,86,90,93,94].map(n=>'s1_u01_l01_q'+String(n).padStart(3,'0')));
for(const n of [103,104,105,106,109,110,114,115,116,119,126,138,139,145,146,147,148,155])pageChecked.add('u01_l01_q'+n);
for(const path of ['review/first-btec/questions.json','review/bank/questions.json','data/first-semester-game-supplement.json']){
 const {questions}=JSON.parse(await readFile(path,'utf8'));
 for(const q of questions){
  const lesson=index.get(q.lesson_id),pages=q.source?.printed_pages||[],issues=[];
  if(!validQuestion(q))issues.push('runtime_schema');
  if(ids.has(q.id))issues.push('duplicate_id');
  ids.add(q.id);
  if(!lesson||!pages.length||pages.some(p=>!Number.isInteger(p)||p<lesson.pages[0]||p>lesson.pages[1]))issues.push('page');
  if(!q.explanation?.trim())issues.push('missing_explanation');
  if(q.type==='multiple_choice'){
   const opts=q.payload.options;
   if(opts.length!==4||new Set(opts.map(o=>norm(o.text))).size!==4)issues.push('options');
   if(opts.filter(o=>o.id===q.answer.option_id).length!==1)issues.push('key');
  }
  const signature=q.lesson_id+'|'+norm(q.prompt);
  const row={id:q.id,book:q.source.document_id,lesson:q.lesson_id,pages,level:q.difficulty,type:q.type,pool:q.delivery_allocation,issues,scientificStatus:path.includes('supplement')?'page_and_answer_checked':pageChecked.has(q.id)?'printed_page_supports_answer':'pending',action:'retain_original_review_status'};
  if(!groups.has(signature))groups.set(signature,[]);groups.get(signature).push(row);records.push(row);
  const k=[q.lesson_id,q.difficulty,q.delivery_allocation,q.type].join('/');counts[k]=(counts[k]||0)+1;
 }
}
for(const group of groups.values())if(group.length>1)for(const row of group)row.issues.push('shared_prompt');
await mkdir('review/reports',{recursive:true});
await writeFile('review/reports/final-question-register.jsonl',records.map(q=>JSON.stringify(q)).join('\n')+'\n');
await writeFile('review/reports/final-bank-distribution.json',JSON.stringify(counts,null,2)+'\n');
console.log(records.length,records.reduce((n,r)=>n+!!r.issues.length,0));
