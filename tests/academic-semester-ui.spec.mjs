import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const url=process.env.TEST_BASE_URL||'http://127.0.0.1:4173';
const fixture=await readFile(new URL('./fixtures/authorized-account.js',import.meta.url),'utf8');
const browser=await chromium.launch({
 executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
 args:['--no-sandbox','--disable-dev-shm-usage']
});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  if(route.request().resourceType()!=='document'||!route.request().url().startsWith(url))return route.continue();
  const response=await route.fetch();
  await route.fulfill({response,body:(await response.text()).replace('startApplication();',fixture+'\nstartApplication();')});
 });
 const catalog=()=>page.goto(url+'/#academic/s1');
 await catalog();
 await page.getByRole('heading',{name:'الفصل الدراسي الأول',exact:true}).waitFor();
 assert.equal(await page.locator('.academic-lessons a[href$="/lesson"]').count(),25);
 const first='academic-s1-u1-l01';
 await page.locator(`a[href$="/${first}/lesson"]`).click();
 await page.getByRole('button',{name:'تسجيل إكمال الدرس'}).click();
 await page.getByText('اكتمل الدرس',{exact:true}).waitFor();
 await page.getByRole('link',{name:'حلول الكتاب',exact:true}).click();
 await page.locator('.academic-semester .book-answer').first().waitFor();
 assert.equal(await page.locator('.academic-semester .book-answer').count(),16);
 await page.locator('#academic-search').fill('المؤاخاة');
 assert.ok(await page.locator('.academic-semester .book-answer:visible').count()<16);
 await page.locator('#academic-search').fill('لا توجد نتيجة لهذا البحث');
 await page.getByText('لا توجد نتائج مطابقة.').waitFor();
 await page.emulateMedia({media:'print'});
 assert.equal(await page.locator('.academic-semester .book-answer:visible').count(),16);
 await page.emulateMedia({media:'screen'});
 await page.getByRole('link',{name:'البطاقات التعليمية',exact:true}).click();
 await page.getByRole('button',{name:'اقلب البطاقة'}).click();
 await page.getByRole('button',{name:'أعرف الإجابة'}).click();
 await page.getByRole('button',{name:'اقلب البطاقة'}).waitFor();
 await page.getByRole('button',{name:'اختبار الدرس',exact:true}).click();
 assert.equal(await page.locator('[data-academic="answer"]').count(),4);
 assert.equal(await page.getByText('الإجابة الصحيحة:',{exact:false}).count(),0);
 await page.locator('[data-academic="answer"][data-value="0"]').click();
 await page.getByRole('button',{name:'التالي',exact:true}).click();
 await page.locator('[data-academic="answer"][data-value="1"]').click();
 await page.getByRole('button',{name:'التالي',exact:true}).click();
 await page.locator('[data-academic="answer"][data-value="0"]').click();
 await page.getByRole('button',{name:'تسليم الاختبار'}).click();
 await page.getByText(/النتيجة ٢ من ٣/).waitFor();
 await page.reload();
 await page.waitForFunction(id=>{
  const progress=globalThis.S?.profile?.academicSemesterOne
    ?? (typeof S!=='undefined'?S.profile.academicSemesterOne:null);
  return progress?.completed[id]&&Object.keys(progress.cards).length===1
    &&progress.attempts.length===1&&Object.keys(progress.mistakes).length===1;
 },first);
 await page.getByRole('link',{name:'الحفظ والتسميع',exact:true}).click();
 await page.getByRole('button',{name:'رتّب الكلمات'}).first().click();
 for(const item of [0,1,2,3,4])await page.locator(`[data-academic="pick-word"][data-value="${item}"]`).click();
 await page.getByRole('button',{name:'تحقق',exact:true}).click();
 await page.getByText('أحسنت',{exact:true}).waitFor();
 await page.locator('.learning-trail a').click();
 await page.getByRole('button',{name:'رتّب أحداث مؤتة'}).click();
 for(const item of [0,1,2,3,4])await page.locator(`[data-academic="pick-event"][data-value="${item}"]`).click();
 await page.getByText('الترتيب صحيح.').waitFor();
 await page.getByRole('button',{name:'العودة',exact:true}).click();
 await page.getByRole('button',{name:'الذاكرة والمطابقة'}).click();
 for(const item of [0,1,2,3]){
  await page.locator(`[data-academic="choose-pair"][data-value="${item}"]`).click();
  await page.locator(`[data-academic="match-pair"][data-value="${item}"]`).click();
 }
 await page.getByText('أكملت جميع المطابقات.').waitFor();
 await page.getByRole('button',{name:'العودة',exact:true}).click();
 for(const mode of ['wall','knowledge','error','speed']){
  await page.locator('#academic-quiz-form [name="mode"]').selectOption(mode);
  await page.locator('#academic-quiz-form [name="count"]').fill('1');
  await page.getByRole('button',{name:'ابدأ',exact:true}).click();
  if(mode==='knowledge')await page.getByRole('button',{name:'احذف خيارين'}).click();
  await page.locator('[data-academic="answer"][data-value="0"]').click();
  await page.getByText(/النتيجة ١ من ١/).waitFor();
  await page.getByRole('button',{name:'العودة',exact:true}).click();
 }
 await page.evaluate(()=>{
  const fixture=globalThis.__authorizedAccountFixture;
  fixture.identity.isAdmin=true;
  Auth.adminRoster=async()=>[];
  const guides={};
  Auth.knowledgeRpc=async(name,args)=>{
   if(name==='academic_guide_list')return structuredClone(guides);
   if(name==='academic_guide_save'){
    guides[args.p_lesson_id]={outcome:args.p_outcome,overview:args.p_overview,practice:args.p_practice,revision:1};
    return;
   }
   throw Error('Unexpected test RPC');
  };
  render();
 });
 await page.locator('.mobile-menu').click();
 await page.locator('[data-action="navigate"][data-page="admin"]').click();
 await page.getByRole('button',{name:'شروحات الفصل الأول',exact:true}).click();
 await page.locator('#academic-guide-form textarea[name="overview"]').fill('شرح أضيف عبر اختبار الإدارة المحلي');
 await page.getByRole('button',{name:'حفظ الشرح المنشور'}).click();
 await page.getByText('حُفظ الشرح المنشور.').waitFor();
 await page.locator('.mobile-menu').click();
 await page.locator('.sidebar [data-action="navigate"][data-page="academic-semester"]').click();
 await page.locator(`a[href$="/${first}/lesson"]`).click();
 await page.getByText('شرح أضيف عبر اختبار الإدارة المحلي',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('Passed: academic catalog, solutions, cards, account reload, quiz scoring, memorization and six game modes.');
}finally{
 await browser.close();
}
