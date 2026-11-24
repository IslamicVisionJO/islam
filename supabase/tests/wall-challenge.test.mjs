import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createDuelServer,ids} from '../../tests/helpers/duel-server.mjs';

test('wall service checks identity, seals answer keys, scores and persists ranking',async()=>{
 const seed=(await readdir(new URL('../wall-seed/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort();
 const {db}=await createDuelServer({educationalFiles:['migrations/011_wall_challenge.sql',...seed.map(f=>'wall-seed/'+f)]});
 async function call(role,id,sql,args=[]){
  await db.exec('begin;set local role '+role);
  try{
   await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(id?{sub:id}:{})]);
   const result=(await db.query(sql,args)).rows[0]?.value;
   await db.exec('commit');
   return result;
  }catch(error){await db.exec('rollback');throw error;}
 }
 const board=()=>call('anon',null,"select public.wall_board('all') as value");
 const action=(owner,id,name,q=null,o=null)=>call('authenticated',owner,'select public.wall_act($1,$2,$3,$4) as value',[id,name,q,o]);
 const admin=(owner,name,data={})=>call('authenticated',owner,'select public.wall_admin($1,$2) as value',[name,JSON.stringify(data)]);
 try{
  assert.deepEqual(await board(),[]);
  await assert.rejects(()=>call('authenticated',ids.host,'select * from school_private.wall_questions'),{code:'42501'});
  await assert.rejects(()=>admin(ids.host,'questions'),{code:'42501'});
  await assert.rejects(()=>call('anon',null,"select public.wall_start('easy','all','all')"),{code:'42501'});
  const questions=await admin(ids.admin,'questions');
  assert.equal(questions.length,605);
  assert.equal(new Set(questions.map(q=>q.lesson_id)).size,26);
  const data={lesson_id:'u01_l01',difficulty:'hard',prompt:'أي وصف يوضح سعة ملك الله؟',
   explanation:'توضح الآية ملك الله للسماوات والأرض.',page:7,enabled:false,
   options:['يشمل السماوات والأرض','يقتصر على الأرض','يقتصر على السماء','يقتصر على جزء من الأرض'].map((text,i)=>({id:String(i+1),text})),correct_id:'1'};
  await admin(ids.admin,'save',data);
  const custom=(await admin(ids.admin,'questions')).find(q=>q.prompt===data.prompt&&q.id.startsWith('custom-'));
  assert.ok(custom&&!custom.enabled);
  await assert.rejects(()=>admin(ids.admin,'save',{...data,page:180}),/wall_invalid_fields/);
  await admin(ids.admin,'save',{...data,id:custom.id,enabled:true});
  assert.equal((await admin(ids.admin,'questions')).find(q=>q.id===custom.id).enabled,true);
  await admin(ids.admin,'delete',{id:custom.id});
  assert.equal((await admin(ids.admin,'questions')).length,605);
  const r=await call('authenticated',ids.host,"select public.wall_start('hard','u01','u01_l01') as value");
  assert.ok(r.delay>0);
  assert.ok(!Object.hasOwn(r.question,'correct_id')&&!Object.hasOwn(r.question,'explanation'));
  assert.ok(r.question.options.length===4&&r.question.lesson_id==='u01_l01');
  const keys=new Map(questions.map(q=>[q.id,q]));
  await assert.rejects(()=>action(ids.guest,r.id,'state'),{code:'42501'});
  const tooEarly=await action(ids.host,r.id,'answer',r.question.id,keys.get(r.question.id).correct_id);
  assert.equal(tooEarly.score,0);
  await db.query("update school_private.wall_rounds set mark=clock_timestamp()-interval '1 second' where id=$1",[r.id]);
  let state=await action(ids.host,r.id,'answer',r.question.id,keys.get(r.question.id).correct_id);
  assert.equal(state.score,100);
  assert.equal(state.phase,'feedback');
  assert.equal(state.question,null);
  assert.ok(state.feedback.correct&&state.feedback.explanation);
  assert.equal((await action(ids.host,r.id,'answer',r.question.id,keys.get(r.question.id).correct_id)).score,100);
  state=await action(ids.host,r.id,'next');
  assert.notEqual(state.question.id,r.question.id);
  state=await action(ids.host,r.id,'pause');
  assert.equal(state.phase,'paused');assert.equal(state.question,null);
  assert.equal((await action(ids.host,r.id,'resume')).phase,'playing');
  assert.equal((await action(ids.host,null,'state')).id,r.id);
  await db.query("update school_private.wall_rounds set mark=clock_timestamp()-interval '1 minute' where id=$1",[r.id]);
  state=await action(ids.host,r.id,'state');
  assert.equal(state.reason,'danger');assert.equal(state.personalBest,100);
  assert.equal((await board())[0].score,100);
  for(const period of ['day','week','all']){
   const [row]=await call('anon',null,'select public.wall_board($1) as value',[period]);
   assert.deepEqual(Object.keys(row).sort(),['accuracy','elapsed','name','rank','score']);
  }
  await assert.rejects(()=>admin(ids.guest,'visibility',{id:r.id,hidden:true}),{code:'42501'});
  await admin(ids.admin,'visibility',{id:r.id,hidden:true});
  assert.deepEqual(await board(),[]);
  await admin(ids.admin,'visibility',{id:r.id,hidden:false});
  assert.equal((await board())[0].score,100);
 }finally{await db.close();}
});
