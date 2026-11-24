import './accept-confirmations.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createDuelServer,ids} from './helpers/duel-server.mjs';

const base='http://127.0.0.1:4173/islam/';
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const fixture=await readFile(new URL('./fixtures/authorized-account.js',import.meta.url),'utf8');
const rpc={
 wall_board:['select public.wall_board($1) as value',a=>[a.p_period]],
 wall_start:['select public.wall_start($1,$2,$3) as value',a=>[a.p_level,a.p_unit,a.p_lesson]],
 wall_act:['select public.wall_act($1,$2,$3,$4) as value',a=>[a.p_id,a.p_action,a.p_question,a.p_option]],
 wall_admin:['select public.wall_admin($1,$2) as value',a=>[a.p_action,JSON.stringify(a.p_data||{})]]
};
const seed=(await readdir(new URL('../supabase/wall-seed/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort();

test('responsive practice: moving wall, pause on hiding, four Arabic options and review',async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:900}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://**/*',r=>r.abort());
   await page.goto(base);
   await page.locator('[data-action=guest-name]').click();
   await page.waitForFunction(()=>typeof S!=='undefined'&&authState().mode==='guest');
   await page.evaluate(()=>go('educational'));
   const card=page.locator('.edu-catalog > .wall-catalog');
   assert.equal(await page.locator('.edu-catalog > article').count(),14);
   assert.equal(await card.locator('h2').textContent(),'سباق الجدار');
   await card.locator('[data-page=wall]').click();
   await page.getByRole('heading',{name:'سباق الجدار',exact:true}).waitFor();
   await page.selectOption('#wall-unit','u01');
   await page.selectOption('#wall-lesson','u01_l01');
   await page.selectOption('#wall-level','hard');
   await page.locator('[data-wall=practice]').click();
   await page.locator('#wall-countdown').waitFor();
   const choices=page.locator('.wall-choice');
   await choices.first().waitFor();
   assert.deepEqual(await choices.locator('b').allTextContents(),['أ','ب','ج','د']);
   const stone=page.locator('.wall-stones'),before=await stone.evaluate(el=>el.style.transform);
   await page.waitForFunction(before=>document.querySelector('.wall-stones').style.transform!==before,before);
   await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{value:true,configurable:true});
    document.dispatchEvent(new Event('visibilitychange'));
   });
   await page.locator('[data-wall=resume]').waitFor();
   assert.equal(await choices.count(),0);
   const stopped=await stone.evaluate(el=>el.style.transform);
   await page.waitForTimeout(350);
   assert.equal(await stone.evaluate(el=>el.style.transform),stopped);
   await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
   await page.locator('[data-wall=resume]').click();
   await choices.first().waitFor();
   const q=await page.locator('.wall-question h3').textContent();
   const wrong=await page.evaluate(q=>{
    const row=S.valid.find(x=>x.lesson_id==='u01_l01'&&x.prompt===q);
    return row.payload.options.find(o=>o.id!==row.answer.option_id).id;
   },q);
   await page.locator(`[data-wall=answer][data-value="${wrong}"]`).click();
   await page.locator('.wall-wrong').waitFor();
   assert.equal(await choices.count(),0);
   await page.locator('[data-wall=exit]').click();
   await page.getByRole('heading',{name:'راجع إجاباتك الخاطئة'}).waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await mkdir('artifacts/wall',{recursive:true});
   await page.screenshot({path:`artifacts/wall/${width}-results.png`,fullPage:true});
   assert.deepEqual(errors,[]);
   await page.close();
  }
 }finally{await browser.close();}
});

