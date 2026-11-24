import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDuelServer,ids} from '../../tests/helpers/duel-server.mjs';

test('restrict the online seed without altering any stored millionaire round',async()=>{
 const {db}=await createDuelServer({educationalFiles:['migrations/005_educational_online.sql','migrations/006_million_rewards.sql']});
 const migration=await readFile(new URL('../migrations/009_exclude_unverified_million_seed.sql',import.meta.url),'utf8');
 try{
  const seedCount=async()=> (await db.query('select count(*)::int as n from school_private.educational_questions')).rows[0].n;
  const before=await seedCount();
  const {rows:[round]}=await db.query(`insert into school_private.million_sessions(user_id,questions)
   select $1,jsonb_build_array(data) from school_private.educational_questions where game=0 and id='u03_l06_q036'
   returning id,questions`,[ids.host]);
  assert.ok(round);
  await db.exec(migration);
  await db.exec(migration);
  assert.equal(await seedCount(),before-1);
  assert.deepEqual((await db.query('select questions from school_private.million_sessions where id=$1',[round.id])).rows[0].questions,round.questions);
 }finally{await db.close();}
});
