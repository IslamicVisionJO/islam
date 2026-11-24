import test from 'node:test';
import assert from 'node:assert/strict';
import { createDuelServer, ids } from '../../tests/helpers/duel-server.mjs';

test('academic guide edits require the existing admin and reject conflicting revisions',async()=>{
 const {db}=await createDuelServer({educationalFiles:['migrations/013_academic_lesson_guides.sql']});
 const as=(user,sql,args=[])=>db.transaction(async tx=>{
  await tx.exec(user?'set local role authenticated':'set local role anon');
  await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(user?{sub:user}:{})]);
  return (await tx.query(sql,args)).rows[0]?.result;
 });
 const lesson='academic-s1-u4-l07';
 const save=(user,revision,id=lesson)=>as(user,
  'select public.academic_guide_save($1,$2,$3,$4,$5)',[id,'نتاج التعلّم','شرح الدرس','التطبيق',revision]);
 const list=user=>as(user,'select public.academic_guide_list() as result');
 try{
  assert.deepEqual(await list(null),{});
  await assert.rejects(save(null,0),{code:'42501'});
  await assert.rejects(save(ids.host,0),{code:'42501'});
  await assert.rejects(save(ids.admin,0,'u01_l01'),{code:'23514'});
  await save(ids.admin,0);
  await assert.rejects(save(ids.admin,0),{code:'40001'});
  assert.equal((await list(ids.host))[lesson].revision,1);
  await save(ids.admin,1);
  assert.deepEqual((await list(null))[lesson],{outcome:'نتاج التعلّم',overview:'شرح الدرس',practice:'التطبيق',revision:2});
  await assert.rejects(as(ids.host,'select * from school_private.academic_lesson_guides'),{code:'42501'});
 }finally{
  await db.close();
 }
});
