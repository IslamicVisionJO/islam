import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/knowledge-api.js', import.meta.url), 'utf8');
const fixture = (handler, extra={}) => {
 const events = [];
 const context = {Auth:{knowledgeRpc:handler}, URL, Event,
  document:{dispatchEvent:event => events.push(event.type)}, ...extra};
 return {api:vm.runInNewContext(source + '\nKnowledgeAPI', context), events};
};

test('read keeps competition and creation dates independent and exposes the same field for editing', async () => {
 const date = '2026-10-01T13:00:00Z';
 const {api} = fixture((name,args) => {
  assert.equal(name, 'knowledge_list');
  assert.equal(args.p_admin, false);
  return {tools:[], achievements:[
   {id:'older',event_date:'2025-06-08',created_at:date,place:'الثاني'},
   {id:'undated',event_date:null,created_at:date,place:null}
  ]};
 });
 const {achievements} = await api.list();
 assert.deepEqual(Array.from(achievements, row => row.id), ['undated', 'older']);
 assert.equal(achievements[1].placement, 'الثاني');
});

test('image edits preserve the chosen cover, follow final order and use a single versioned mutation', async () => {
 const row = {id:'old', updated_at:'version', title:' عنوان ', published:true, placement:'الأول'};
 let calls = 0;
 const {api,events} = fixture((name,args) => {
  calls++;
  assert.equal(name, 'knowledge_save_achievement');
  assert.equal(args.p_record.id, row.id);
  assert.equal(args.p_record.updated_at, row.updated_at);
  assert.equal(args.p_record.place, row.placement);
  assert.equal(args.p_record.title, 'عنوان');
  assert.equal(args.p_record.participants, null);
  assert.deepEqual(Array.from(args.p_images, item=>item.id || item.data), ['second', 'AQI=', 'previousCover']);
  return 'old';
 }, {FileReader:class {
  readAsDataURL() { this.result = 'data:image/png;base64,AQI='; this.onload(); }
 }});
 await api.saveAchievement(row, [{id:'second',bytes:20},{name:'image.PNG',type:'image/png',size:2},{id:'previousCover',bytes:10}]);
 assert.equal(calls,1);
 assert.deepEqual(events,['school-content-changed']);
});

test('oversized files and unsafe formats never reach the transport', async () => {
 const {api,events} = fixture(()=>assert.fail('unexpected mutation'));
 const row = {title:'العنوان'};
 await assert.rejects(api.saveAchievement(row,[{name:'x.png',type:'image/png',size:api.MAX_IMAGE_BYTES+1}]));
 await assert.rejects(api.saveAchievement(row,[{name:'x.svg',type:'image/svg+xml',size:100}]));
 await assert.rejects(api.saveAchievement(row,[{name:'x.jpg',type:'image/svg+xml',size:100}]));
 await assert.rejects(api.saveAchievement(row,Array(9).fill({id:'x',bytes:1})));
 await assert.rejects(api.saveAchievement(row,Array(5).fill({id:'x',bytes:api.MAX_IMAGE_BYTES})));
 assert.deepEqual(events,[]);
});

test('tool URLs accept external HTTPS links and reject credentials, script and network-path URLs', async () => {
 const calls = [];
 const {api} = fixture((name,args) => {calls.push([name,args]); return 'id';});
 for (const url of ['http://school.test','https://admin:pass@school.test','javascript:alert(1)','//school.test','https:school.test']){
  assert.equal(api.httpsUrl(url),'');
  assert.throws(()=>api.saveTool({title:'رابط',url}));
 }
 await api.saveTool({title:'حاسبة',url:'https://school.test/calc',published:true});
 assert.equal(calls.length,1);
 assert.equal(calls[0][1].p_record.url,'https://school.test/calc');
});

test('unavailable images and non-raster server responses are rejected', async () => {
 for (const payload of [null,{mime:'text/html',data:'AAA='},{mime:'image/png',data:''}]) {
  const {api} = fixture(() => payload);
  await assert.rejects(api.imageUrl({id:'image'}));
 }
 const {api} = fixture(() => ({mime:'image/webp',data:'AQI='}));
 assert.equal(await api.imageUrl({id:'image'}),'data:image/webp;base64,AQI=');
});

test('a rejected edit does not announce a content change', async () => {
 const {api,events} = fixture(async () => {throw Error('conflict');});
 await assert.rejects(api.deleteAchievement({id:'id',updated_at:'old'}),/conflict/);
 assert.deepEqual(events,[]);
});
