import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../public/arcade/blocks.mjs';

function tap(game,action){game.input(action,true);game.input(action,false);}
function place(game,column){
  const before=game.getState().active.x;
  for(let n=0;n<Math.abs(column-before);n++)tap(game,column<before?'left':'right');
  tap(game,'drop');
}
function seeded(){
  let n=417;
  return ()=>((n=Math.imul(1664525,n)+1013904223>>>0)/4294967296);
}
test('seven-piece bags, deterministic replay and safe hold',()=>{
  const a=createGame({rng:seeded()}),b=createGame({rng:seeded()});
  const order=[];
  for(let i=0;i<7;i++){
    order.push(a.getState().active.type);
    for(const game of [a,b])place(game,i%2?0:6);
    assert.deepEqual(a.getState(),b.getState());
  }
  assert.equal(new Set(order).size,7);
  const before=a.getState();
  tap(a,'hold');
  const after=a.getState();
  assert.equal(after.hold,before.active.type);
  assert.equal(after.active.type,before.next[0]);
  tap(a,'hold');assert.deepEqual(a.getState(),after);
  tap(a,'drop');tap(a,'hold');assert.equal(a.getState().active.type,before.active.type);
});
test('fills a complete row, drops the supported cells and awards clear points',()=>{
  const events=[];
  const g=createGame({rng:()=>.999,sound:e=>events.push(e)});
  for(const column of [0,4,7])place(g,column);
  const state=g.getState();
  assert.equal(state.lines,1);
  assert.equal(state.board.flat().filter(Boolean).length,2);
  assert.equal(state.board.at(-1)[4],'J');
  assert.equal(state.board.at(-1)[9],'L');
  assert.equal(state.combo,0);
  assert.ok(g.score>=100);
  assert.equal(events.filter(e=>e==='clear').length,1);
});
test('gravity follows difficulty, horizontal repeat stays inside well, held drop ignores browser repeats',()=>{
  const easy=createGame({level:'easy',rng:()=>.999});
  const hard=createGame({level:'hard',rng:()=>.999});
  easy.step(.8);hard.step(.8);
  assert.ok(hard.getState().active.y>easy.getState().active.y);
  easy.input('left',true);easy.step(2);easy.input('left',false);
  assert.equal(easy.getState().active.x,0);
  easy.input('drop',true);easy.input('drop',true);
  assert.equal(easy.getState().locks,1);
  easy.input('drop',false);tap(easy,'drop');
  assert.equal(easy.getState().locks,2);
});
test('clockwise rotation and wall kick preserve the falling I piece',()=>{
  const g=createGame({rng:()=>.999});
  tap(g,'rotate');
  for(let i=0;i<10;i++)tap(g,'left');
  assert.equal(g.getState().active.x,-2);
  tap(g,'rotate');
  const active=g.getState().active;
  assert.equal(active.rotation,2);
  assert.equal(active.x,0);
});
test('lesson rewards are checkpoint-bound and competitive rows are capped',()=>{
  const g=createGame({rng:()=>.999});
  g.reward();
  assert.equal(g.takeAttack(),0);
  for(let n=0;n<8;n++)place(g,n%2?0:6);
  assert.equal(g.checkpoint,1);
  g.addChallenge(20);
  assert.equal(g.getState().incoming,3);
  g.reward();g.reward();
  assert.equal(g.takeAttack(),1);
  assert.equal(g.takeAttack(),0);
  assert.equal(g.getState().incoming,2);
  assert.equal(g.getState().slow,9);
  place(g,4);
  const row=g.getState().board.at(-1);
  assert.equal(row.filter(cell=>cell==='G').length,9);
  assert.equal(row.filter(cell=>!cell).length,1);
});
test('blocked spawn ends the round without accepting extra moves',()=>{
  const g=createGame({rng:()=>.999});
  for(let n=0;n<100&&!g.over;n++)tap(g,'drop');
  assert.equal(g.over,true);
  const state=g.getState();
  tap(g,'drop');g.step(4);
  assert.deepEqual(g.getState(),state);
});
test('simulation is invariant to equivalent frame subdivisions',()=>{
  const a=createGame({rng:seeded()}),b=createGame({rng:seeded()});
  a.step(9);
  for(let frame=0;frame<540;frame++)b.step(1/60);
  assert.deepEqual(a.getState(),b.getState());
});