test('ranked and admin screens call the actual SQL service through the test transport',async()=>{
 const backend=await createDuelServer({educationalFiles:['migrations/011_wall_challenge.sql',...seed.map(f=>'wall-seed/'+f)]});
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[];
 async function client(id,isAdmin){
  const context=await browser.newContext({viewport:{width:isAdmin?1280:390,height:900}});
  await context.exposeBinding('sqlWall',(_,name,params)=>backend.serialize(async()=>{
   await backend.db.exec('begin;set local role authenticated');
   try{
    await backend.db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id})]);
    const [sql,args]=rpc[name],result=await backend.db.query(sql,args(params));
    await backend.db.exec('commit');return result.rows[0]?.value;
   }catch(error){await backend.db.exec('rollback');throw error;}
  }));
  const extra=`__authorizedAccountFixture.identity.isAdmin=${isAdmin};Auth.wallRpc=(name,args)=>sqlWall(name,args);`;
  await context.route('**/*',route=>route.request().resourceType()==='document'?route.fulfill({
   status:200,contentType:'text/html; charset=utf-8',body:html.replace('startApplication();',fixture+'\n'+extra+'\nstartApplication();')
  }):route.request().url().startsWith(base)?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>typeof S!=='undefined'&&S.ready);
  await page.evaluate(()=>go('wall'));
  return page;
 }
 try{
  const learner=await client(ids.host,false);
  await learner.locator('[data-wall=ranked]').click();
  await learner.locator('.wall-choice').first().waitFor();
  const item=await backend.serialize(()=>backend.db.query("select id,questions->0 as question from school_private.wall_rounds where user_id=$1 and finished_at is null",[ids.host]));
  const {id,question}=item.rows[0];
  const good=learner.locator(`[data-wall=answer][data-value="${question.correct_id}"]`);
  await good.focus();await learner.keyboard.press('Enter');
  await learner.locator('.wall-right').waitFor();
  await learner.locator('[data-wall=next]').click();
  await learner.locator('.wall-choice').first().waitFor();
  await learner.locator('[data-wall=pause]').click();
  await learner.locator('[data-wall=resume]').waitFor();
  await learner.reload();await learner.waitForFunction(()=>typeof S!=='undefined'&&S.ready);
  await learner.evaluate(()=>go('wall'));
  await learner.locator('[data-wall=resume]').click();
  await backend.serialize(()=>backend.db.query("update school_private.wall_rounds set height=.98,mark=clock_timestamp()-interval '1 second' where id=$1",[id]));
  await learner.locator('[data-wall=pause]').click();
  await learner.getByRole('heading',{name:'وصل الجدار إلى خط الخطر'}).waitFor();
  await learner.locator('.wall-table tbody tr').waitFor();
  await learner.selectOption('#wall-period','day');
  await learner.locator('.wall-table tbody tr').waitFor();
  assert.ok((await learner.locator('.wall-table tbody').textContent()).includes('١٠٠'));
  assert.equal(await learner.locator('[data-page=wall-admin]').count(),0);
  const admin=await client(ids.admin,true);
  await admin.locator('[data-page=wall-admin]').click();
  await admin.locator('.wall-admin-rows article').first().waitFor();
  await admin.locator('[data-wall-admin=new]').click();
  const form=admin.locator('#wall-editor');
  await form.locator('[name=prompt]').fill('أي وصف يوضح سعة ملك الله؟');
  await form.locator('[name=lesson]').selectOption('u01_l01');
  await form.locator('[name=page]').fill('7');
  for(const [i,text] of ['يشمل السماوات والأرض','يقتصر على الأرض','يقتصر على السماء','يقتصر على جزء من الأرض'].entries())
   await form.locator(`[name=option${i+1}]`).fill(text);
  await form.locator('[name=correct]').selectOption('1');
  await form.locator('[name=explanation]').fill('توضح الآية ملك الله للسماوات والأرض.');
  await form.locator('[name=enabled]').uncheck();
  await form.getByRole('button',{name:'حفظ السؤال'}).click();
  await form.waitFor({state:'detached'});
  const saved=await backend.serialize(()=>backend.db.query("select enabled from school_private.wall_questions where id like 'custom-%'"));
  assert.equal(saved.rows[0].enabled,false);
  await admin.locator('[data-wall-admin=results]').click();
  await admin.locator('[data-wall-admin=visibility]').click();
  await admin.getByRole('button',{name:'إظهار في الترتيب'}).waitFor();
  const row=await backend.serialize(()=>backend.db.query('select hidden from school_private.wall_rounds where id=$1',[id]));
  assert.equal(row.rows[0].hidden,true);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await backend.db.close();}
});

