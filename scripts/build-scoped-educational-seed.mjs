import {readFile,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
const read=path=>readFile(path,'utf8');
const {eligible,standalone}=vm.runInNewContext(await read('src/core.js')+'\n'+await read('src/educational-core.js')+'\n;({eligible:EducationalContent.eligible,standalone:isStandaloneGameQuestion})');
const bank=[...JSON.parse(await read('review/bank/questions.json')).questions,...JSON.parse(await read('data/first-semester-game-supplement.json')).questions];
const rows=[];
for(const q of bank){
 if(q.delivery_allocation!=='games_challenges'||q.review.excluded||!q.review.source_checked||!q.review.answer_checked||!standalone(q))continue;
 const games=[];
 let term;
 for(let game=0;game<13;game++){
  const [candidate]=eligible([q],game);
  if(!candidate)continue;
  games.push(game);
  if(candidate.term)term=candidate.term;
 }
 if(!games.length)continue;
 const record=Object.fromEntries(['id','unit_id','lesson_id','difficulty','type','prompt','payload','answer','source','explanation'].map(k=>[k,q[k]]));
 rows.push({games,data:{...record,term}});
}
const target='supabase/migrations/014_scoped_educational_rooms.sql';
const migration=await read(target);
await writeFile(target,migration.replace(/-- BEGIN CONTENT[\s\S]*?-- END CONTENT/,()=>`-- BEGIN CONTENT
insert into school_private.scoped_educational_questions(id, games, data)
select x->'data'->>'id',array(select jsonb_array_elements_text(x->'games')::int),x->'data'
from jsonb_array_elements($textbook$${JSON.stringify(rows)}$textbook$::jsonb) x
on conflict(id) do update set games=excluded.games,data=excluded.data;
-- END CONTENT`));
console.log(rows.length,'eligible source-checked questions');
