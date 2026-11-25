import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {revisionData} from '../scripts/revision-data.mjs';

const base='http://127.0.0.1:4173/islam/';
const {catalog,chapters}=revisionData();
const fixture=await readFile('tests/fixtures/authorized-account.js','utf8');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1024,height:820}});
const errors=[],completed=[];
page.on('dialog',dialog=>dialog.accept());
page.on('pageerror',error=>errors.push(error.message));
await page.route(base,async route=>{
 const response=await route.fetch();
 await route.fulfill({response,body:(await response.text()).replace('startApplication();',fixture+'\nstartApplication();')});
});
await mkdir('artifacts/platform-audit',{recursive:true});
const report=()=>writeFile('artifacts/platform-audit/lessons.json',JSON.stringify({completed,errors},null,2));
try{
 await page.goto(base);await page.waitForFunction(()=>typeof S!=='undefined'&&S.ready);
 for(const l of catalog){
  const path='#learning/'+(l.semester===1?'btec1/':'')+l.id;
  await page.evaluate(hash=>{location.hash=hash;},path);
  const panel=page.locator('#lesson-panel');
  await page.getByRole('heading',{name:l.title,exact:true,level:1}).waitFor();
  for(const tab of ['explanation','video','revision','solutions']){
   await page.locator(`[role=tab][data-id=${tab}]`).click();
   if(tab==='explanation'){
    await panel.getByRole('heading',{name:'شرح الدرس',exact:true}).waitFor();
    assert.ok((await panel.textContent()).length>180);
   }else if(tab==='video'){
    assert.equal(await page.locator('[role=tab][data-id=quiz]').count(),0);
    assert.ok((await panel.locator('video').getAttribute('src')).endsWith(l.id+'.mp4'));
    const levels=await page.evaluate(id=>['easy','medium','hard'].map(level=>questionPool('training',id,level,'all').map(q=>q.id)),l.id);
    for(const questions of levels)assert.equal(new Set(questions).size,30,l.id);
   }else if(tab==='revision'){
    await panel.locator('.revision-entry').first().waitFor();
    assert.equal(await panel.locator('.revision-entry').count(),chapters[l.id].length);
    assert.ok((await panel.locator('h3').first().textContent()).includes(chapters[l.id][0].question));
   }else{
    const cards=page.locator('.book-answer');
    await cards.first().waitFor();
    const expected=await page.evaluate(id=>{
     const l=Revision.meta(id);
     return l.academicId?Revision.academicLesson(l.academicId).rows:BOOK_SOLUTIONS[id];
    },l.id);
    assert.equal(await cards.count(),expected.length);
    assert.ok((await cards.first().innerText()).includes(expected[0].answer));
   }
   completed.push({lesson:l.id,tab});
  }
  await report();
 }
 const lesson=catalog[0];
 await page.goto(base+'#revision/'+lesson.id);
 await page.locator('#rev-results .revision-entry').first().waitFor();
 for(const width of [320,360,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:900});
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>{S.settings.theme=theme;render();},theme);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width+' '+theme);
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-mark=saved]').first().click();
 await page.waitForSelector('[data-mark=saved][aria-pressed=true]');
 await page.reload();await page.waitForSelector('[data-mark=saved][aria-pressed=true]');
 await page.locator('[data-rev-mode]').click();
 await page.locator('[data-rev-step="1"]').click();
 await page.waitForFunction(()=>S.profile.revisionStudy?.index===1 && document.querySelector('#rev-results [data-rev-step="-1"]')?.disabled===false);
 const savedPosition=await page.locator('#rev-results article').first().getAttribute('data-card');
 await page.reload();await page.waitForSelector('#rev-results article[data-card="'+savedPosition+'"]');
 await page.locator('[data-rev-mode]').click();
 await page.screenshot({path:'artifacts/platform-audit/revision-mobile.png'});
 await page.locator('#rev-term').selectOption('2');
 await page.waitForURL('**/#revision/u01_l01');await page.goBack();
 await page.waitForURL('**/#revision/s1_u01_l01');
 await page.goForward();await page.waitForURL('**/#revision/u01_l01');
 await page.locator('[name=scope]').selectOption('all');
 await page.locator('[name=query]').fill('الشبهات');await page.locator('#revision-search button').click();
 await page.waitForSelector('#rev-results h2');
 await page.emulateMedia({media:'print'});
 assert.ok(await page.locator('.revision-entry').first().isVisible());
 await page.goto(base+'#learning/btec1/s1_u01_l01/solutions');
 await page.locator('.book-answer').first().waitFor();
 assert.ok(await page.locator('.book-answer').first().isVisible());
 await page.emulateMedia({media:'screen'});
 await page.setViewportSize({width:320,height:700});
 await page.addStyleTag({content:'html{font-size:200% !important}'});
 await page.goto(base+'#revision/u03_l05');await page.locator('.revision-entry').first().waitFor();
 await page.addStyleTag({content:'html{font-size:200% !important}'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'enlarged text');
 assert.deepEqual(errors,[]);
 console.log('Passed '+completed.length+' lesson tab checks, seven widths, two themes, bookmarks, global search, reload and history.');
}finally{await report();await browser.close();}
