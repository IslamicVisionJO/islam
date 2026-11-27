import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../public/arcade/space.mjs';

function seeded(seed = 739) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function trainingPilot(game, onCheckpoint) {
  let priorX = 0, priorColumn = -1, direction = 1, checkpoint = 0;
  game.input('fire', true);
  for (let frame = 0; frame < 60 * 240 && !game.over && checkpoint < 3; frame++) {
    const {enemies, pilots, boss} = game.state;
    const pilot = pilots[0];
    const target = enemies.reduce((a, b) => b.y > a.y+.01 ||
      Math.abs(a.y-b.y)<.01 && Math.abs(b.x-pilot.x)<Math.abs(a.x-pilot.x) ? b : a);
    const delta = target.x-priorX;
    if (target.col === priorColumn && Math.abs(delta)>0 && Math.abs(delta)<2) direction = Math.sign(delta);
    priorX=target.x; priorColumn=target.col;
    const aim = Math.max(18, Math.min(342, target.x + direction * (boss?12:18)));
    game.input('left', aim < pilot.x-2);
    game.input('right', aim > pilot.x+2);
    game.step(1/60);
    if (checkpoint !== game.checkpoint) {checkpoint = game.checkpoint;onCheckpoint(checkpoint);}
  }
}

for (const level of ['easy','medium','hard']) {
  test('space skill play clears two fleets, receives the pre-boss question and defeats the boss on '+level, () => {
    const events = [];
    const game = createGame({rng:seeded(), level, sound:e=>events.push(e)});
    const checkpoints=[];
    trainingPilot(game, number=>{
      checkpoints.push(number);
      if (number===2) assert.equal(game.state.boss,true);
      game.reward();
      assert.equal(game.state.pilots[0].guard,4);
    });
    assert.deepEqual(checkpoints,[1,2,3]);
    assert.ok(game.score>=600);
    assert.ok(game.state.pilots[0].hits>=game.state.pilots[0].kills);
    assert.ok(events.includes('shoot') && events.includes('explode') && events.includes('boss'));
  });
}

test('co-op inputs move separate ships, team rewards upgrade both, scores retain attribution', ()=>{
  const game=createGame({players:2,rng:seeded()});
  game.input('left',true,0);game.input('right',true,1);
  for(let i=0;i<90;i++)game.step(1/60);
  let [a,b]=game.state.pilots;
  assert.equal(a.x,14);assert.equal(b.x,346);
  game.input('left',false,0);game.input('right',false,1);
  game.input('fire',true,1);
  game.reward(1);
  for(let i=0;i<120;i++)game.step(1/60);
  [a,b]=game.state.pilots;
  assert.equal(a.shots,0);assert.ok(b.shots>0);assert.equal(a.weapon,2);assert.equal(b.weapon,2);
  assert.equal(game.score,a.score+b.score);
});

test('equivalent input schedules are deterministic at different drawing rates',()=>{
  const run=fps=>{
    const game=createGame({rng:seeded()});
    game.input('fire',true);
    for(let i=0;i<5*fps;i++) game.step(1/fps);
    return game.state;
  };
  assert.deepEqual(run(30),run(120));
});

test('an unanswered upgrade is absent, barriers absorb fire, and defeat freezes the simulation',()=>{
  const game=createGame({level:'hard',rng:seeded()});
  const before=game.state.barriers.reduce((sum,b)=>sum+b.hp,0);
  game.input('fire',true);
  for(let i=0;i<90;i++) game.step(1/60);
  assert.ok(game.state.barriers.reduce((sum,b)=>sum+b.hp,0)<before);
  assert.equal(game.state.pilots[0].weapon,1);
  game.input('fire',false);
  for(let i=0;i<60*600&&!game.over;i++) game.step(1/60);
  assert.equal(game.over,true);
  const snapshot=game.state;
  game.reward();game.step(.2);
  assert.deepEqual(snapshot,game.state);
});

test('a tap shorter than a frame fires once and respects the weapon cooldown',()=>{
  const game=createGame({rng:seeded()});
  for (let i=0;i<2;i++) {game.input('fire',true);game.input('fire',false);}
  assert.equal(game.state.pilots[0].shots,1);
  assert.equal(game.state.bolts.length,1);
});
