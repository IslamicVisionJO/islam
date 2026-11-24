import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createDuelServer,ids} from '../../tests/helpers/duel-server.mjs';

test('online seed migration keeps new draws standalone and existing rooms intact',async()=>{
 const {db}=await createDuelServer();
 const read=file=>readFile(new URL('../../'+file,import.meta.url),'utf8');
 const accepted=vm.runInNewContext(await read('src/core.js')+'\n;isStandaloneGameQuestion');
 const migration=await read('supabase/migrations/010_standalone_game_questions.sql');
 try{
  const {rows:[room]}=await db.query(`insert into school_private.duel_rooms(code,host_id,host_name,questions)
   select 'ABCDEF',$1,'اختبار',jsonb_agg(question) from
   (select question from school_private.duel_questions where question->>'prompt' like '%الدرس%' limit 5) picked
   returning id,questions`,[ids.host]);
  assert.ok(room);
  await db.exec(migration);
  await db.exec(migration);
  const classic=(await db.query('select question from school_private.duel_questions')).rows.map(x=>({prompt:x.question.prompt,payload:{options:x.question.options}}));
  const activities=(await db.query('select game,data from school_private.educational_questions')).rows;
  assert.ok(classic.length>=5 && classic.every(accepted));
  assert.equal(new Set(activities.map(x=>x.game)).size,13);
  assert.ok(activities.every(x=>accepted(x.data)));
  assert.deepEqual((await db.query('select questions from school_private.duel_rooms where id=$1',[room.id])).rows[0].questions,room.questions);
  assert.ok((await db.query('select count(*)::int as n from school_private.game_context_archive')).rows[0].n>0);
 }finally{await db.close();}
});
