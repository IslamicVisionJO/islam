import './accept-confirmations.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {createDuelServer,ids} from './helpers/duel-server.mjs';

const base='http://127.0.0.1:4173/islam/';
const server=await createDuelServer({educationalFiles:['migrations/007_steam_achievements.sql']});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const fixture=await readFile(new URL('./fixtures/authorized-account.js',import.meta.url),'utf8');
const rpc={
 steam_list:['select public.steam_list($1) as v', a=>[a.p_manage]],
 steam_save:['select public.steam_save($1,$2,$3,$4,$5,$6,$7) as v',a=>[a.p_id,a.p_title,a.p_description,a.p_date,a.p_team,a.p_published,JSON.stringify(a.p_images)]],
 steam_delete:['select public.steam_delete($1) as v',a=>[a.p_id]]
};
async function client(asAdmin){
 const context=await browser.newContext({viewport:{width:asAdmin?1280:390,height:900}});
 await context.exposeBinding('sqlSteam',(_,name,params)=>server.serialize(async()=>{
  await server.db.exec('begin;set local role '+(asAdmin?'authenticated':'anon'));
  try{
   await server.db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(asAdmin?{sub:ids.admin}:{})]);
   const [sql,args]=rpc[name];
   const result=await server.db.query(sql,args(params));
   await server.db.exec('commit');return result.rows[0]?.v;
  }catch(error){await server.db.exec('rollback');throw error;}
 }));
 const identity=asAdmin?'__authorizedAccountFixture.identity.isAdmin=true;':'__authorizedAccountFixture.identity.mode="signed-out";';
 const script=fixture+identity+'Auth.steamRpc=(name,args)=>sqlSteam(name,args);';
 await context.route('**/*',route=>route.request().resourceType()==='document'?route.fulfill({
  status:200,contentType:'text/html; charset=utf-8',body:html.replace('startApplication();',script+'\nstartApplication();')
 }):route.request().url().startsWith(base)?route.continue():route.abort());
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 await page.waitForFunction(()=>typeof S!=='undefined'&&S.ready);
 return page;
}
const errors=[];
try{
 const admin=await client(true),visitor=await client(false);
 await visitor.getByRole('link',{name:'التكامل المعرفي STEAM'}).click();
 await visitor.getByText('سيتم إضافة الإنجازات قريبًا.').waitFor();
 assert.equal(await visitor.locator('[data-steam=manage]').count(),0);
 await admin.locator('[data-action=navigate][data-page=steam]').click();
 await admin.locator('[data-steam=manage]').click();
 const form=admin.locator('#steam-editor');
 await form.locator('[name=title]').fill('مشروع علمي للاختبار');
 await form.locator('[name=description]').fill('وصف المشروع التجريبي');
 const photo=await readFile(new URL('./fixtures/steam-photo.jpg',import.meta.url));
 await form.locator('[name=images]').setInputFiles(['a','b'].map(name=>({name:name+'.jpg',mimeType:'image/jpeg',buffer:photo})));
 await form.getByRole('button',{name:'حفظ الإنجاز'}).click();
 await admin.getByText('مشروع علمي للاختبار',{exact:true}).waitFor();
 assert.equal(await admin.locator('.steam-gallery img').count(),2);
 await visitor.reload();
 await visitor.getByText('سيتم إضافة الإنجازات قريبًا.').waitFor();
 await admin.locator('[data-steam=edit]').click();
 await form.locator('[name=published]').check();
 await form.locator('[name=title]').fill('إنجاز ظاهر للزوار');
 await form.getByRole('button',{name:'حفظ الإنجاز'}).click();
 await admin.getByText('إنجاز ظاهر للزوار',{exact:true}).waitFor();
 await visitor.reload();
 await visitor.getByText('إنجاز ظاهر للزوار',{exact:true}).waitFor();
 assert.equal(await visitor.locator('.steam-gallery img').count(),2);
 await admin.locator('[data-steam=delete]').click();
 await admin.getByText('سيتم إضافة الإنجازات قريبًا.').waitFor();
 await visitor.reload();
 await visitor.getByText('سيتم إضافة الإنجازات قريبًا.').waitFor();
 await visitor.getByRole('link',{name:'العودة إلى تسجيل الدخول'}).click();
 await visitor.getByRole('link',{name:'التربية الإسلامية في حياتنا'}).click();
 assert.equal(await visitor.locator('.enrichment-grid article').count(),16);
 const coverage=await admin.evaluate(()=>[...new Set(questionPool('exam',null,'mixed','all').map(q=>q.lesson_id))].length);
 assert.equal(coverage,26);
 await admin.evaluate(()=>createSession('exam','u01_l01','mixed','all',40));
 assert.deepEqual(await admin.locator('.answer-area .choice-letter').allTextContents(),['أ','ب','ج','د']);
 const exam=await admin.evaluate(()=>({
  total:S.session.questions.length, lessons:S.session.lessonIds.length,
  ids:new Set(S.session.questions.map(q=>q.id)).size,
  valid:S.session.questions.every(q=>q.type==='multiple_choice'&&q.payload.options.length===4&&q.payload.options.filter(o=>checkAnswer(q,o.id)).length===1)
 }));
 assert.deepEqual(exam,{total:40,lessons:26,ids:40,valid:true});
 const correct=await admin.evaluate(()=>S.session.questions[0].answer.option_id);
 await admin.locator(`.answer-area [data-option="${correct}"]`).click();
 await admin.waitForFunction(()=>!S.busy&&S.session.current===1);
 const wrong=await admin.evaluate(()=>S.session.questions[1].payload.options.find(o=>o.id!==S.session.questions[1].answer.option_id).id);
 await admin.locator(`.answer-area [data-option="${wrong}"]`).click();
 await admin.waitForFunction(()=>!S.busy&&S.session.current===2);
 assert.equal(await admin.locator('.training-feedback,.correct-details').count(),0);
 await admin.evaluate(()=>submitExam());
 assert.deepEqual(await admin.evaluate(()=>[S.finished.correct,S.finished.wrong,S.finished.items.length]),[1,1,40]);
 assert.ok(await admin.locator('.review-list').count());
 assert.deepEqual(errors,[]);
 console.log('PASS STEAM upload/edit/delete and signed-out visibility, life topics, 40-question balanced final exam and grading.');
}finally{await browser.close();await server.db.close();}
