import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import {createServer} from 'node:http';
const src=await readFile(new URL('../src/arcade-games.js',import.meta.url),'utf8');
const server=createServer((req,res)=>{res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html dir="rtl"><body><main id="catalog"></main></body></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const results=[];
try {
 browser=await chromium.launch({headless:true});
 for (const size of [{width:390,height:844},{width:1440,height:900}]){
  const page=await browser.newPage({viewport:size,hasTouch:size.width<500});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.addScriptTag({content:"const e=s=>String(s);const S={valid:Array.from({length:8},(_,i)=>({id:'q'+i,unit_id:'u',lesson_id:'l',difficulty:'easy',type:'multiple_choice',prompt:'سؤال اختبار '+i,payload:{options:['a','b','c','d'].map(id=>({id,text:id}))},answer:{option_id:'a'},explanation:'تفسير اختباري',source:{printed_pages:[7]},review:{answer_checked:true,source_checked:true}}))};const EducationalContent={pool:b=>b};const firstScope=()=>false,isStandaloneGameQuestion=()=>true,storageScope=()=> 'guest',notify=()=>{};"});
  await page.addScriptTag({content:src});
  await page.evaluate(()=>document.querySelector('#catalog').innerHTML=ArcadeGames.cards(S.valid,'u','l'));
  for(let kind=0;kind<4;kind++){
   await page.locator('[data-arcade="'+kind+'"]').click();
   const dialog=page.locator('dialog.arcade-dialog');
   assert.equal(await dialog.isVisible(),true);
   await dialog.locator('[data-ac=start]').click();
   const question=dialog.locator('[data-question]');
   await question.waitFor({state:'visible'});
   assert.equal(await question.locator('button').count(),4);
   await question.locator('button').filter({hasText:/\. a$/}).click();
   assert.match(await question.innerText(),/إجابة صحيحة/);
   await question.getByRole('button',{name:'متابعة اللعب'}).click();
   const canvas=dialog.locator('canvas');
   await canvas.waitFor({state:'visible'});
   await page.waitForFunction(()=>{const c=document.querySelector('dialog canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=4;i<d.length;i+=4){if(d[i]!==d[0]||d[i+1]!==d[1]||d[i+2]!==d[2])return true;}return false;});
   const box=await canvas.boundingBox();
   assert.ok(box.width>0&&box.height>0&&box.x>=0&&box.x+box.width<=size.width+1);
   if(kind===0){await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowDown');}
   if(kind===1){await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');}
   if(kind===2){await canvas.click({position:{x:box.width/2,y:box.height/4}});}
   if(kind===3){await page.keyboard.press('d');}
   await dialog.locator('[data-ac=pause]').click();
   assert.match(await dialog.locator('[data-ac=pause]').innerText(),/استئناف/);
   await dialog.locator('[data-ac=pause]').click();
   await dialog.locator('[data-ac=close]').click();
   assert.equal(await dialog.count(),0);
   assert.deepEqual(errors,[]);
   results.push({width:size.width,kind,pass:true});
  }
  await page.close();
 }
 console.log(JSON.stringify(results,null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
