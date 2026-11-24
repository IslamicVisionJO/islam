import './accept-confirmations.mjs';
import {strict as assert} from 'node:assert';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
const source=async name=>JSON.parse(await readFile(new URL('../review/bank/'+name+'.json',import.meta.url),'utf8'));
const gameIds=new Set((await source('games-challenges-index')).question_ids);
const eligibleGames=(await source('questions')).questions.filter(q=>gameIds.has(q.id)&&!q.review.excluded&&q.review.source_checked&&q.review.answer_checked);
const examIndex=(await source('lesson-wizari-index')).lessons;


const release = process.argv.includes('--release');
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try {
 for (const width of [390,1280]) {
  const page = await browser.newPage({viewport:{width,height:900}});
  const errors = [];
  page.on('pageerror', error=>errors.push(error.message));
  await page.goto(release?'http://127.0.0.1:4173/islam/':'http://127.0.0.1:4174/islam/');
  await page.locator('[data-action=guest-name]').click();
  await page.waitForFunction(()=>S.ready && Auth.current().mode==='guest');
  const bank = await page.evaluate(()=>({count:S.valid.length,released:REFINED_BANK_RELEASE,configured:Auth.current().configured}));
  assert.ok(eligibleGames.length>0);
  assert.equal(bank.count,eligibleGames.length);
  assert.equal(bank.released,release);
  if (!release) assert.equal(bank.configured,false);
  const history = await page.evaluate(()=>{
   const old = EMBEDDED_QUESTIONS.archivedQuestions[0];
   const progress = {name:'طالب',xp:12,coins:2,educationalActive:{
    id:'legacy-round',game:0,ids:[old.id],index:0,score:0,done:false,unit:old.unit_id,lesson:old.lesson_id,items:[]
   }};
   const backup=validateBackup({app:'tahadi-islamic',version:1,records:{profile:progress}},S.byId);
   const mistakes=S.mistakes;
   S.mistakes={[old.id]:{count:1}};
   const drawn=questionPool('mistakes',null,'mixed','all').length;
   S.mistakes=mistakes;
   return {xp:backup.profile.xp,coins:backup.profile.coins,oldQuestionKnown:S.byId.has(old.id),drawn};
  });
  assert.deepEqual(history,{xp:12,coins:2,oldQuestionKnown:true,drawn:0});
  await page.evaluate(()=>Learning.open('u01_l01'));
  await page.locator('[data-learning=tab][data-id=quiz]').click();
  for (const difficulty of ['easy','medium','hard']) {
   await page.locator(`[data-ministerial=start][data-value=${difficulty}]`).click();
   assert.deepEqual(await page.locator('.ministerial-options strong').allTextContents(),['أ','ب','ج','د']);
   assert.equal(await page.locator('.learning-panel details').count(),0);
   const question = await page.locator('.ministerial-options legend').textContent();
   const q = await page.evaluate(({difficulty,question})=>MINISTERIAL_REVIEW.u01_l01[difficulty].find(q=>q.prompt===question),{difficulty,question});
   assert.ok(q);
   await page.locator(`[data-ministerial-answer][value=${q.answer.option_id}]`).check();
   const next=page.locator('[data-ministerial=next]');
   await next.click();
   const second = await page.locator('.ministerial-options legend').textContent();
   assert.notEqual(second,question);
   const wrong = await page.evaluate(({difficulty,second})=>{
    const q=MINISTERIAL_REVIEW.u01_l01[difficulty].find(q=>q.prompt===second);
    return q.payload.options.find(o=>o.id!==q.answer.option_id).id;
   },{difficulty,second});
   await page.locator(`[data-ministerial-answer][value=${wrong}]`).check();
   await page.locator('[data-ministerial=previous]').click();
   assert.ok(await page.locator(`[data-ministerial-answer][value=${q.answer.option_id}]`).isChecked());
   assert.equal(await page.locator('.learning-panel progress').getAttribute('value'),'2');
   await page.locator('[data-ministerial=submit]').click();
   const expected=examIndex.u01_l01[difficulty].length;
   assert.equal(await page.locator('.learning-panel details').count(),expected);
   const summary = await page.locator('.learning-panel [role=status]').textContent();
   for (const [label,count] of [['صحيحة',1],['خاطئة',1],['غير مجابة',expected-2]]) {
    assert.ok(summary.includes(label+' '+await page.evaluate(n=>nf(n),count)));
   }
   await page.getByText('اختر مستوى آخر',{exact:true}).click();
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('PASS ministerial review exams: all levels, Arabic keyboard controls, grading, results, phone and desktop.');
} finally {await browser.close();}
