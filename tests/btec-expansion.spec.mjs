import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin = 'http://127.0.0.1:4173/islam/';
const reviewOrigin = 'http://127.0.0.1:4174/islam/';
const fixture = await readFile('tests/fixtures/authorized-account.js', 'utf8');
const browser = await chromium.launch({executablePath:'/usr/bin/chromium', args:['--no-sandbox']});

try {
  assert.equal((await fetch(origin+'first-btec-review/s1_u01_l01.json')).status, 404);
  const pdf = await fetch(origin+'content/BTEC_Islamic_Education_Revision.pdf',{headers:{Range:'bytes=0-7'}});
  assert.equal(pdf.status,206);
  assert.equal(pdf.headers.get('content-type'),'application/pdf');
  assert.match(await pdf.text(),/^%PDF-/);
  const context = await browser.newContext({viewport:{width:1360,height:920}});
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',er=>errors.push(er.message));
  await page.route(url=>url.href===origin||url.href===reviewOrigin,async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace('startApplication();',fixture+'\nstartApplication();')});
  });
  await page.goto(origin);
  await page.waitForFunction(()=>S.ready);
  assert.equal(await page.locator('.sidebar [data-page=revision]').count(),1);
  assert.equal(await page.locator('.sidebar [data-page=compendium]').count(),0);
  await page.goto(origin+'#compendium');
  await page.getByRole('heading',{name:'المكثف الشامل',exact:true}).waitFor();
  assert.match(page.url(),/#revision\/s1_u01_l01$/);
  await page.locator('.sidebar [data-page=units]').click();
  for(const [year, prefix, counts] of [['btec1','s1_',[6,6,6,7]],['btec2','',[6,7,7,6]]]){
    await page.locator(`.learning-units [data-id=${year}]`).click();
    assert.equal(await page.locator('.learning-units [data-learning=unit]').count(),4);
    for(const [index,count] of counts.entries()){
      const unit=`${prefix}u0${index+1}`;
      await page.locator(`.learning-units [data-id="${unit}"]`).click();
      const cards=page.locator('.learning-units article button');
      assert.equal(await cards.count(),count);
      for(const card of await cards.all()){
        const id=await card.getAttribute('data-id')||await card.getAttribute('data-lesson');
        assert.ok(id.startsWith(unit+'_l'));
      }
      if(index===0){
        await page.reload();
        await cards.first().waitFor();
        await cards.first().click();
        assert.equal(await page.locator('[data-mode=training][data-action=setup]').count(),3);
        await page.getByRole('button',{name:'أسئلة الوحدة',exact:true}).click();
        assert.equal(await cards.count(),count);
      }
      await page.locator('.learning-trail [data-learning=year]').click();
    }
    await page.locator('.learning-trail [data-learning=catalog]').click();
  }
  await page.locator('.sidebar [data-page=learning]').click();
  assert.equal(await page.locator('.learning-units [data-learning=year]').count(),2);
  for(const [year, counts] of [['btec1',[6,6,6,7]],['btec2',[6,7,7,6]]]){
    await page.locator(`.learning-units [data-id=${year}]`).click();
    assert.equal(await page.locator('.learning-units [data-learning=unit]').count(),4);
    for(const [index,count] of counts.entries()){
      await page.locator('.learning-units [data-learning=unit]').nth(index).click();
      assert.equal(await page.locator('.learning-units [data-learning=open]').count(), count);
      await page.locator('.learning-trail [data-learning=year]').click();
    }
    await page.locator('.learning-trail [data-learning=catalog]').click();
  }
  const firstBtecIds=await page.evaluate(()=>FIRST_BTEC_LESSONS.flatMap(unit=>unit.lessons.map(lesson=>lesson.id)));
  assert.equal(firstBtecIds.length,25);
  for(const [index,id] of firstBtecIds.entries()){
    const source=origin+'videos/first-btec/'+id+'.mp4';
    const range=await fetch(source,{headers:{Range:'bytes=0-31'}});
    assert.equal(range.status,206,id);
    assert.equal(range.headers.get('content-type'),'video/mp4',id);
    assert.equal((await range.arrayBuffer()).byteLength,32,id);
    if(index===12)await page.setViewportSize({width:390,height:840});
    await page.evaluate(id=>Learning.open(id,"video"),id);
    const video=page.locator('#lesson-video');
    assert.equal(await video.getAttribute('src'),source,id);
    assert.equal(await video.getAttribute('preload'),'none',id);
    await video.evaluate(async v=>{v.muted=true;await v.play();});
    await page.waitForFunction(min=>document.querySelector('#lesson-video')?.currentTime>min,index===0?1:0);
    await video.evaluate(v=>v.pause());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),id);
    if(index===0){
      await page.waitForFunction(id=>(S.profile.learning?.[id]?.position>=1) && S.profile.learning?.[id]?.ranges?.length>0,id);
      const position=await page.evaluate(id=>S.profile.learning[id].position,id);
      await page.reload();
      await video.evaluate(v=>v.load());
      await page.waitForFunction(saved=>{
        const player=document.querySelector('#lesson-video');
        return player?.readyState>=2 && Math.abs(player.currentTime-saved)<0.2;
      },position);
    }
  }
  await page.setViewportSize({width:1360,height:920});
  await page.locator('.sidebar [data-page=learning]').click();
  await page.locator('.learning-units [data-id=btec1]').click();
  await page.locator('.learning-units [data-id=s1_u04]').click();
  await page.locator('[data-learning=open][data-id=s1_u04_l07]').click();
  assert.equal(await page.locator('[role=tab][data-id=quiz]').count(),0);
  await page.reload();
  await page.getByRole('heading',{name:'شرح الدرس',exact:true}).waitFor();
  await page.locator('[data-learning=tab][data-id=revision]').click();
  await page.getByRole('link',{name:'راجع هذا الدرس في المكثف'}).click();
  const firstRow=page.locator('#rev-results .revision-entry').first();
  await firstRow.waitFor();
  assert.equal(await page.locator('#rev-lesson').inputValue(),'s1_u04_l07');
  await page.locator('#rev-term').selectOption('2');
  await firstRow.waitFor();
  assert.equal(await page.locator('#rev-lesson').inputValue(),'u01_l01');
  for(const path of ['full','semester-1','semester-2']){
    const res=await fetch(origin+'revision-downloads/'+path+'.pdf',{headers:{Range:'bytes=0-7'}});
    assert.equal(res.status,206);assert.match(await res.text(),/^%PDF-/);
  }
  await page.locator('[name=scope]').selectOption('all');
  await page.locator('[name=query]').fill('الشبهات');
  await page.locator('#revision-search button').click();
  await page.locator('#rev-results h2 a[href="#revision/s1_u01_l02"]').first().waitFor();
  await page.locator('.sidebar [data-page=stats]').click();
  await page.getByRole('region',{name:'تقدم مشاهدة الدروس'}).getByRole('heading',{name:'السنة الأولى BTEC'}).waitFor();
  await page.locator('.sidebar [data-page=revision]').click();
  assert.match(page.url(),/#revision\/u01_l01$/);
  const studyGroup=page.locator('.sidebar [data-nav-group=study]');
  await studyGroup.locator('summary').click();
  assert.equal(await studyGroup.getAttribute('open'),null);
  await studyGroup.locator('summary').click();
  await page.locator('[data-action=sidebar-compact]').click();
  assert.equal(await page.locator('.sidebar-compact').count(),1);
  await page.locator('[data-action=sidebar-compact]').click();
  await page.setViewportSize({width:390,height:840});
  await page.reload();
  await firstRow.waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('.mobile-bottom [data-page=units]').click();
  await page.locator('.learning-units [data-id=btec2]').click();
  await page.locator('.learning-units [data-id=u02]').click();
  assert.equal(await page.locator('.learning-units [data-action=lesson]').count(),7);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('[data-action=menu]').first().click();
  await page.locator('.sidebar [data-page=learning]').click();
  assert.ok(await page.getByRole('button',{name:/متابعة آخر درس/}).isVisible());
  assert.equal(await page.locator('.sidebar [data-nav-group=admin]').count(),0);
  await page.goto(reviewOrigin+'#learning/btec1/s1_u01_l01/quiz');
  await page.locator('[data-learning=review-answer]').first().waitFor();
  assert.equal(await page.locator('[data-learning=review-answer]').count(),4);
  assert.equal(await page.locator('.learning-panel [role=status]').count(),0);
  await page.locator('[data-learning=review-answer]').first().click();
  await page.locator('.learning-panel [role=status]').getByText(/مرجع الكتاب/).waitFor();
  await page.locator('#first-btec-level').selectOption('hard');
  assert.equal(await page.locator('.learning-panel [role=status]').count(),0);
  await page.locator('#first-btec-level').selectOption('games');
  await page.getByText('الإجابة المرجعية في المسودة').click();
  assert.ok(await page.getByText(/مرجع الكتاب/).isVisible());
  assert.deepEqual(errors,[]);
  console.log('PASS: single compendium entry, 8 question units split by year, 51 lesson cards, 25 first-year MP4 videos and resume verified, first-year draft isolated, HTML reader, PDF downloads, cross-semester search and deep links.');
} finally {
  await browser.close();
}
