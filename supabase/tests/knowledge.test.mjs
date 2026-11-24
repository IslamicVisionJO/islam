import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import { createDuelServer, ids } from '../../tests/helpers/duel-server.mjs';

const file = 'migrations/007_knowledge.sql';
const fixture = async (path, mime) => ({
  mime,
  data: (await readFile(new URL('../../' + path, import.meta.url))).toString('base64')
});

test('knowledge publishing, gallery integrity, storage and access', async t => {
  const { db } = await createDuelServer({ educationalFiles: [file] });
  const as = async (user, sql, args = []) => db.transaction(async tx => {
    await tx.exec(user ? 'set local role authenticated' : 'set local role anon');
    await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(user ? {sub:user} : {})]);
    return (await tx.query(sql, args)).rows[0]?.result;
  });
  const admin = ids.admin, student = ids.host;
  const list = (user, all = false) => as(user, 'select public.knowledge_list($1) as result', [all]);
  const image = (user, id) => as(user, 'select public.knowledge_image($1) as result', [id]);
  const save = (rec, images = [], user = admin) => as(user, 'select public.knowledge_save_achievement($1,$2) as result',
    [JSON.stringify(rec), JSON.stringify(images)]);
  const tool = (rec, user = admin) => as(user, 'select public.knowledge_save_tool($1) as result', [JSON.stringify(rec)]);
  const remove = (kind, rec, user = admin) => as(user, 'select public.knowledge_delete($1,$2,$3)', [kind,rec.id,rec.updated_at]);
  const byId = async id => (await list(admin,true)).achievements.find(a => a.id === id);
  const png = await fixture('public/content/u01_l01-activities-1-answerImages3.png','image/png');
  const jpg = await fixture('assets/home-hero-original.jpg','image/jpeg');
  const webp = await fixture('public/assets/home-hero-v2.webp','image/webp');
  let id, draft, pub, link;
  try {
    await t.test('empty feed, bound owner only, no direct table access', async () => {
      assert.deepEqual(await list(null), {achievements:[],tools:[]});
      for (const user of [null, student]) {
        await assert.rejects(list(user,true), {code:'42501'});
        await assert.rejects(save({title:'اختبار'},[],user), {code:'42501'});
        await assert.rejects(tool({title:'أداة',url:'https://school.test'},user), {code:'42501'});
        await assert.rejects(as(user,'select content from school_private.knowledge_images'), {code:'42501'});
      }
    });
    await t.test('disabled admin loses management rights even when the UID binding remains', async () => {
      await db.query("update public.allowed_accounts set enabled=false where email=(select email from auth.users where id=$1)",[admin]);
      try {
        await assert.rejects(list(admin,true), {code:'42501'});
        await assert.rejects(save({title:'اختبار'}), {code:'42501'});
      } finally {
        await db.query("update public.allowed_accounts set enabled=true where email=(select email from auth.users where id=$1)",[admin]);
      }
    });
    await t.test('require an actual title and reject nested JSON in typed fields', async () => {
      for (const invalid of [null,{}, {title:7},{title:'اسم',category:['خطأ']},{title:'اسم',published:'true'}]) {
        await assert.rejects(save(invalid), {code:'22023'});
      }
      await assert.rejects(save({title:'  '}),{code:'23514'});
      await assert.rejects(tool({title:'أداة',url:{}}),{code:'22023'});
    });
    await t.test('durable draft gallery retains actual PNG, JPEG and WebP files privately', async () => {
      id = await save({title:'اختبار محلي'}, [png,jpg,webp]);
      draft = await byId(id);
      assert.deepEqual(draft.images.map(i=>i.mime),[png.mime,jpg.mime,webp.mime]);
      assert.equal(draft.images[0].bytes, Buffer.from(png.data,'base64').length);
      assert.deepEqual(await image(admin,draft.images[0].id),png);
      for (const user of [null, student]) {
        assert.deepEqual(await list(user), {achievements:[],tools:[]});
        assert.equal(await image(user,draft.images[0].id),null);
        await assert.rejects(remove('achievement', draft,user), {code:'42501'});
      }
    });
    await t.test('publish, replace primary, remove image, reject stale and cross-record updates atomically', async () => {
      const foreignId = await save({title:'سجل آخر'}, [png]);
      const other = await byId(foreignId);
      await assert.rejects(save({...draft,published:true}, [other.images[0]]), {code:'22023'});
      assert.equal((await byId(id)).updated_at,draft.updated_at);
      await save({...draft,published:true,category:'مسابقة',event_date:'2026-01-12'},[draft.images[2],draft.images[0]]);
      pub = (await list(null)).achievements[0];
      assert.equal(pub.id,id);
      assert.deepEqual(pub.images.map(i=>i.id),[draft.images[2].id,draft.images[0].id]);
      assert.deepEqual(await image(student,pub.images[0].id),webp);
      assert.equal(await image(admin,draft.images[1].id),null);
      await assert.rejects(save(draft,[]), {code:'40001'});
      await assert.rejects(remove('achievement',draft), {code:'40001'});
      await assert.rejects(save({...pub,title:'لا يحفظ'},[pub.images[0],pub.images[0]]), {code:'22023'});
      assert.deepEqual(await byId(id),pub);
      await remove('achievement',other);
    });
    await t.test('published metadata and original image bytes survive database close and reopen', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'knowledge-restart-'));
      let persisted;
      try {
        persisted = new PGlite({ dataDir: dir, loadDataDir: await db.dumpDataDir('none') });
        await persisted.waitReady;
        await persisted.close();
        persisted = new PGlite(dir);
        await persisted.exec('set role anon');
        const feed = (await persisted.query('select public.knowledge_list() as result')).rows[0].result;
        assert.deepEqual(feed.achievements[0],pub);
        const photo = (await persisted.query('select public.knowledge_image($1) as result',[pub.images[0].id])).rows[0].result;
        assert.deepEqual(photo,webp);
      } finally {
        if (persisted && !persisted.closed) await persisted.close();
        await rm(dir,{recursive:true,force:true});
      }
    });
    await t.test('reject invalid MIME, mismatched or malformed raster, oversized or over-count uploads', async () => {
      for (const img of [{...png,mime:'image/svg+xml'},{...jpg,mime:'image/png'},
        {...png,data:Buffer.from('Incomplete data').toString('base64')},
        {...png,data:Buffer.from(png.data,'base64').subarray(0,36).toString('base64')},
        {...png,data:Buffer.alloc(2097153).toString('base64')}]) {
        await assert.rejects(save({...pub,title:'لا يحفظ'},[img]), {code:'22023'});
      }
      await assert.rejects(save(pub,Array(9).fill(png)), {code:'22023'});
      await assert.rejects(save(pub,Array(8).fill(webp)), {code:'22023'});
      assert.deepEqual(await byId(id),pub);
    });
    await t.test('tool validation, publication, editing, hiding and deletion', async () => {
      for (const url of ['http://school.test','data:text/plain,invalid','https://a.test\\b','https://user@school.test','https://school.test:99999','https://school..test']) {
        await assert.rejects(tool({title:'أداة',url}), {code:'23514'});
      }
      const linkId = await tool({title:'أداة',url:'https://school.test/lesson?q=1'});
      assert.equal((await list(null)).tools.length,0);
      link = (await list(admin,true)).tools.find(r=>r.id===linkId);
      await tool({...link,title:'عنوان جديد',published:true});
      await assert.rejects(tool(link), {code:'40001'});
      link = (await list(null)).tools[0];
      assert.equal(link.title,'عنوان جديد');
      await tool({...link,published:false});
      assert.equal((await list(student)).tools.length,0);
      link = (await list(admin,true)).tools[0];
      await assert.rejects(remove('tool',link,student),{code:'42501'});
      await remove('tool',link);
      assert.equal((await list(admin,true)).tools.length,0);
    });
    await t.test('migration rerun preserves gallery; unpublishing revokes image reads; deleting removes bytes', async () => {
      await db.exec(await readFile(new URL('../'+file,import.meta.url),'utf8'));
      assert.deepEqual(await byId(id),pub);
      await save({...pub,published:false},pub.images);
      assert.equal(await image(null,pub.images[0].id),null);
      assert.equal((await list(student)).achievements.length,0);
      await remove('achievement',await byId(id));
      assert.equal((await db.query('select count(*)::int as n from school_private.knowledge_images')).rows[0].n,0);
      assert.deepEqual(await list(admin,true),{achievements:[],tools:[]});
    });
  } finally {
    await db.close();
  }
});
