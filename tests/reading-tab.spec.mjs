import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base='http://127.0.0.1:4173/islam/';
const fixture=await readFile('tests/fixtures/authorized-account.js','utf8');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const context=await browser.newContext({viewport:{width:360,height:740}});
 await context.route(base,async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:(await response.text()).replace('startApplication();',fixture+'\nstartApplication();')});
 });
 const page=await context.newPage();
 for(const [hash,selector] of [['#learning/btec1/s1_u01_l01/explanation','#lesson-panel h4'],['#revision/u01_l01','#rev-results h3']]){
  await page.goto(base+hash);
  const title=await page.locator(selector).first().innerText();
  const opened=context.waitForEvent('page');
  await page.locator('[data-reading-source]').click();
  const reader=await opened;
  await reader.waitForLoadState();
  assert.ok((await reader.locator('body').innerText()).includes(title));
  assert.equal(await reader.locator('script,form,input,button').count(),0);
  assert.equal(await reader.evaluate(()=>window.opener),null);
  assert.equal(await reader.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await reader.close();
 }
 console.log('Lesson and revision reading tabs passed');
}finally{await browser.close();}
