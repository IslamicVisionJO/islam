import {chromium} from 'playwright';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const fixture=await fs.readFile('tests/fixtures/authorized-account.js','utf8');const base='http://127.0.0.1:4173/islam/';const report={lessons:0,tabs:0,liveSupabase:false};
try{const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',async route=>{if(route.request().url()===base){const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('startApplication();',fixture+'\nstartApplication();')});}else await route.continue();});await page.goto(base);await page.waitForFunction(()=>S.ready);assert.ok(await page.getByText('بإشراف الأستاذ محمد الطميزي',{exact:true}).count());
const ids=await page.evaluate(()=>LEARNING_DATA.units.flatMap(u=>u.lessons.map(l=>l.id)));
for(const id of ids){await page.evaluate(id=>Learning.open(id),id);assert.ok((await page.locator('video').getAttribute('src')).endsWith(id+'.mp4'));await page.locator('video').evaluate(v=>{v.muted=true;v.load();});await page.waitForFunction(()=>document.querySelector('video').readyState>=2);await page.locator('video').evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('video').currentTime>0);await page.locator('video').evaluate(v=>v.pause());for(const tab of ['explanation','solutions','quiz','video']){await page.locator(`[data-learning=tab][data-id=${tab}]`).click();if(tab==='solutions'){assert.equal(await page.locator('.book-answer').count(),await page.evaluate(id=>BOOK_SOLUTIONS[id].length,id));if(id===ids[0]){
 await page.locator('#book-search').fill('عبارة غير موجودة 432101');
 assert.equal(await page.locator('.book-answer:visible').count(),0);
 await page.locator('#book-search').clear();
 assert.ok(await page.locator('.book-answer:visible').count());
 await page.evaluate(()=>{window.print=()=>{window.didPrint=true;};});
 await page.locator('[data-book-print]').click();
 assert.equal(await page.evaluate(()=>didPrint),true);
 await page.reload();
 await page.waitForFunction(()=>typeof S!=='undefined'&&S.ready&&S.page==='book-solutions');
 assert.ok(await page.locator('.book-answer:visible').count());
 }await page.getByRole('button',{name:'العودة إلى شرح الدرس'}).click();}report.tabs++;}assert.equal(await page.locator('.learning-tabs [role=tab]').count(),5);assert.equal(await page.locator('[data-learning=tab][data-id=cards]').count(),0);report.lessons++;}
await page.evaluate(()=>Learning.open('u01_l01'));await page.locator('video').evaluate(v=>v.load());await page.waitForFunction(()=>document.querySelector('video').readyState>=1);await page.locator('video').evaluate(v=>{v.currentTime=v.duration-1;});await page.waitForTimeout(300);await page.locator('video').evaluate(v=>v.play());await page.waitForTimeout(1800);assert.equal(await page.evaluate(()=>S.profile.learning?.u01_l01?.completed),false);
await page.evaluate(()=>Study.open());await page.locator('[data-study=difficult]').click();await page.reload();await page.waitForFunction(()=>typeof S!=='undefined'&&S.ready&&S.page==='revision');await page.evaluate(()=>Study.open());assert.equal(await page.locator('[data-study=difficult]').getAttribute('aria-pressed'),'true');
await page.evaluate(async()=>{const old=db.scopeToken();await Learning.save('u01_l01',{position:12});await db.useAccount('00000000-0000-4000-8000-000000000043');S.profile={name:'ب',xp:0};});assert.equal(await page.evaluate(()=>S.profile.learning),undefined);
for(const width of [390,1280]){await page.setViewportSize({width,height:900});await page.evaluate(()=>go('learning'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
assert.deepEqual(errors,[]);const range=await fetch(base+'videos/u01_l01.mp4',{headers:{Range:'bytes=0-99'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,100);report.range=true;report.seekDoesNotComplete=true;report.reviewReload=true;report.accountIsolation=true;await fs.writeFile('test-results/learning-ui.json',JSON.stringify(report,null,2));console.log('PASS',report);
}finally{await browser.close();}
