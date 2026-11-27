import {games,levels} from './core.mjs';
import {makeAudio} from './audio.mjs';

export function runSolo(panel,host){
 const {settings,questions}=host,{game,level,duration}=settings;
 const life=new AbortController(),listeners={signal:life.signal},audio=makeAudio(host.muted);
 const engine=host.module.createGame({level,rng:host.rng,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,lowQuality:!!host.lowQuality,sound:name=>audio.play(name)});
 const records=[],keys=new Map(),pointers=new Map();
 let phase='ready',prior='play',elapsed=0,lastCheckpoint=0,lastAsk=0,timeLeft=0,index=0,streak=0,best=0,raf=0,last=performance.now(),accumulator=0,closed=false;
 const id=globalThis.crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
 panel.innerHTML=`<header class="toolbar"><button data-action="pause">إيقاف مؤقت</button><h1>${games[game].title}</h1><b data-clock></b></header>
 <div class="arena"><div class="stage"><canvas width="360" height="480" tabindex="0" aria-label="لوحة اللعب"></canvas><div class="veil"></div></div>
 <aside><h2>${levels[level]}</h2><p>النقاط <strong data-score>0</strong></p><p class="tip"></p><div class="pad"></div><details><summary>الصوت</summary><label>مستوى الصوت<input data-volume type="range" min="0" max="100" value="25"></label><label><input type="checkbox" data-notes checked> نغمات البلاطات</label><label><input type="checkbox" data-fx ${host.muted?'':'checked'}> مؤثرات اللعب</label></details></aside></div>`;
 const $=s=>panel.querySelector(s),canvas=$('canvas'),ctx=canvas.getContext('2d'),veil=$('.veil');
 const button=(title,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=title;b.addEventListener('click',fn,{once:true});return b;};
 function overlay(title,text=''){veil.hidden=false;veil.replaceChildren();const h=document.createElement('h2');h.textContent=title;veil.append(h);if(text){const p=document.createElement('p');p.textContent=text;veil.append(p);}}
 function resumePlay(){phase='play';veil.hidden=true;last=performance.now();canvas.focus({preventScroll:true});}
 function hold(action,source,down){
  if(down){if(phase!=='play'||keys.has(source))return;keys.set(source,action);engine.input(action,true);}
  else if(keys.has(source)){const a=keys.get(source);keys.delete(source);if(![...keys.values()].includes(a))engine.input(a,false);}
 }
 function release(){for(const key of [...keys.keys()])hold(null,key,false);pointers.clear();}
 function ask(){
  if(index>=questions.length){resumePlay();return;}release();phase='question';const q=questions[index];
  timeLeft={easy:35,medium:28,hard:22}[level];lastAsk=elapsed;
  overlay('تحدّي المعرفة',q.prompt);const options=document.createElement('div');options.className='answers';
  q.options.forEach((t,i)=>options.append(button('أبجد'[i]+' · '+t,()=>answer(i))));veil.append(options);
 }
 function answer(choice){
  if(phase!=='question')return;phase='feedback';const q=questions[index++],correct=choice===q.correct;
  records.push({q,choice,correct});streak=correct?streak+1:0;best=Math.max(best,streak);
  if(correct)engine.reward(game==='space'?0:index);audio.play(correct?'correct':'wrong');
  overlay(correct?'✓ إجابة صحيحة':choice===null?'انتهى وقت السؤال':'✕ الإجابة الصحيحة',q.options[q.correct]);
  const reason=document.createElement('p');reason.textContent=q.explanation+' · ص '+q.pages.join('، ');veil.append(reason,button('متابعة اللعب',resumePlay));
  if(host.userId)veil.append(button('الإبلاغ عن السؤال',()=>{
   const input=document.createElement('textarea');input.maxLength=400;input.placeholder='ما الذي يحتاج إلى تصحيح؟';input.setAttribute('aria-label',input.placeholder);
   const status=document.createElement('small');const send=document.createElement('button');send.textContent='إرسال البلاغ';
   send.onclick=async()=>{if(input.value.trim().length<3){status.textContent='أضف وصفًا للمشكلة.';return;}send.disabled=true;try{await host.rpc('arcade_social',{p_action:'report',p_data:{question:q.id,note:input.value.trim()}});input.remove();send.remove();status.textContent='استُلم البلاغ.';}catch{status.textContent='تعذّر إرسال البلاغ.';send.disabled=false;}};
   veil.append(input,send,status);
  }));
 }
 function pause(){
  if(!['play','question'].includes(phase))return;prior=phase;phase='paused';release();
  const saved=[...veil.childNodes];overlay('الجولة متوقفة');
  veil.append(button('استئناف',()=>{last=performance.now();if(prior==='question'){phase='question';veil.replaceChildren(...saved);}else resumePlay();}),button('إنهاء الجولة',()=>finish('exit')));
 }
 function finish(reason){
  if(phase==='result'||closed)return;phase='result';release();cancelAnimationFrame(raf);
  const correct=records.filter(r=>r.correct).length,score=engine.score+correct*100,win=reason==='time'&&correct>0;
  const xp=reason==='exit'?0:Math.min(30,correct*3+Math.min(correct,Math.floor(engine.score/100)));
  const result={id,at:new Date().toISOString(),game,score,correct,answered:records.length,best,win,xp};
  audio.play(win?'win':'end');panel.replaceChildren();
  const add=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;panel.append(el);return el;};
  add('h1',win?'فزت بالجولة':reason==='exit'?'أنهيت الجولة':'انتهت الجولة');add('p',`نقاط اللعب ${engine.score} · نقاط المعرفة ${correct*100} · المجموع ${score}`);
  add('p',`إجابات صحيحة ${correct} من ${records.length} · الدقة ${records.length?Math.round(correct/records.length*100):0}٪ · أفضل سلسلة ${best} · خبرة ${xp}`);
  if(win&&best>=2&&!host.history().some(r=>r.game===game&&r.win&&r.best>=2))add('h2','إنجاز جديد · إتقان '+games[game].title);
  for(const {q} of records.filter(r=>!r.correct)){
   add('h3',host.lessons.find(l=>l.id===q.lesson)?.title||'مراجعة الدرس');add('p',q.prompt);add('p',q.options[q.correct]+' · '+q.explanation+' · ص '+q.pages.join('، '));
  }
  const status=add('p','جارٍ حفظ النتيجة…');Promise.resolve().then(()=>host.record(result)).then(()=>status.textContent='حُفظت نتيجة الجولة.').catch(()=>status.textContent='تعذّر حفظ النتيجة في هذا الحساب.');
  panel.append(button('إعادة اللعب',host.onReplay));if(!host.offline)panel.append(button('تحدَّ صديقًا',host.onFriend));panel.append(button('العودة إلى الألعاب',host.close));
 }
 function tick(now){
  if(closed||phase==='result')return;
  const delta=Math.max(0,(now-last)/1000);last=now;
  if(phase==='play'){
   accumulator+=Math.min(delta,.18);
   while(accumulator>=1/60&&phase==='play'){
    engine.step(1/60);accumulator-=1/60;elapsed+=1/60;
    if(engine.over||elapsed>=duration){finish(engine.over?'loss':'time');return;}
    if(engine.checkpoint>lastCheckpoint||(game!=='tiles'&&elapsed-lastAsk>=35)){
     lastCheckpoint=engine.checkpoint;lastAsk=elapsed;if(index<questions.length)ask();
    }
   }
   engine.draw(ctx,canvas.width,canvas.height);
  }else if(phase==='question'){timeLeft-=delta;if(timeLeft<=0)answer(null);}
  $('[data-clock]').textContent=phase==='question'?'السؤال '+Math.max(0,Math.ceil(timeLeft))+' ث':Math.ceil(duration-elapsed)+' ث';
  $('[data-score]').textContent=engine.score;raf=requestAnimationFrame(tick);
 }
 $('.tip').textContent=games[game].tip;
 for(const action of engine.controls){
  const b=document.createElement('button');b.textContent=action.label;b.title=action.key;b.type='button';
  b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);hold(action.action,e.pointerId,true);};
  b.onpointerup=b.onpointercancel=b.onlostpointercapture=e=>hold(null,e.pointerId,false);$('.pad').append(b);
 }
 function point(e){const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(.9999,(e.clientX-r.left)/r.width)),y:(e.clientY-r.top)/r.height};}
 canvas.onpointerdown=e=>{if(phase!=='play')return;e.preventDefault();canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,true);
  if(game==='tiles')hold('lane'+Math.floor(point(e).x*4),e.pointerId,true);if(game==='bubbles')engine.input('aim',point(e));};
 canvas.onpointermove=e=>{if(game==='bubbles'&&phase==='play')engine.input('aim',point(e));};
 canvas.onpointerup=e=>{if(game==='bubbles'&&phase==='play'&&pointers.has(e.pointerId)){engine.input('aim',point(e));engine.input('shoot',true);engine.input('shoot',false);}hold(null,e.pointerId,false);pointers.delete(e.pointerId);};
 canvas.onpointercancel=e=>{hold(null,e.pointerId,false);pointers.delete(e.pointerId);};
 for(const type of ['keydown','keyup'])window.addEventListener(type,e=>{
  const action=engine.controls.find(c=>c.key===e.code);if(!action||phase!=='play')return;e.preventDefault();if(!e.repeat)hold(action.action,e.code,type==='keydown');
 },listeners);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();},listeners);
 window.addEventListener('blur',pause,listeners);
 $('[data-action=pause]').onclick=pause;
 panel.addEventListener('input',()=>{if($('[data-volume]'))audio.set(+$('[data-volume]').value/100,$('[data-notes]').checked,$('[data-fx]').checked);},listeners);
 engine.draw(ctx,canvas.width,canvas.height);overlay('استعد للجولة',games[game].tip);
 veil.append(button('ابدأ اللعب',()=>{audio.unlock();audio.play('start');ask();}));
 raf=requestAnimationFrame(tick);
 return ()=>{closed=true;life.abort();release();cancelAnimationFrame(raf);audio.close();};
}
