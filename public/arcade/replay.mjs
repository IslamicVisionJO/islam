import {random} from './core.mjs';
export async function loadGame(game){
 switch(game){
 case 'blocks':return (await import('./blocks.mjs')).createGame;
 case 'space':return (await import('./space.mjs')).createGame;
 case 'bubbles':return (await import('./bubbles.mjs')).createGame;
 case 'tiles':return (await import('./tiles.mjs')).createGame;
 default:throw Error('Unknown game');
 }
}
export function simulation(room,createGame,sound=()=>{}){
 const coop=room.mode==='coop';
 const make=()=>createGame({level:room.level,rng:random(room.seed),sound,players:coop?room.capacity:1});
 const boards=Array.from({length:coop?1:room.capacity},make);
 const sent=boards.map(()=>0);
 let tick=0;
 function advance(target,events,players){
  target=Math.min(room.seconds*60,Math.max(0,target));
  for(;tick<target;tick++){
   const phase=tick%1800,index=Math.floor(tick/1800);
   if(phase===1740)for(const player of players){
    if(player.answers?.[index]?.correct)(coop?boards[0]:boards[player.slot]).reward(coop?player.slot:0);
   }
   if(phase>=1140&&phase<1740)continue;
   for(const e of events.get(tick)||[]){
    const game=coop?boards[0]:boards[e.slot];if(!game.over)game.input(e.action,e.value,coop?e.slot:0);
   }
   for(const [i,game] of boards.entries()){
    if(!game.over)game.step(1/60);
    if(!coop && game.attacks>sent[i]){
     boards[(i+1)%boards.length].garbage?.(1);sent[i]=game.attacks;
    }
    const attack=game.takeAttack?.()||0;
    if(attack>0&&!coop)boards[(i+1)%boards.length].addChallenge?.(Math.min(2,attack));
   }
  }
 }
 function score(slot){return Math.max(0,Math.floor(coop?boards[0].state.pilots[slot].score:boards[slot].score));}
 return {boards,advance,score,get tick(){return tick;}};
}
export function eventIndex(events){
 const map=new Map();
 for(const e of events){if(!map.has(e.tick))map.set(e.tick,[]);map.get(e.tick).push(e);}
 for(const group of map.values())group.sort((a,b)=>a.slot-b.slot||a.seq-b.seq);
 return map;
}
