import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
await fs.mkdir('artifacts/scenes',{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const fixture=await fs.readFile('tests/fixtures/authorized-account.js','utf8');const results=[];
try{for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://127.0.0.1:4173/**',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('startApplication();',fixture+'\nstartApplication();')});});
 await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>S.ready);await page.evaluate(()=>go('educational'));
 const click=async(a,v)=>page.locator(`[data-edu=${a}]${v===undefined?'':`[data-value="${v}"]`}`).first().click();
 for(let game=0;game<13;game++){
  await click('start',game);await page.waitForSelector('.edu-instructions');
  if(game===1){const q=await page.evaluate(()=>S.byId.get(S.profile.educationalActive.ids[0]));await click('left',q.answer.pairs[0].left_id);await click('right',q.answer.pairs[0].right_id);await page.waitForTimeout(100);assert.equal(await page.locator('.edu-wires path').count(),1);}
  if(game===2){await click('inspect');assert.ok((await page.locator('.edu-room-note').textContent()).length>20);}
  if(game===3){await click('spin');assert.equal(await page.locator('.is-spinning').count(),1);const before=await page.locator('.edu-wheel').evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(300);assert.notEqual(await page.locator('.edu-wheel').evaluate(el=>getComputedStyle(el).transform),before);}
  if(game===7){const id=await page.locator('[data-edu=letter]').first().getAttribute('data-value');await click('letter',id);assert.equal(await page.locator('[data-edu=unletter]').count(),1);await click('unletter',id);assert.equal(await page.locator('[data-edu=unletter]').count(),0);}
  if(game===10){const q=await page.evaluate(()=>S.byId.get(S.profile.educationalActive.ids[0]));await click('answer',q.answer.option_id);assert.equal(await page.locator('.edu-floor').count(),1);}
  if(game===11){const q=await page.evaluate(()=>S.byId.get(S.profile.educationalActive.ids[0]));await click('answer',q.answer.option_id);assert.equal(await page.locator('.edu-pipe-art').count(),4);}
  if(game===12){await page.waitForTimeout(2700);const seq=await page.evaluate(()=>S.profile.educationalActive.sequence);for(const id of seq)await click('recall',id);assert.ok(await page.locator('.edu-memory').count());const card=page.locator('.edu-node').first();await card.locator('[data-edu=peek]').click();assert.notEqual(await card.locator('button').first().textContent(),'❖');await page.waitForTimeout(350);}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${width}/${game}`);
  await page.waitForTimeout(600);await page.screenshot({path:`artifacts/scenes/${width}-${game}.png`,fullPage:true});results.push({width,game,passed:true});
  if(game===3)await page.waitForTimeout(1000);
  await click('finish');await click('catalog');
 }
 assert.deepEqual(errors,[]);await page.close();
}await fs.writeFile('test-results/scenes.json',JSON.stringify(results,null,2));}finally{await browser.close();}
