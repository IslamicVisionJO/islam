import {readFileSync} from 'node:fs';
const load=name=>JSON.parse(readFileSync(new URL('../data/'+name+'.json',import.meta.url),'utf8'));
const normalize=s=>s.normalize('NFKC').replace(/[\p{M}\p{P}\sـ]/gu,'').replace(/[إأآ]/g,'ا');

export function revisionData({review=false}={}){
 const supplied=load('revision-cards'), academic=load('academic-semester-one'), study=load('academic-semester-one-study');
 const first=load('first-btec-lessons').flatMap(u=>u.lessons), second=load('learning-manifest').units.flatMap(u=>u.lessons);
 const solutions=load('book-solutions').lessons, guides=load('lesson-guides');
 const catalog=[], chapters={};
 for(const lesson of supplied.lessons){
  const {id,unit,number,semester}=lesson;
  const firstTerm=semester===1;
  const original=(firstTerm?first:second).find(l=>l.id===id);
  const linked=firstTerm?academic.units.find(u=>u.number===unit)?.lessons.find(l=>l.number===number):null;
  if(!original||original.number!==number||firstTerm&&!linked||chapters[id])throw Error('Invalid lesson mapping '+id);
  const meta={id,unit,number,semester,title:original.name,pages:[linked?.actualStartPage||original.startPage,linked?.endPage||original.endPage],academicId:linked?.id};
  const rows=[],seen=new Set();
  function add(key,question,answer,pages,category,source,status,range=false){
   if(!question?.trim()||!answer?.trim()||!pages?.length)throw Error('Missing revision text '+key);
   if(pages.some(p=>!Number.isSafeInteger(p)||p<meta.pages[0]||p>meta.pages[1]))throw Error('Invalid printed page '+key);
   if(!review&&['draft','verify','needs_human_review'].includes(status))return;
   const signature=normalize(question)+'|'+normalize(answer);
   if(seen.has(signature))return;
   seen.add(signature);
   rows.push({id:key,question,answer,pages,category,source,status,range});
  }
  for(const c of lesson.cards)add(c.id,c.question,c.answer,c.bookPages,c.category,c.sourceVerified?'الكتاب المدرسي':'المكثف المرفق',c.sourceVerified?'checked':'draft',c.bookPages.length>1);
  for(const [i,c] of (firstTerm?linked.rows:solutions[id]).entries()){
   add(c.id||id+'-solution-'+i,c.question,c.answer,c.pages||[c.page],c.category,'ملف الحلول',c.status);
  }
  if(firstTerm){
   for(const q of study[linked.id].questions)add(q.id,q.prompt,q.options[q.correct]+'\n'+q.explanation,[q.page],'تطبيق وفهم','تدريب المنصة','practice');
  }else{
   for(const group of guides[id])for(const item of group.items)add(item.questionId,item.question,item.answer,item.pages,group.heading,'شرح الدرس',item.verification);
  }
  if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Duplicate revision ID '+id);
  catalog.push({...meta,count:rows.length});
  chapters[id]=rows;
 }
 if(catalog.length!==first.length+second.length)throw Error('Incomplete lesson catalog');
 return {catalog,chapters};
}
