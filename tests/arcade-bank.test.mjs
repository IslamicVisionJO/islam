import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const json = path => JSON.parse(readFileSync(new URL('../'+path, import.meta.url)));
const bank = json('public/arcade/bank.json');
const references = new Map();
for(const [semester, units] of [[1,json('data/first-btec-lessons.json')],[2,json('data/learning-manifest.json').units]]){
  for(const unit of units) for(const lesson of unit.lessons){
    references.set(lesson.id,{semester,unit:unit.id,lesson});
  }
}
const normalize = text => text.normalize('NFKC').replace(/[\p{M}\p{P}\p{Z}ـ]/gu,'').replace(/[أإآ]/g,'ا');

test('catalog follows all 51 textbook lessons in their platform year and unit',()=>{
  assert.equal(references.size,51);
  assert.equal(bank.lessons.length,51);
  assert.equal(new Set(bank.lessons.map(l=>l.id)).size,51);
  assert.equal(new Set(bank.lessons.map(l=>l.unit)).size,8);
  for(const row of bank.lessons){
    const ref=references.get(row.id);
    assert.ok(ref,row.id);
    assert.equal(row.semester,ref.semester);
    assert.equal(row.unit,ref.unit);
    assert.equal(row.title,ref.lesson.name);
    assert.ok(bank.questions.some(q=>q.lesson===row.id),'Empty lesson '+row.id);
  }
});

test('every playable item has a unique stem, four distinct choices, valid key and printed pages',()=>{
  const ids=new Set(),stems=new Set(),keys=[0,0,0,0];
  for(const q of bank.questions){
    const ref=references.get(q.lesson).lesson;
    assert.ok(!ids.has(q.id)&&q.id.startsWith(q.lesson+'_'),q.id);
    ids.add(q.id);
    assert.ok(!stems.has(normalize(q.prompt)),q.id);
    stems.add(normalize(q.prompt));
    assert.ok(q.prompt.trim()&&q.explanation.trim());
    assert.ok(['easy','medium','hard'].includes(q.level));
    assert.equal(q.options.length,4);
    assert.equal(new Set(q.options.map(normalize)).size,4,q.id);
    assert.ok(q.options.every(o=>o.trim()));
    assert.ok(Number.isInteger(q.correct)&&q.correct>=0&&q.correct<4);
    assert.ok(q.pages.length&&q.pages.every(p=>Number.isInteger(p)&&p>=ref.startPage&&p<=ref.endPage),q.id);
    keys[q.correct]++;
  }
  assert.ok(Math.max(...keys)-Math.min(...keys)<=1,'Unbalanced answer positions');
});
