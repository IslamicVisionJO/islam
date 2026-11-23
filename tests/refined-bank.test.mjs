import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {loadReviewBank} from '../scripts/review-bank.mjs';

const root = new URL('../',import.meta.url);
const read = name => readFile(new URL(name,root),'utf8');
const units = JSON.parse(await read('data/lessons.json'));
const {ministerial,gameQuestions} = await loadReviewBank(root,units);
const core = await read('src/core.js');
const games = await read('src/educational-core.js');
const engine = vm.runInNewContext(core+'\n'+games+'\n({presentQuestion,checkAnswer,EducationalContent})');

test('candidate indexes are disjoint and every lesson has 30 MCQs per level', () => {
 const questions = Object.values(ministerial).flatMap(levels=>Object.values(levels).flat());
 assert.equal(Object.keys(ministerial).length,26);
 assert.equal(questions.length,2340);
 assert.equal(gameQuestions.length,2795);
 assert.equal(new Set([...questions,...gameQuestions].map(q=>q.id)).size,5135);
 for (const q of questions) {
  const shuffled = engine.presentQuestion(q,()=>0);
  assert.equal(shuffled.payload.options.filter(o=>engine.checkAnswer(shuffled,o.id)).length,1,q.id);
 }
});

test('game candidates provide viable global pools without drawing ministerial questions', () => {
 const E = engine.EducationalContent;
 assert.equal(E.names.length,13);
 for (let game=0;game<E.names.length;game++) {
  const eligible = E.eligible(gameQuestions,game);
  assert.ok(eligible.length >= (game===2?5:1), E.names[game]);
  assert.ok(eligible.every(entry=>(entry.q||entry).delivery_allocation==='games_challenges'));
 }
});
