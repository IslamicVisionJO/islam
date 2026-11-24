import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const rules=vm.runInNewContext(await read('src/core.js')+'\n'+await read('src/wall-core.js')+'\n;WallRules');
const ids=JSON.parse(await read('data/wall-question-ids.json'));
const bank=JSON.parse(await read('review/bank/questions.json')).questions.filter(q=>ids.includes(q.id));
const questions=bank.slice(0,12);

test('wall countdown, descent, pause, danger and reset use elapsed time',()=>{
 const r=rules.start(questions,'easy','all','all');
 assert.equal(rules.project(r,2).height,.1);
 assert.ok(Math.abs(rules.project(r,5).height-.168)<1e-9);
 rules.act(r,5,'pause');
 assert.equal(r.phase,'paused');
 assert.equal(rules.project(r,50).height,r.height);
 rules.act(r,50,'resume');
 assert.equal(r.delay,3);
 rules.act(r,100,'state');
 assert.equal(r.phase,'finished');
 assert.equal(r.reason,'danger');
 assert.equal(r.height,1);
});
test('one answer per card, speed changes and streak bonuses',()=>{
 const r=rules.start(questions,'hard','all','all');
 rules.act(r,1,'answer',questions[0].id,questions[0].answer.option_id);
 assert.equal(r.score,0);
 for(let i=0;i<10;i++){
  const q=questions[i],speed=r.speed;
  rules.act(r,i===0?3:0,'answer',q.id,q.answer.option_id);
  assert.equal(r.phase,'feedback');
  if(i===0)assert.ok(Math.abs(r.speed-speed*.85)<1e-9);
  const score=r.score;
  rules.act(r,4,'answer',q.id,q.answer.option_id);
  assert.equal(r.score,score);
  assert.equal(rules.project(r,10).height,r.height);
  if(i===2)assert.equal(score,350);
  if(i===4)assert.equal(score,650);
  rules.act(r,10,'next');
 }
 assert.equal(r.score,1150);
 assert.equal(r.best,10);
 assert.equal(r.freeze,3);
 const height=r.height;
 assert.equal(rules.project(r,2).height,height);
 const q=questions[10],wrong=q.payload.options.find(o=>o.id!==q.answer.option_id);
 const speed=r.speed;
 rules.act(r,1,'answer',q.id,wrong.id);
 assert.ok(Math.abs(r.speed-speed*1.10)<1e-9);
 assert.equal(r.streak,0);
 assert.equal(r.score,1150);
 assert.equal(r.receipts.length,11);
});
test('wall uses the aligned bank across all lessons and four options per question',()=>{
 assert.equal(ids.length,bank.length);
 assert.equal(new Set(ids).size,605);
 assert.equal(new Set(bank.map(q=>q.lesson_id)).size,26);
 assert.ok(bank.every(q=>q.type==='multiple_choice'&&q.payload.options.length===4&&q.review.source_checked&&q.review.answer_checked));
});
