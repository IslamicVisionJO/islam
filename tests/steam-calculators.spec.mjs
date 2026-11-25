import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto('http://127.0.0.1:4173/islam/#steam');
 await page.getByText('حاسبة الزكاة في الأردن',{exact:true}).click();
 async function run(kind,values,text){
  await page.locator('[data-zakat-category='+kind+']').click();
  const form=page.locator('#calc-'+kind);
  for(const [name,value] of Object.entries({year:'yes',...values})){
   const field=form.locator('[name='+name+']');
   if(await field.evaluate(el=>el.tagName==='SELECT'))await field.selectOption(value);
   else await field.fill(value);
  }
  await form.locator('button').click();
  assert.match(await form.locator('[role=status]').innerText(),text);
 }
 await run('gold',{gold18:'1.333',price:'1',nisab:'1'},/دون النصاب/);
 await run('gold',{gold18:'4',price:'1',nisab:'3'},/٠٫٠٧٥/);
 await run('gold',{year:'no'},/لم يكتمل الحول/);
 await run('zakat',{cash:'0',nisab:'4000'},/دون النصاب/);
 await run('zakat',{cash:'4000',nisab:'4000'},/١٠٠/);
 await run('shares',{shares:'500',shareValue:'2',nisab:'1000'},/٢٥/);
 await run('livestock',{animal:'camels',herd:'121'},/٣ × بنت لبون/);
 const herd=page.locator('[name=herd]');
 for(const value of ['-1','2.5','']){
  await herd.fill(value);
  await page.locator('#calc-livestock button').click();
  assert.equal(await herd.evaluate(el=>el.validity.valid),false);
  assert.equal(await page.locator('#calc-livestock [role=status]').innerText(),'');
 }
 await page.getByText('حاسبة المواريث',{exact:true}).click();
 const estate=page.locator('[data-steam-calc=estate]');
 for(const [name,v] of Object.entries({estate:'900',sons:'1',daughters:'1'}))await estate.locator('[name='+name+']').fill(v);
 await estate.locator('[name=other]').selectOption('no');
 await estate.locator('button').click();
 assert.match(await estate.locator('[role=status]').innerText(),/٦٠٠/);
 assert.match(await estate.locator('[role=status]').innerText(),/٣٠٠/);
 await estate.locator('[name=other]').selectOption('yes');
 await estate.locator('button').click();assert.equal(await estate.locator('li').count(),0);
 console.log('Calculator thresholds, precision, shares, livestock, invalid entries and estate checks passed');
}finally{await browser.close();}
