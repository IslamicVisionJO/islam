import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDuelServer,ids} from '../../tests/helpers/duel-server.mjs';

test('STEAM stores multiple validated images and enforces every administrative operation on the database',async()=>{
 const {db}=await createDuelServer({educationalFiles:['migrations/007_steam_achievements.sql']});
 const call=async(role,user,sql,params=[])=>{
  await db.exec('begin; set local role '+role);
  try{
   await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(user?{sub:user}:{})]);
   return (await db.query(sql,params)).rows[0]?.v;
  }finally{await db.exec('rollback');}
 };
 const write=async(user,sql,params)=>{
  await db.exec('begin; set local role authenticated');
  try{
   await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user})]);
   const result=(await db.query(sql,params)).rows[0]?.v;
   await db.exec('commit');return result;
  }catch(error){await db.exec('rollback');throw error;}
 };
 const photo=(await readFile(new URL('../../tests/fixtures/steam-photo.jpg',import.meta.url))).toString('base64');
 const save='select public.steam_save($1,$2,$3,$4,$5,$6,$7) as v';
 const list='select public.steam_list($1) as v';
 const args=[null,'مشروع ترشيد الماء','قياس استهلاك الماء','2026-11-24','الفريق العلمي',false,JSON.stringify([photo,photo])];
 try{
  assert.deepEqual(await call('anon',null,list,[false]),[]);
  await assert.rejects(()=>call('anon',null,list,[true]),{code:'42501'});
  await assert.rejects(()=>write(ids.host,save,args),{code:'42501'});
  await assert.rejects(()=>call('anon',null,'select * from school_private.steam_achievements'),{code:'42501'});
  const id=await write(ids.admin,save,args);
  assert.equal((await call('authenticated',ids.admin,list,[true]))[0].images.length,2);
  assert.deepEqual(await call('anon',null,list,[false]),[]);
  await assert.rejects(()=>write(ids.admin,save,[...args.slice(0,6),'["iVBORw0KGgo="]']),/steam_invalid_image/);
  await assert.rejects(()=>write(ids.admin,save,[...args.slice(0,6),'["/9j/AAAAAAAD/9k="]']),/steam_invalid_image/);
  await write(ids.admin,save,[id,'عنوان محدّث',...args.slice(2,5),true,JSON.stringify([photo])]);
  const published=await call('anon',null,list,[false]);
  assert.equal(published[0].title,'عنوان محدّث');
  assert.deepEqual(published[0].images,[photo]);
  await assert.rejects(()=>write(ids.host,'select public.steam_delete($1)',[id]),{code:'42501'});
  await write(ids.admin,'select public.steam_delete($1)',[id]);
  assert.deepEqual(await call('anon',null,list,[false]),[]);
 }finally{await db.close();}
});