test('two browsers use the online card, invite code, live scores and shared winner',async()=>{
 const backend=await createDuelServer({educationalFiles:['migrations/011_wall_challenge.sql',...seed.map(f=>'wall-seed/'+f),'migrations/012_wall_matches.sql']});
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const built=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
 const fixtureFile=await readFile(new URL('./fixtures/authorized-account.js',import.meta.url),'utf8');
 const errors=[];
 async function member(id,width){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.exposeBinding('matchSql',(_,name,args)=>backend.serialize(async()=>{
   await backend.db.exec('begin;set local role authenticated');
   try{
    await backend.db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id})]);
    const {p_action,p_id,p_code,p_level,p_unit,p_lesson,p_move,p_question,p_option}=args;
    assert.equal(name,'wall_match');
    const {rows}=await backend.db.query('select public.wall_match($1,$2,$3,$4,$5,$6,$7,$8,$9) as value',
     [p_action,p_id??null,p_code??null,p_level??'medium',p_unit??'all',p_lesson??'all',p_move??'state',p_question??null,p_option??null]);
    await backend.db.exec('commit');return rows[0].value;
   }catch(error){await backend.db.exec('rollback');throw error;}
  }));
  const script=fixtureFile+'\n__authorizedAccountFixture.identity.user.id='+JSON.stringify(id)+';Auth.wallRpc=(name,args)=>matchSql(name,args);';
  await context.route('**/*',route=>route.request().resourceType()==='document'?route.fulfill({
   status:200,contentType:'text/html; charset=utf-8',body:built.replace('startApplication();',script+'\nstartApplication();')
  }):route.request().url().startsWith(base)?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.waitForFunction(()=>typeof S!=='undefined'&&S.ready);
  await page.evaluate(()=>go('educational'));
  const card=page.locator('.edu-catalog > .wall-catalog');
  assert.ok(await card.getByRole('button',{name:'ابدأ اللعبة',exact:true}).count());
  const starts=page.getByRole('button',{name:'ابدأ اللعبة',exact:true});
  assert.equal(await starts.count(),14);
  assert.ok(await starts.evaluateAll(buttons=>buttons.every(button=>button.classList.contains('btn-gold'))));
  if(width===1280){
   await card.getByRole('button',{name:'ابدأ اللعبة',exact:true}).click();
   await page.locator('.wall-lobby').getByRole('button',{name:'تحدّ صديقك أونلاين'}).click();
  }else await card.getByRole('button',{name:'تحدّ صديقك أونلاين'}).click();
  return page;
 }
 try{
  const host=await member(ids.host,1280),guest=await member(ids.guest,390);
  await host.selectOption('#wall-match-unit','u01');
  await host.selectOption('#wall-match-lesson','u01_l01');
  await host.getByRole('button',{name:'إنشاء مواجهة'}).click();
  const code=await host.locator('[data-wall-code]').textContent();
  await guest.locator('#wall-join [name=code]').fill(code);
  await guest.getByRole('button',{name:'انضمام',exact:true}).click();
  await host.locator('.wall-choice').first().waitFor();
  await guest.locator('.wall-choice').first().waitFor();
  assert.equal(await host.locator('.wall-question h3').textContent(),await guest.locator('.wall-question h3').textContent());
  assert.equal(await host.locator('[data-wall=pause]').count(),0);
  const {rows:[room]}=await backend.serialize(()=>backend.db.query("select id,questions->0 as q from school_private.wall_matches"));
  await host.locator(`[data-wall=answer][data-value="${room.q.correct_id}"]`).click();
  await host.locator('.wall-right').waitFor();
  await guest.getByText('١٠٠',{exact:true}).first().waitFor();
  await host.reload();await host.waitForFunction(()=>typeof S!=='undefined'&&S.ready);
  await host.evaluate(()=>go('wall-online'));
  await host.locator('.wall-right').waitFor();
  await backend.serialize(()=>backend.db.query("update school_private.wall_matches set deadline=clock_timestamp()-interval '1 second' where id=$1",[room.id]));
  await host.getByRole('heading',{name:'فزت بالمواجهة'}).waitFor();
  await guest.getByRole('heading',{name:'فاز منافسك'}).waitFor();
  assert.ok(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await backend.db.close();}
});
