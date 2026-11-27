import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
const base=process.env.ARCADE_TEST_URL||'http://127.0.0.1:4173/islam/';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const errors=[];
try{
 const fixture=await readFile('tests/fixtures/authorized-account.js','utf8');
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route(base,async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('startApplication();',fixture+'\nstartApplication();')});});
 page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>S.ready);
 await page.evaluate(()=>go('educational'));assert.equal(await page.locator('[data-arcade-game]').count(),4);
 assert.equal(await page.locator('[data-edu=start]').count(),13);
 for(const id of ['blocks','space','bubbles','tiles'])for(const level of ['easy','medium','hard']){
  await page.locator('[data-arcade-game='+id+']').click();
  const modal=page.locator('dialog.arcade-modal');
  await modal.locator('[name=level]').selectOption(level);
  await modal.locator('[type=submit]').click();await modal.getByRole('button',{name:'ابدأ اللعب',exact:true}).click();
  await modal.locator('.answers button').first().click();await modal.getByRole('button',{name:'متابعة اللعب'}).click();
  await modal.locator('.pad button').first().click();await modal.locator('[data-action=pause]').click();
  await modal.getByRole('button',{name:'إنهاء الجولة',exact:true}).click();await modal.getByText('حُفظت نتيجة الجولة.').waitFor();
  assert.ok(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await modal.getByRole('button',{name:'العودة إلى الألعاب'}).click();
 }
 assert.equal(await page.evaluate(()=>S.profile.arcade.history.length),12);
 await page.reload();await page.waitForFunction(()=>S.ready);assert.equal(await page.evaluate(()=>S.profile.arcade.history.length),12);
 await page.setViewportSize({width:1280,height:800});
 await page.goto(base+'arcade/offline.html');await page.context().setOffline(true);
 await page.getByRole('button',{name:'حُرّاس المدار'}).click();await page.locator('[type=submit]').click();
 await page.getByRole('button',{name:'ابدأ اللعب',exact:true}).click();assert.equal(await page.locator('.answers button').count(),4);
 assert.deepEqual(errors,[]);console.log('PASS 12 game/level rounds, mobile controls, educational feedback, account history after reload, standalone offline play');
}finally{await browser.close();}
