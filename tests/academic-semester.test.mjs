import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const load = file => JSON.parse(readFileSync(new URL('../data/'+file+'.json', import.meta.url)));
const { units } = load('academic-semester-one');
const lessons = units.flatMap(unit=>unit.lessons);
const study = load('academic-semester-one-study');
const passages = load('academic-memorization').texts;

test('academic 2026 handout contains all 333 mapped entries in textbook order', ()=>{
 assert.deepEqual(units.map(unit=>unit.lessons.length), [6,6,6,7]);
 assert.deepEqual(lessons.map(l=>l.startPage),
  [6,12,20,26,31,37,44,50,55,60,66,72,77,83,89,95,100,105,112,117,124,130,137,141,146]);
 assert.equal(lessons.find(l=>l.startPage===137).actualStartPage,136);
 const rows=lessons.flatMap(l=>l.rows);
 assert.equal(rows.length,333);
 assert.equal(new Set(rows.map(row=>row.id)).size,333);
 for(const lesson of lessons){
  for(const row of lesson.rows){
   assert.ok(row.question.trim()&&row.answer.trim()&&row.category.trim());
   assert.ok(row.page >= (lesson.actualStartPage||lesson.startPage) && row.page <= lesson.endPage);
   assert.ok(row.handoutPage>=3&&row.handoutPage<=45);
   if(row.option)assert.ok(row.answer.startsWith(row.option+' — '));
  }
 }
});

test('academic questions use four unique options, stable IDs and references in the same lesson', ()=>{
 const questions=lessons.flatMap(l=>study[l.id].questions);
 assert.equal(new Set(questions.map(q=>q.id)).size, questions.length);
 assert.equal(new Set(questions.map(q=>q.prompt)).size, questions.length);
 for(const l of lessons){
  assert.ok(study[l.id].guide.overview.trim());
  assert.ok(study[l.id].questions.length>=2);
  for(const q of study[l.id].questions){
   assert.equal(q.lesson,l.id);
   assert.equal(q.unit,l.unit);
   assert.equal(q.semester,1);
   assert.equal(q.options.length,4);
   assert.equal(new Set(q.options).size,4);
   assert.ok(q.options[q.correct]&&q.explanation);
   assert.ok(q.page>=(l.actualStartPage||l.startPage)&&q.page<=l.endPage);
  }
 }
});

test('the memorization center covers three assigned verse ranges and the two hadith lessons', ()=>{
 assert.equal(Object.keys(passages).length,5);
 assert.deepEqual(passages['academic-s1-u1-l01'].map(p=>Number(p.label.split(' · ')[1])),[102,103,104,105]);
 assert.deepEqual(passages['academic-s1-u3-l01'].map(p=>Number(p.label.split(' · ')[1])),[169,170,171,172,173,174]);
 assert.deepEqual(passages['academic-s1-u4-l01'].map(p=>Number(p.label.split(' · ')[1])),[21,22,23,24]);
 assert.match(passages['academic-s1-u3-l02'][0].text,/تُنَاصِحُوا/);
});
