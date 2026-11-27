import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,neighbors,resolveShot} from '../public/arcade/bubbles.mjs';

test('staggered rows preserve all six adjacency directions and wall bounds in either phase',()=>{
  for(const phase of [0,1]){
    assert.equal(neighbors(3,3,phase).length,6);
    for(let r=0;r<9;r++)for(let c=0;c<8-((r+phase)%2);c++){
      for(const [nr,nc] of neighbors(r,c,phase)){
        assert.ok(nr>=0&&nc>=0&&nc<8-((nr+phase)%2));
        assert.ok(neighbors(nr,nc,phase).some(([rr,cc])=>rr===r&&cc===c));
      }
    }
  }
});
test('matching three removes only matching neighbors and islands cut off from the ceiling',()=>{
  const b=[[1,null,null,null,null,null,null,2],[1,null,null,null,null,null,2],[3,null,null,null,null,null,null,2]];
  const {popped,dropped}=resolveShot(b,0,1,1,0);
  assert.equal(popped.length,3);
  assert.deepEqual(dropped.map(p=>p.color),[3]);
  assert.deepEqual(b.flat().filter(v=>v!=null),[2,2,2]);
});
test('two neighbors remain, and a reward bomb clears its immediate neighbors regardless of color',()=>{
 const b=[[0,1,2],[]];
 assert.equal(resolveShot(b,1,0,0,0).popped.length,0);
 assert.deepEqual(b[1],[0]);
 const result=resolveShot(b,1,1,1,0,true);
 assert.deepEqual(result.popped.map(p=>p.color).sort(),[0,1,1,2]);
 assert.equal(b[0][0],0);
});
test('all difficulty levels can complete a stage, gain a single checkpoint, and fire a rewarded bubble',()=>{
 for(const level of ['easy','medium','hard']){
  const events=[],g=createGame({rng:()=>0,level,sound:event=>events.push(event)});
  g.input('shoot',false);
  g.step(1);
  assert.equal(g.score,0);
  g.input('shoot',true);g.input('shoot',true);
  g.step(1);
  assert.ok(g.score>=100);assert.equal(g.checkpoint,1);
  assert.equal(events.filter(s=>s==='shoot').length,1);
  assert.equal(g.over,false);
  const before=g.score;g.reward();g.input('shoot',true);g.step(1);
  assert.ok(g.score>before);
  assert.ok(events.includes('reward'));
 }
});
test('competitive pressure coalesces before landing, rate limits subsequent deliveries and rejects invalid counts',()=>{
 const g=createGame({rng:()=>0});
 assert.equal(g.garbage(0),false);assert.equal(g.garbage(Infinity),false);
 assert.equal(g.garbage(20),true);assert.equal(g.garbage(1),false);
 g.input('shoot',true);g.step(1);
 assert.equal(g.over,false);assert.equal(g.garbage(),false);
 g.step(8.1);assert.equal(g.garbage(),true);
 g.input('shoot',true);g.step(1);
 assert.ok(g.attacks>=1);
});
test('aim pointer and keyboard work with equal seeds and reflect from a side cushion',()=>{
 function simulate(){
  let seed=7;
  const g=createGame({rng:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)});
  const events=[];
  for(let i=0;i<55&&!g.over;i++){
   g.input('aim',{x:i%2?.07:.94,y:.74});
   g.input(i%2?'left':'right',true);g.step(.07);g.input(i%2?'left':'right',false);
   g.input('shoot',true);
   for(let tick=0;tick<200;tick++)g.step(1/90);
   events.push([g.score,g.checkpoint,g.over]);
  }
  return events;
 }
 const trace=simulate();
 assert.deepEqual(trace,simulate());assert.ok(trace.some(([score])=>score>0));
});
