import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../public/arcade/tiles.mjs';

test('unplayed notes expire on every difficulty',()=>{
  for(const level of ['easy','medium','hard']){
    const g=createGame({level,rng:()=>0});
    g.step(30);
    assert.equal(g.over,true);
    assert.equal(g.score,0);
    assert.equal(g.checkpoint,0);
  }
});

test('key-repeat cannot turn one perfect press into two notes',()=>{
  const g=createGame({level:'easy',rng:()=>0});
  g.step(1.85);
  g.input('lane0',true);
  g.input('lane0',true);
  assert.equal(g.stats.perfect,1);
  assert.equal(g.score,100);
  g.input('lane0',false);
  g.step(.86);g.input('lane1',true);
  assert.equal(g.stats.good,1);
});

test('release before the end of a long tile is a miss',()=>{
  const g=createGame({level:'easy',rng:()=>0});
  g.step(1.85);
  for(let i=0;i<4;i++){
    g.input('lane'+(i%2),true);g.input('lane'+(i%2),false);g.step(.72);
  }
  g.input('lane0',true);g.step(.2);g.input('lane0',false);
  assert.equal(g.stats.miss,1);
  assert.equal(g.stats.lives,4);
  assert.equal(g.stats.combo,0);
});

test('hard chord accepts simultaneous distinct lanes and never awards an early reward',()=>{
  const g=createGame({level:'hard',rng:()=>0});
  g.reward();assert.equal(g.stats.shield,false);
  g.step(1.4);
  for(let i=0;i<3;i++){
    g.input('lane'+(i%2),true);g.input('lane'+(i%2),false);g.step(.43);
  }
  g.input('lane1',true);g.input('lane2',true);
  assert.equal(g.stats.perfect,5);
});

test('a checkpoint follows all notes and an educational reward can be collected only once',()=>{
  const g=createGame({level:'easy',rng:()=>0});
  g.step(1.85);
  for(let i=0;i<8;i++){
    const lane='lane'+(i%2);g.input(lane,true);
    if(i!==4)g.input(lane,false);
    if(i!==7)g.step(.72);
    if(i===5)g.input('lane0',false);
  }
  assert.equal(g.stats.perfect,8);
  assert.equal(g.checkpoint,1);
  g.reward(); assert.equal(g.stats.shield,true);
  g.step(2.06);assert.equal(g.stats.shield,false);
  g.reward();assert.equal(g.stats.shield,false);
});

test('hitting every lane costs one life per wrong chord',()=>{
  const g=createGame({level:'easy',rng:()=>0});
  g.step(1.85);
  for(let i=0;i<4;i++)g.input('lane'+i,true);
  assert.equal(g.stats.perfect,1);
  assert.equal(g.stats.miss,1);
  assert.equal(g.stats.lives,4);
});
