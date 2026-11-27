import {games,levels} from './core.mjs';
import {simulation,eventIndex,loadGame} from './replay.mjs';

const esc=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={waiting:'انتظار اللاعبين',playing:'مباراة جارية',expired:'انتهت مهلة الغرفة',cancelled:'أُلغيت الغرفة',finished:'انتهت المباراة'};
const messages={insufficient_questions:'مخزون الأسئلة المعتمدة لهذا النطاق لا يكفي لمدة المباراة.',room_not_found:'رمز الغرفة غير صالح أو انتهى الانتظار.',room_full:'اكتمل عدد اللاعبين.',game_disabled:'اللعبة موقوفة حاليًا.',level_disabled:'أوقفت الإدارة هذا المستوى للمواجهات الجديدة.',room_rate_limit:'بلغت حد إنشاء الغرف لهذه الساعة.'};
const button=(action,text)=>`<button type="button" data-act="${action}">${text}</button>`;
const timeText=seconds=>Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');

export async function openLobby({container,rpc,verify,userId,settings,onExit}){
 const controller=new AbortController(),opts={signal:controller.signal};
 let room=null,engine=null,factory=null,all=new Map(),indexed=new Map(),since={},queued=[],held=new Set();
 let raf=0,timer=0,disposed=false,locked=false,seq=0,offset=0,screen='',verificationAt=0,answered=-1,lastQuiz='';
 const storage='learning-arcade-room:'+userId;
 container.innerHTML=`<section class="net" dir="rtl"><style>
 .net{max-width:52rem;margin:auto;color:#edf7f6;background:#0e2034;padding:clamp(12px,3vw,28px);border-radius:18px;font:inherit}.net h2{margin:10px 0}.net button,.net input,.net select{font:inherit;border:1px solid #75a9b9;background:#183950;color:white;padding:8px 12px;border-radius:9px;min-height:42px}.net button{cursor:pointer}.net button:focus-visible{outline:3px solid #ffdc87}.net button:disabled{opacity:.55}.net label{display:grid;gap:4px}.net-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:9px 0}.net canvas{width:min(100%,360px,49vh);height:auto;display:block;margin:auto;touch-action:none;background:#081527}.net [data-status]{color:#ffdd92}.net [data-controls]{direction:ltr}.net [data-controls] button{touch-action:none;user-select:none}.net [data-quiz]:not(:empty){padding:12px;background:#fff;color:#12243b;border-radius:12px}.net [data-quiz] button{display:block;margin:4px 0;width:100%;text-align:start}.net ol{padding-inline-start:22px}.net-head{display:flex;align-items:center;justify-content:space-between}.net code{font-size:1.3em;letter-spacing:.12em;color:#ffe49d}
 </style><div class="net-head"><h2>${esc(games[settings.game]?.title)} · أونلاين</h2>${button('exit','رجوع')}</div><button type="button" data-act="friends">الأصدقاء والدعوات</button><div data-social></div><p data-status role="status"></p><div data-screen></div></section>`;
 const root=container.querySelector('.net'),body=root.querySelector('[data-screen]'),status=root.querySelector('[data-status]');
 const report=t=>{status.textContent=t;};
 const call=(a,d={})=>rpc('arcade_room',{p_action:a,p_data:d});
 function main(){
  screen='menu';body.innerHTML=`<p>النتيجة تجمع نقاط اللعب ومكافآت الإجابات الصحيحة وفق إعدادات الغرفة. تعتمد لوحة الترتيب نتيجة التحقق على الخادم.</p><div class="net-row"><label>نوع المواجهة<select data-mode><option value="versus">تنافسية</option>${settings.game==='space'?'<option value="coop">تعاون ثنائي</option>':''}</select></label><label>عدد اللاعبين<select data-cap><option>2</option><option>3</option><option>4</option></select></label></div><div class="net-row">${button('create','إنشاء غرفة خاصة')}${button('random','البحث عن منافس')}</div><div class="net-row"><label>رمز الغرفة<input data-code dir="ltr" maxlength="10" autocomplete="off"></label>${button('join','انضمام')}</div><div class="net-row">${button('history','سجل مبارياتي')}${button('ranking','لوحة الترتيب')}<select aria-label="مدة الترتيب" data-period><option value="week">الأسبوع</option><option value="month">الشهر</option><option value="all">الكل</option></select></div><div data-list></div>`;
 }
 const nowTick=()=>room?.starts?Math.floor((Date.now()+offset-Date.parse(room.starts))*.06):-1;
 function ingest(state,sent){
  if(disposed)return;
  const fresh=room?.id!==state.id;
  if(fresh){all=new Map();since={};queued=[];seq=0;engine=null;held.clear();answered=-1;lastQuiz='';}
  const wallTime=Date.now(),shift=Date.parse(state.now)-(sent+(wallTime-sent)/2);offset=fresh?shift:offset*.5+shift*.5;
  let rewind=false;
  if(room&&JSON.stringify(state.players.map(p=>p.answers))!==JSON.stringify(room.players.map(p=>p.answers)))rewind=true;
  for(const event of state.events){
   const key=event.slot+':'+event.seq;
   if(!all.has(key)&&event.tick<(engine?.tick||0))rewind=true;
   all.set(key,event);since[event.slot]=Math.max(since[event.slot]||0,event.seq);
  }
  room=state;seq=Math.max(seq,state.players[state.slot].lastSeq);queued=queued.filter(e=>e.seq>state.players[state.slot].lastSeq);
  indexed=eventIndex([...all.values(),...queued.map(e=>({...e,slot:state.slot}))]);
  if(rewind)engine=null;
  try{if(['waiting','playing'].includes(state.status))localStorage.setItem(storage,state.id);else localStorage.removeItem(storage);}catch{}
 }
 async function update(action,data={}){
  const sent=Date.now(),state=await call(action,{room:room?.id,since,...data});
  if(disposed)return;ingest(state,sent);
  if(state.status==='playing'&&!factory)factory=await loadGame(state.game);
  if(!disposed)render();
 }
 function people(){return room.players.map(p=>`<li>${esc(p.name)} ${p.slot===room.slot?'(أنت)':''} · ${p.left?'غادر':Date.now()+offset-Date.parse(p.seen)>8000?'الاتصال متأخر':p.ready?'جاهز':'متصل'}</li>`).join('');}
 function render(){
  if(room.status==='waiting'){
   screen='waiting';body.innerHTML=`<h3>غرفة الانتظار</h3><p>رمز الدعوة <code>${esc(room.code)}</code></p><p>${esc(games[room.game].title)} · ${esc(levels[room.level])} · ${timeText(room.seconds)} · ${room.capacity} لاعبين · ${room.knowledgePoints} نقطة للإجابة الصحيحة</p><ol>${people()}</ol><div class="net-row">${button('invite','مشاركة الدعوة')}${room.players[room.slot].ready?'بانتظار بقية اللاعبين':button('ready','أنا جاهز')}${button('leave','مغادرة الغرفة')}</div>`;return;
  }
  if(room.status==='playing'){
   if(screen!=='play'){
    screen='play';body.innerHTML='<p data-live></p><canvas width="360" height="460" aria-label="لوحة اللعب"></canvas><div class="net-row" data-controls></div><section data-quiz></section><div class="net-row">'+button('leave','مغادرة المباراة')+'</div>';
    const controls=simulation(room,factory).boards[0].controls;
    body.querySelector('[data-controls]').innerHTML=controls.map(c=>`<button data-control="${esc(c.action)}">${esc(c.label)}</button>`).join('');
    cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
   }
   return;
  }
  if(screen==='result')return;
  screen='result';cancelAnimationFrame(raf);
  const rows=room.players.map(p=>({...p,correct:Object.values(p.answers).filter(a=>a.correct).length})).map(p=>({...p,total:p.left?0:p.skill+room.knowledgePoints*p.correct})).sort((a,b)=>b.total-a.total);
  const winners=rows.filter(p=>!p.left&&p.total===Math.max(...rows.filter(x=>!x.left).map(x=>x.total)));
  const myAnswers=room.players[room.slot].answers;
  body.innerHTML=`<h3>${esc(labels[room.status]||room.status)}</h3>${room.status==='finished'?`<p>${room.mode==='coop'?'نتيجة الفريق '+rows.reduce((n,p)=>n+p.total,0):winners.length>1?'تعادل':winners[0]?'الفائز '+esc(winners[0].name):'غادر اللاعبون'}</p><ol>${rows.map(p=>`<li>${esc(p.name)} · ${p.total} نقطة · ${p.correct} إجابات صحيحة</li>`).join('')}</ol>${room.review.map((q,i)=>`<details><summary>${myAnswers[i]?.correct?'✓':'✗'} ${esc(q.prompt)}</summary><p>${esc(q.options[q.correct])} · ${esc(q.explanation)} · ص ${esc(q.pages.join('، '))}</p></details>`).join('')}`:''}<div class="net-row">${button('again','مباراة جديدة')}</div>`;
 }
 function sendInput(action,value){
  const tick=nowTick();
  if(!room||room.status!=='playing'||room.players[room.slot].left||tick<0||tick>=room.seconds*60||tick%1800>=1140&&tick%1800<1740||queued.length>=40)return;
  if(typeof value==='boolean'){if(held.has(action)===value)return;if(value)held.add(action);else held.delete(action);}
  const e={seq:++seq,tick,action,value};queued.push(e);
  const live={...e,slot:room.slot};if(!indexed.has(tick))indexed.set(tick,[]);indexed.get(tick).push(live);
  if(engine&&tick<engine.tick)engine=null;
 }
 function frame(){
  if(disposed||screen!=='play')return;
  const tick=nowTick(),phase=tick%1800,ix=Math.floor(tick/1800);
  if(!engine)engine=simulation(room,factory);
  engine.advance(tick,indexed,room.players);
  const g=room.mode==='coop'?engine.boards[0]:engine.boards[room.slot],canvas=body.querySelector('canvas');
  g.draw(canvas.getContext('2d'),360,460);
  const time=Math.max(0,room.seconds-Math.floor(tick/60));
  body.querySelector('[data-live]').textContent=tick<0?'تبدأ المباراة بعد '+Math.ceil(-tick/60):time===0?'انتهى الوقت · التحقق من النتيجة':timeText(time)+' · '+room.players.map(p=>p.name+' '+engine.score(p.slot)).join(' | ');
  const quiz=body.querySelector('[data-quiz]'),visible=phase>=1140&&phase<1740&&tick<room.seconds*60;
  const sig=visible?[ix,room.index,!!room.question,answered===ix||!!room.players[room.slot].answers[ix]].join('/'):'';
  if(sig!==lastQuiz){
   lastQuiz=sig;const q=room.index===ix&&room.question;
   quiz.innerHTML=!visible?'':!q?'جارٍ تحميل السؤال…':answered===ix||room.players[room.slot].answers[ix]?'تم إرسال الإجابة':`<h3>${esc(q.prompt)}</h3>${q.options.map((o,i)=>button('answer'+i,esc('أبجد'[i]+' · '+o))).join('')}`;
  }
  raf=requestAnimationFrame(frame);
 }
 async function poll(){
  if(disposed)return;
  if(room&&['waiting','playing'].includes(room.status)&&!locked){
   locked=true;
   try{
    const before=Date.now();const expired=room.deadline&&before+offset>Date.parse(room.deadline)+1300;
    if(expired&&before-verificationAt>5000){verificationAt=before;await verify(room.id);}
    if(queued.length&&!expired&&nowTick()-queued[0].tick<=110)await update('input',{events:queued.slice(0,40)});
    else{
     if(queued.length){queued=[];seq=room.players[room.slot].lastSeq;indexed=eventIndex([...all.values()]);engine=null;held.clear();}
     await update('state');
    }
    if(screen!=='result')report('');
   }catch(err){report('تعذرت المزامنة. ستُعاد المحاولة تلقائيًا. '+(err?.message||''));}
   finally{locked=false;}
  }
  timer=setTimeout(poll,room?.status==='playing'?320:1200);
 }
 root.addEventListener('click',async e=>{
  const a=e.target.closest('[data-act]')?.dataset.act;if(!a)return;
  if(a==='friends'){
   try{const {contacts}=await import('./social.mjs');await contacts(root.querySelector('[data-social]'),rpc,room?.status==='waiting'?room.id:null,code=>update('join',{code}));}
   catch{report('تعذر تحميل الأصدقاء. تحقق من تفعيل خدمة الدعوات.');}return;
  }
  if(a==='exit'){onExit?.();return;}
  if(a==='invite'){
   try{if(navigator.share)await navigator.share({text:'انضم إلى غرفتي في '+games[room.game].title+' · الرمز '+room.code});else await navigator.clipboard.writeText(room.code);report('رمز الغرفة '+room.code);}catch{}return;
  }
  if(a==='again'){room=null;engine=null;factory=null;main();return;}
  if(locked&&a.startsWith('answer')){setTimeout(()=>{if(!disposed)e.target.click();},100);return;}
  if(locked)return;locked=true;
  try{
   if(a==='history'||a==='ranking'){
    const rows=await call(a,{period:body.querySelector('[data-period]').value});
    body.querySelector('[data-list]').innerHTML='<ol>'+rows.map(row=>a==='history'?`<li>${esc(games[row.game]?.title)} · ${esc(labels[row.status])} · ${row.skill}</li>`:`<li>${esc(row.name)} · ${row.points}</li>`).join('')+'</ol>'+(rows.length?'':'لا توجد نتائج بعد.');
   }else if(a==='create'||a==='random'){
    const mode=body.querySelector('[data-mode]').value;
    await update(a,{...settings,mode,capacity:mode==='coop'?2:Number(body.querySelector('[data-cap]').value)});
   }else if(a==='join')await update(a,{code:body.querySelector('[data-code]').value});
   else if(a==='ready')await update('ready');
   else if(a==='leave'){await update('leave');try{localStorage.removeItem(storage);}catch{}onExit?.();}
   else if(a.startsWith('answer')){const ix=room.index;await update('answer',{index:ix,choice:Number(a.slice(6))});answered=ix;}
   report('');
  }catch(err){const msg=err?.message||String(err);report(Object.entries(messages).find(([k])=>msg.includes(k))?.[1]||'تعذر تنفيذ الطلب. '+msg);}
  finally{locked=false;}
 },opts);
 const touch=new Map();
 function point(e,c){const b=c.getBoundingClientRect();return {x:Math.max(0,Math.min(.999,(e.clientX-b.left)/b.width)),y:Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))};}
 root.addEventListener('pointerdown',e=>{
  const target=e.target,canvas=target.closest('canvas');let act=target.closest('[data-control]')?.dataset.control;
  if(canvas&&room?.game==='tiles')act='lane'+Math.floor(point(e,canvas).x*4);
  if(canvas&&room?.game==='bubbles'){act='shoot';sendInput('aim',point(e,canvas));}
  if(!act)return;e.preventDefault();target.setPointerCapture(e.pointerId);touch.set(e.pointerId,act);sendInput(act,true);
 },opts);
 const release=e=>{const action=touch.get(e.pointerId);if(action){touch.delete(e.pointerId);sendInput(action,false);}};
 root.addEventListener('pointerup',release,opts);root.addEventListener('pointercancel',release,opts);
 for(const type of ['keydown','keyup'])window.addEventListener(type,e=>{
  if(screen!=='play'||!engine)return;
  const ctrl=engine.boards[0].controls.find(c=>c.key===e.code);if(!ctrl)return;
  e.preventDefault();if(!e.repeat)sendInput(ctrl.action,type==='keydown');
 },opts);
 window.addEventListener('blur',()=>{for(const action of [...held])sendInput(action,false);},opts);
 main();
 try{const saved=localStorage.getItem(storage);if(saved)await update('state',{room:saved});}catch{report('تعذر استعادة الغرفة السابقة.');}
 timer=setTimeout(poll,200);
 return ()=>{disposed=true;controller.abort();clearTimeout(timer);cancelAnimationFrame(raf);};
}
