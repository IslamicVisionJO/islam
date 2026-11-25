import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';

const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:4173/islam/');
 await page.locator('[data-action=guest-name]').click();
 await page.waitForFunction(()=>S.ready);
 const matrix=await page.evaluate(()=>{
  const scopes=[['all','all'],['s1_all','all'],...S.units.flatMap(u=>[[u.id,'all'],...u.lessons.map(l=>[u.id,l.id])])];
  const bank=S.valid.filter(q=>(!firstScope(q.lesson_id)||q.delivery_allocation==='games_challenges')&&isStandaloneGameQuestion(q));
  const wallIds=new Set(WALL_QUESTION_IDS);
  return scopes.map(([unit,lesson])=>{
   const pool=EducationalContent.pool(bank,unit,lesson);
   const games=EducationalContent.names.map((name,index)=>{
    const candidates=EducationalContent.eligible(pool,index);
    const unique=new Set(candidates.map(entry=>(entry.q||entry).id)).size;
    const minimum=index===0?15:index===2?5:1;
    return {name,unique,minimum,canStart:unique>=minimum};
   });
   const wall=EducationalContent.pool(S.valid,unit,lesson).filter(q=>firstScope(q.lesson_id)
    ?q.delivery_allocation==='games_challenges'&&q.type==='multiple_choice'&&isStandaloneGameQuestion(q)
    :wallIds.has(q.id)).length;
   return {unit,lesson,games,wallCandidates:wall};
  });
 });
 await writeFile('review/reports/final-game-scope-matrix.json',JSON.stringify(matrix,null,2)+'\n');
 console.log(matrix.length,'scopes;',matrix.flatMap(x=>x.games).filter(x=>!x.canStart).length,'unavailable game/scope combinations');
} finally {await browser.close();}
