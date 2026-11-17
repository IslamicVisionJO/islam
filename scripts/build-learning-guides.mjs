/** Reuse canonical explanations with explicit record provenance; never generate religious answers. */
import fs from 'node:fs/promises';
const bank=JSON.parse(await fs.readFile('data/questions.json','utf8')).questions;
const lessons=JSON.parse(await fs.readFile('data/lessons.json','utf8')).flatMap(u=>u.lessons);
const guides={};
for(const lesson of lessons){
 const groups=new Map();
 for(const q of bank.filter(q=>q.lesson_id===lesson.id&&q.type==='multiple_choice'&&q.review?.source_checked&&!q.review?.excluded)){
  const answer=q.payload.options.find(o=>o.id===q.answer.option_id)?.text;
  if(!answer||!q.explanation)continue;
  const group=groups.get(q.topic)||[];
  if(group.length<2&&!group.some(x=>x.answer===answer))group.push({question:q.prompt,answer,explanation:q.explanation,questionId:q.id,pages:q.source.printed_pages,verification:q.review.verification_status});
  groups.set(q.topic,group);
 }
 guides[lesson.id]=[...groups].map(([heading,items])=>({heading,items}));
}
await fs.writeFile('data/lesson-guides.json',JSON.stringify(guides,null,2)+'\n');
console.log(`Built source-linked learning guides for ${Object.keys(guides).length} lessons`);
