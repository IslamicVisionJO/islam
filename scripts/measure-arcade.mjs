import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto((process.env.ARCADE_TEST_URL||'http://127.0.0.1:4173/islam/')+'arcade/bank.json');
 const result=await page.evaluate(async()=>{
  const {random}=await import('./core.mjs');const measurements=[];
  for(const id of ['blocks','space','bubbles','tiles']){
   const {createGame}=await import('./'+id+'.mjs');
   document.body.replaceChildren();const canvas=document.createElement('canvas');canvas.width=360;canvas.height=480;document.body.append(canvas);
   const ctx=canvas.getContext('2d'),g=createGame({level:'medium',rng:random(144)}),samples=[];
   for(let i=0;i<100;i++){
    await new Promise(requestAnimationFrame);const start=performance.now();g.step(1/60);g.draw(ctx,360,480);samples.push(performance.now()-start);
   }
   samples.sort((a,b)=>a-b);measurements.push({game:id,medianMs:samples[50],p95Ms:samples[95]});
  }
  return measurements;
 });
 console.log(JSON.stringify(result));await writeFile('ARCADE_PERFORMANCE.json',JSON.stringify({method:'Chromium headless, 390x844 viewport, 360x480 canvas, 100 animation frames per game; simulation plus Canvas command submission',measurements:result},null,2)+'\n');
}finally{await browser.close();}
