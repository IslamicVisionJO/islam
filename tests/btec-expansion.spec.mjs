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
  await page.locator('.learning-units [data-id=btec1]').click();
  await page.locator('.learning-units [data-id=s1_u04]').click();
  await page.locator('[data-learning=open][data-id=s1_u04_l07]').click();
  await page.locator('[data-learning=tab][data-id=quiz]').click();
  await page.reload();
  await page.getByText('أسئلة هذا الدرس بانتظار المراجعة العلمية والاعتماد.').waitFor();
  await page.locator('[data-learning=tab][data-id=revision]').click();
  await page.getByRole('button',{name:'راجع هذا الدرس في المكثف'}).click();
  const drawStatus=page.locator('#revision-status');
  await page.waitForFunction(()=>document.querySelector('#revision-status')?.textContent.startsWith('صفحة '),null,{timeout:15000});
  assert.match(await page.locator('canvas').getAttribute('aria-label'),/٢٩/);
  await page.getByRole('button',{name:'السنة الثانية BTEC',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#revision-status')?.textContent.startsWith('صفحة '),null,{timeout:15000});
  assert.match(await page.locator('canvas').getAttribute('aria-label'),/٣٥/);
  await page.locator('[data-revision=larger]').click();
  await page.waitForFunction(()=>document.querySelector('.revision-sheet').scrollWidth>document.querySelector('.revision-sheet').clientWidth);
  await page.locator('[data-revision=smaller]').click();
  await page.locator('[data-revision=fullscreen]').click();
  await page.waitForFunction(()=>document.fullscreenElement===document.documentElement);
  await page.locator('.revision-controls [data-revision-page="36"]').click();
  assert.equal(await page.evaluate(()=>document.fullscreenElement===document.documentElement),true);
  await page.locator('[data-revision=fullscreen]').click();
  await page.waitForFunction(()=>!document.fullscreenElement);
  await page.getByRole('button',{name:'السنة الثانية BTEC',exact:true}).click();
  await page.locator('#revision-query').fill('الشبهات');
  await page.locator('#revision-search button').click();
  await page.locator('#revision-matches button[data-revision-page="6"]').waitFor({timeout:15000});
  await page.locator('.sidebar [data-page=stats]').click();
  await page.getByRole('region',{name:'تقدم مشاهدة الدروس'}).getByRole('heading',{name:'السنة الأولى BTEC'}).waitFor();
  await page.locator('.sidebar [data-page=revision]').click();
  assert.match(page.url(),/#revision\/35$/);
  const studyGroup=page.locator('.sidebar [data-nav-group=study]');
  await studyGroup.locator('summary').click();
  assert.equal(await studyGroup.getAttribute('open'),null);
  await studyGroup.locator('summary').click();
  await page.locator('[data-action=sidebar-compact]').click();
  assert.equal(await page.locator('.sidebar-compact').count(),1);
  await page.locator('[data-action=sidebar-compact]').click();
  await page.setViewportSize({width:390,height:840});
  await page.reload();
  await drawStatus.waitFor();
  await page.waitForFunction(()=>document.querySelector('#revision-status')?.textContent.startsWith('صفحة '));
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
  console.log('PASS: 8 units and 51 lesson cards, first-year draft isolated, mobile and desktop PDF rendering, PDF search and deep links.');
} finally {
  await browser.close();
}
