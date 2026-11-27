export function makeAudio(muted){
 let ctx,volume=.25,notes=true,effects=!muted;
 const tones={start:466,end:220,win:784,wrong:165,correct:660,power:880,clear:698,drop:196,fire:990,shoot:990,explode:105,boss:155,level:740,miss:147,pop:523,hit:180,checkpoint:587};
 return {set(v,n,e){volume=v;notes=n;effects=e;},unlock(){try{ctx??=new (window.AudioContext||window.webkitAudioContext)();void ctx.resume().catch(()=>{});}catch{}},
  play(name){const piano=/^tile([0-3])$/.exec(name);if(!ctx||ctx.state!=='running'||(piano?!notes:!effects))return;
   const osc=ctx.createOscillator(),gain=ctx.createGain(),time=ctx.currentTime;
   osc.type=piano?'sine':'triangle';osc.frequency.value=piano?[261.63,329.63,392,523.25][+piano[1]]:tones[name]||392;
   gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*.12),time+.008);gain.gain.exponentialRampToValueAtTime(.0001,time+.16);
   osc.connect(gain);gain.connect(ctx.destination);osc.start(time);osc.stop(time+.18);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  },close(){if(ctx)void ctx.close().catch(()=>{});}};
}
