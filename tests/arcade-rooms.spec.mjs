import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createDuelServer,ids} from './helpers/duel-server.mjs';
import {simulation,loadGame,eventIndex} from '../public/arcade/replay.mjs';

const base=process.env.ARCADE_TEST_URL||'http://127.0.0.1:4173/islam/';
const {db,serialize}=await createDuelServer({educationalFiles:[]});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
async function rpc(uid,action,p={}){
 return serialize(()=>db.transaction(async tx=>{
  await tx.exec('set local role authenticated');
  await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:uid,session_id:'a'+uid.slice(1),amr:[{method:'password'}]})]);
  return (await tx.query('select public.arcade_room($1,$2::jsonb) v',[action,JSON.stringify(p)])).rows[0].v;
 }));
}
try{
 await db.exec('create role service_role');
 for(const name of ['014_arcade_rooms','015_arcade_bank'])await db.exec(await readFile('supabase/migrations/'+name+'.sql','utf8'));
 await assert.rejects(rpc(ids.guest,'admin',{}),/administrator_required/);
 for(const [game,mode] of [['blocks','versus'],['space','coop'],['tiles','versus'],['bubbles','versus']]){
  const args={game,mode,capacity:2,duration:45,level:'easy',lessons:['s1_u01_l01']};
  const ctxs=await Promise.all([browser.newContext(),browser.newContext()]);
  try{
   const pages=[];
   for(const [i,uid] of [ids.host,ids.guest].entries()){
    const page=await ctxs[i].newPage();pages.push(page);
    await page.exposeFunction('arcRpc',(name,args)=>rpc(uid,args.p_action,args.p_data));
    await page.goto(base+'arcade/bank.json');
    await page.evaluate(async ({args,uid})=>{
     document.body.innerHTML='<main></main>';
     const {openLobby}=await import('./online.mjs');
     await openLobby({container:document.querySelector('main'),rpc:window.arcRpc,verify:async()=>{},userId:uid,settings:args,onExit:()=>{}});
    },{args,uid});
   }
   const [a,b]=pages;
   await a.locator('[data-mode]').selectOption(mode);
   await a.locator('[data-act=create]').click();await a.locator('code').waitFor({timeout:8000});
   const code=await a.locator('code').textContent();await b.locator('[data-code]').fill(code);await b.locator('[data-act=join]').click();
   await a.locator('[data-act=ready]').click();await b.locator('[data-act=ready]').click();await Promise.all(pages.map(p=>p.locator('canvas').waitFor()));
   const rid=(await db.query('select id from school_private.arcade_rooms where code=$1',[code])).rows[0].id;
   await assert.rejects(rpc(ids.outsider,'state',{room:rid}));
   await db.query("update school_private.arcade_rooms set starts=now()-interval '2 seconds',deadline=now()+interval '43 seconds' where id=$1",[rid]);
   const action=game==='tiles'?'lane1':game==='space'?'fire':game==='blocks'?'drop':'shoot';
   await rpc(ids.host,'input',{room:rid,events:[{seq:1,tick:119,action,value:true}]});
   assert.equal((await rpc(ids.guest,'state',{room:rid})).events.length,1);
   await db.query("update school_private.arcade_rooms set starts=now()-interval '20 seconds' where id=$1",[rid]);
   const question=(await rpc(ids.guest,'state',{room:rid})).question;assert.ok(question);assert.ok(!Object.hasOwn(question,'correct'));
   for(const uid of [ids.host,ids.guest])await rpc(uid,'answer',{room:rid,index:0,choice:0});
   await db.query("update school_private.arcade_rooms set starts=now()-interval '48 seconds',deadline=now()-interval '3 seconds' where id=$1",[rid]);
   const state=await rpc(ids.host,'state',{room:rid});
   const sim=simulation(state,await loadGame(game));sim.advance(45*60,eventIndex(state.events),state.players);
   for(let n=0;n<2;n++)await db.query('select public.arcade_verify_commit($1,$2::jsonb)',[rid,JSON.stringify(state.players.map(p=>sim.score(p.slot)))]);
   await Promise.all(pages.map(p=>p.getByRole('heading',{name:'انتهت المباراة'}).waitFor()));
   assert.equal((await rpc(ids.host,'history')).filter(r=>r.id===rid).length,1);
   console.log('PASS two independent browser sessions:',game,mode);
  }finally{await Promise.all(ctxs.map(c=>c.close()));}
 }
}finally{await browser.close();await db.close();}
