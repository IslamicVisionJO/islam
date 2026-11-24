import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createDuelServer,ids} from '../../tests/helpers/duel-server.mjs';

test('two-player wall race shares a private pool and deadline, persists the outcome and keeps solo ranking separate',async()=>{
 const dir=new URL('../wall-seed/',import.meta.url);
 const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort();
 const {db}=await createDuelServer({educationalFiles:['migrations/011_wall_challenge.sql',...files.map(f=>'wall-seed/'+f),'migrations/012_wall_matches.sql']});
 const sql='select public.wall_match($1,$2,$3,$4,$5,$6,$7,$8,$9) as value';
 async function run(owner,query,args=[]){
  await db.exec('begin;set local role '+(owner?'authenticated':'anon'));
  try{
   await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(owner?{sub:owner}:{})]);
   const result=(await db.query(query,args)).rows[0]?.value;
   await db.exec('commit');return result;
  }catch(error){await db.exec('rollback');throw error;}
 }
 const match=(owner,action,{id=null,code=null,level='hard',unit='u01',lesson='u01_l01',move='state',question=null,option=null}={})=>
  run(owner,sql,[action,id,code,level,unit,lesson,move,question,option]);
 try{
  await db.exec(await readFile(new URL('../migrations/012_wall_matches.sql',import.meta.url),'utf8'));
  await assert.rejects(()=>match(null,'create'),{code:'42501'});
  let room=await match(ids.host,'create');const {id,code}=room;
  assert.match(code,/^[0-9A-F]{8}$/);assert.equal(room.round,null);
  await assert.rejects(()=>match(ids.host,'join',{code}),/wall_match_already_open/);
  await assert.rejects(()=>match(ids.outsider,'state',{id}),{code:'42501'});
  await assert.rejects(()=>run(ids.host,"select public.wall_start('easy','all','all') as value"),/wall_match_already_open/);
  const guest=await match(ids.guest,'join',{code});
  room=await match(ids.host,'state',{id});
  assert.equal(room.status,'active');assert.equal(room.deadline,guest.deadline);
  assert.deepEqual(room.round.question,guest.round.question);
  assert.equal(room.round.question.lesson_id,'u01_l01');
  assert.ok(!Object.hasOwn(room.round.question,'correct_id')&&!Object.hasOwn(room.round.question,'explanation'));
  await assert.rejects(()=>run(ids.host,"select public.wall_act($1,'pause') as value",[room.round.id]),{code:'42501'});
  await assert.rejects(()=>match(ids.host,'play',{id,move:'pause'}),/wall_invalid_action/);
  const {rows:[key]}=await db.query("select questions->0->>'correct_id' as correct from school_private.wall_matches where id=$1",[id]);
  const q=room.round.question;
  const wrong=q.options.find(o=>o.id!==key.correct).id;
  await db.query("update school_private.wall_rounds set mark=clock_timestamp()-interval '1 second' where match_id=$1",[id]);
  const a=await match(ids.host,'play',{id,move:'answer',question:q.id,option:key.correct});
  const b=await match(ids.guest,'play',{id,move:'answer',question:q.id,option:wrong});
  assert.equal(a.round.score,100);assert.equal(b.round.score,0);assert.equal(b.opponentScore,100);
  assert.equal((await match(ids.host,'play',{id,move:'answer',question:q.id,option:key.correct})).round.score,100);
  await db.query("update school_private.wall_matches set deadline=clock_timestamp()-interval '1 second' where id=$1",[id]);
  room=await match(ids.host,'state',{id});
  assert.equal(room.status,'completed');assert.equal(room.winner,'you');assert.equal(room.reason,'timeout');
  assert.equal((await match(ids.guest,'state',{id})).winner,'opponent');
  assert.deepEqual(await run(null,"select public.wall_board('all') as value"),[]);
  room=await match(ids.host,'create');await match(ids.guest,'join',{code:room.code});
  const left=await match(ids.host,'leave',{id:room.id});
  assert.equal(left.winner,'opponent');assert.equal(left.reason,'forfeit');
  assert.equal((await match(ids.guest,'state',{id:room.id})).winner,'you');
  const solo=await run(ids.host,"select public.wall_start('easy','u01','u01_l01') as value");
  assert.ok(solo.question);
  assert.equal((await run(ids.host,"select public.wall_act($1,'pause') as value",[solo.id])).phase,'paused');
 }finally{await db.close();}
});
