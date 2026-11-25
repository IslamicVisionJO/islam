import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {revisionData} from './revision-data.mjs';
const {catalog}=revisionData(), index=new Map(catalog.map(l=>[l.id,l]));
const records=[],groups=new Map(),counts={};
const norm=s=>String(s||'').normalize('NFKC').replace(/[\p{M}\p{P}\p{Z}ـ]/gu,'').replace(/[أإآ]/g,'ا');
for(const path of ['review/first-btec','review/bank']){
 const {questions}=JSON.parse(await readFile(path+'/questions.json','utf8'));
 for(const q of questions){
  const lesson=index.get(q.lesson_id),pages=q.source?.printed_pages||[],issues=[];
  if(!lesson||!pages.length||pages.some(p=>!Number.isInteger(p)||p<lesson.pages[0]||p>lesson.pages[1]))issues.push('page');
  if(!q.explanation?.trim())issues.push('missing_explanation');
  if(q.type==='multiple_choice'){
   const opts=q.payload.options;
   if(opts.length!==4||new Set(opts.map(o=>norm(o.text))).size!==4)issues.push('options');
   if(opts.filter(o=>o.id===q.answer.option_id).length!==1)issues.push('key');
  }
  const signature=q.lesson_id+'|'+norm(q.prompt);
  const row={id:q.id,book:q.source.document_id,lesson:q.lesson_id,pages,level:q.difficulty,type:q.type,pool:q.delivery_allocation,issues,scientificStatus:'pending',action:'retain_original_review_status'};
  if(!groups.has(signature))groups.set(signature,[]);groups.get(signature).push(row);records.push(row);
  const k=[q.lesson_id,q.difficulty,q.delivery_allocation,q.type].join('/');counts[k]=(counts[k]||0)+1;
 }
}
for(const group of groups.values())if(group.length>1)for(const row of group)row.issues.push('shared_prompt');
await mkdir('review/reports',{recursive:true});
await writeFile('review/reports/final-question-register.jsonl',records.map(q=>JSON.stringify(q)).join('\n')+'\n');
await writeFile('review/reports/final-bank-distribution.json',JSON.stringify(counts,null,2)+'\n');
console.log(records.length,records.reduce((n,r)=>n+!!r.issues.length,0));
