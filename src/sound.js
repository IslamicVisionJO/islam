/** Central generated audio; no network assets or correctness cues during exams. */
const Sound=(()=>{
 let context,voice;
 function stop(){try{voice?.stop();}catch{}voice=null;}
 function play(kind='tap'){
  if(!S.settings.sounds||document.querySelector('video:not([data-paused])')||S.session?.mode==='exam'&&S.session.phase!=='finished')return;
  try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;context??=new C();if(context.state==='suspended')void context.resume();stop();
   const key=typeof kind==='boolean'?(kind?'correct':'wrong'):kind;
   const frequencies={correct:760,point:760,wrong:170,timeout:170,win:920,finish:660,defeat:140,achievement:1040,level:1200,tap:430};
   const o=context.createOscillator(),gain=context.createGain(),now=context.currentTime,duration=['win','achievement','level'].includes(key)?.32:.10;
   o.frequency.value=frequencies[key]||530;gain.gain.setValueAtTime(Math.min(1,Math.max(0,Number(S.settings.volume??.5)))*.08,now);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);o.connect(gain).connect(context.destination);o.start();o.stop(now+duration);voice=o;
  }catch{}
 }
 return {play,stop,status:()=>context?.state||'uninitialized'};
})();
