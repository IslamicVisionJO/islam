import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDuelServer,ids} from '../../tests/helpers/duel-server.mjs';

test('source-scoped rooms preserve legacy rooms and isolate years, grading and answer keys',async()=>{
 const server=await createDuelServer();
 const host=server.users.find(u=>u.id===ids.host),guest=server.users.find(u=>u.id===ids.guest);
 const call=async(user,name,args)=>{const r=await server.call({user,name,args});if(r.error)throw Error(r.error.message);return r.data;};
 const settings=(unit,lesson)=>({p_game:0,p_unit:unit,p_lesson:lesson,p_seconds:60});
 try{
  const prior=await call(host,'educational_duel_create',settings('all','all'));
  const sql=await readFile('supabase/migrations/014_scoped_educational_rooms.sql','utf8');
  await server.db.exec(sql);
  await server.db.exec(sql);
  assert.deepEqual((await call(host,'duel_state',{p_room_id:prior.id})).activity.ids,prior.activity.ids);
  await call(guest,'duel_join',{p_code:prior.code});
  for(const user of [host,guest])await call(user,'educational_duel_finish',{p_room_id:prior.id});
  for(const [unit,lesson] of [['all','s1_u01_l01'],['s1_all','u01_l01']])await assert.rejects(call(host,'educational_duel_create',settings(unit,lesson)),/invalid_activity_settings/);
  await assert.rejects(call(host,'educational_duel_create',settings('s1_u01','s1_u01_l02')),/activity_content_unavailable/);
  for(const [unit,lesson] of [['s1_all','s1_u01_l01'],['all','all']]){
   const room=await call(host,'educational_duel_create',settings(unit,lesson));
   assert.equal(new Set(room.activity.ids).size,15);
   assert.ok(room.activity.ids.every(id=>id.startsWith('s1_')===(unit==='s1_all')));
   const joined=await call(guest,'duel_join',{p_code:room.code});
   assert.deepEqual(joined.activity.ids,room.activity.ids);
   assert.ok(!JSON.stringify(joined).includes('"option_id"'));
   const qs=(await server.db.query('select questions from school_private.duel_rooms where id=$1',[room.id])).rows[0].questions;
   assert.deepEqual(qs.map(q=>q.difficulty),['easy','medium','hard'].flatMap(d=>Array(5).fill(d)));
   for(const user of [host,guest]){
    const result=await call(user,'duel_answer',{p_room_id:room.id,p_question_id:qs[0].id,p_answer:{answer:qs[0].answer.option_id}});
    assert.equal(result.me.receipts[0].correct,true);
    await call(user,'educational_duel_finish',{p_room_id:room.id});
   }
  }
 }finally{await server.db.close();}
});
