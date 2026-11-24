const Wall=(()=>{
 const letters=['أ','ب','ج','د'];
 const levels={easy:'سهل',medium:'متوسط',hard:'التحدي الوزاري'};
 const periods={day:'اليوم',week:'هذا الأسبوع',all:'جميع الأوقات'};
 const ids=new Set(WALL_QUESTION_IDS);
 let round=null, ranked=false, mark=0, raf=0, scope, pending=false, stateRequested=false, suspend=false;
 let unit='all',lesson='all',level='easy',period='all',board=null,boardError='',message='',localBest=0;
 const elapsed=()=>Math.max(0,(performance.now()-mark)/1000);
 const active=()=>S.page==='wall';
 const online=()=>authState().mode==='account';
 const ui=()=>{if(active())render();};
 const btn=(action,label,disabled=false,value='')=>`<button type="button" class="btn btn-outline" data-wall="${action}" data-value="${e(value)}" ${disabled?'disabled':''}>${e(label)}</button>`;
 const select=(id,label,options,selected)=>`<label>${label}<select id="${id}">${options.map(([value,text])=>`<option value="${e(value)}" ${value===selected?'selected':''}>${e(text)}</option>`).join('')}</select></label>`;
 function syncAccount(){
  if(scope===db.scopeToken())return;
  scope=db.scopeToken();round=null;ranked=false;localBest=0;stateRequested=false;suspend=false;message='';
 }
 function ranks(){
  return `<section class="surface panel wall-board"><h2>لوحة المتصدرين</h2>
   ${select('wall-period','الفترة',Object.entries(periods),period)}
   ${boardError?`<p role="status">${e(boardError)}</p>`:board===null?'<p>جارٍ تحميل الترتيب…</p>':
    board.length?`<div class="wall-table"><table><thead><tr><th>الترتيب</th><th>الطالب</th><th>النقاط</th><th>الدقة</th><th>الصمود</th></tr></thead>
     <tbody>${board.map(r=>`<tr><td>${nf(r.rank)}</td><td>${e(r.name)}</td><td>${nf(r.score)}</td><td>${nf(r.accuracy)}٪</td><td>${fmt(r.elapsed)}</td></tr>`).join('')}</tbody></table></div>`:'<p>لا توجد نتائج لهذه الفترة.</p>'}</section>`;
 }
 function setup(){
  return `<section class="wall-lobby surface panel"><div class="wall-lobby-title"><span aria-hidden="true">▦</span>
   <h2>كم سؤالًا تجيب قبل أن يصل الجدار؟</h2></div>
   <p>كل إجابة صحيحة تكسبك 100 نقطة وتدفع الجدار إلى الأعلى. عند الخطأ يتسارع، وتتوقف حركته أثناء قراءة التفسير.</p>
   <div class="wall-settings">${select('wall-unit','الوحدة',[['all','جميع الوحدات'],...S.units.map(u=>[u.id,u.name])],unit)}
   ${select('wall-lesson','الدرس',[['all',unit==='all'?'جميع الدروس':'جميع دروس الوحدة'],...S.units.filter(u=>unit==='all'||u.id===unit).flatMap(u=>u.lessons.map(l=>[l.id,l.name]))],lesson)}
   ${select('wall-level','المستوى',Object.entries(levels),level)}</div>
   <p class="muted">تعطى الأولوية لأسئلة المستوى المختار، ثم تُستخدم الأسئلة المتاحة في النطاق نفسه.</p>
   <div class="wall-actions">${online()?btn('ranked','ابدأ التحدي وحفظ النتيجة',pending||board===null||Boolean(boardError)):''}${btn('practice','ابدأ تدريبًا محليًا',pending)}</div>
   ${authState().isAdmin?'<button class="btn btn-outline" data-action="navigate" data-page="wall-admin">إدارة تحدي الجدار</button>':''}
   ${online()?'<p class="muted">تحفظ الجولات المكتملة أو المنتهية بخط الخطر في حسابك.</p>':'<p class="muted">سجّل الدخول للمشاركة في لوحة المتصدرين.</p>'}
  </section>${ranks()}`;
 }
 function question(){
  if(!round)return null;
  if(ranked)return round.question;
  const q=round.questions[round.index];return q&&{id:q.id,prompt:q.prompt,options:q.payload.options};
 }
 function result(){
  const r=round,answered=r.receipts?.length||0,wrong=answered-r.correct;
  const summary=[['النقاط',nf(r.score)],['أفضل نتيجة',nf(ranked?r.personalBest:localBest)],
   ['أجبت عن',nf(answered)],['صحيحة',nf(r.correct)],['خاطئة',nf(wrong)],['الدقة',nf(answered?Math.round(100*r.correct/answered):0)+'٪'],
   ['مدة الصمود',fmt(r.elapsed)],['أطول سلسلة',nf(r.best)],['اللقب',WallRules.title(r.score)]];
  return `<section class="surface panel wall-result"><h2>${r.reason==='complete'?'أكملت أسئلة الجولة':r.reason==='danger'?'وصل الجدار إلى خط الخطر':'انتهت المحاولة'}</h2>
   <div class="wall-metrics">${summary.map(([label,value])=>`<div><span>${e(label)}</span><b>${e(value)}</b></div>`).join('')}</div>
   <div class="wall-actions">${btn('replay','إعادة اللعب')}<button class="btn" data-action="navigate" data-page="educational">اختيار لعبة أخرى</button><button class="btn btn-outline" data-action="navigate" data-page="home">الرئيسية</button></div>
   ${wrong?`<h3>راجع إجاباتك الخاطئة</h3>${r.receipts.filter(a=>!a.correct).map(a=>`<details><summary>${e(a.prompt)}</summary><p><b>${e(a.answer)}</b><br>${e(a.explanation)}</p><small>صفحة الكتاب ${nf(a.page)}</small></details>`).join('')}`:''}</section>${ranks()}`;
 }
 function play(){
  const r=round,q=question(),countdown=r.phase==='playing'&&r.delay>elapsed();
  let body;
  if(r.phase==='paused')body=`<div class="wall-feedback"><h3>اللعبة متوقفة</h3>${btn('resume','استئناف',pending)}</div>`;
  else if(r.phase==='feedback'){
   const a=r.feedback;
   body=`<div class="wall-feedback ${a.correct?'wall-right':'wall-wrong'}" role="status"><h3>${a.correct?'إجابة صحيحة!':'راجع الإجابة'}</h3><p>${e(a.prompt)}</p><b>${e(a.answer)}</b><p>${e(a.explanation)}</p><small>صفحة الكتاب ${nf(a.page)}</small>
   ${r.streak===3?'<p>سلسلة 3 • +50 نقطة</p>':r.streak===5?'<p>سلسلة 5 • +100 نقطة وتراجع إضافي للجدار</p>':r.streak===10?'<p>سلسلة 10 • تجميد الجدار 3 ثوانٍ بعد المتابعة</p>':''}
   <div>${btn('next','متابعة',pending)}</div></div>`;
  }else if(countdown)body='<p class="wall-countdown" aria-live="polite" id="wall-countdown"></p>';
  else body=q?`<div class="wall-question"><p>ضع دائرة حول رمز الإجابة الصحيحة</p><h3>${e(q.prompt)}</h3><div class="wall-answers">${q.options.map((o,i)=>`<button type="button" class="wall-choice" data-wall="answer" data-value="${e(o.id)}" ${pending?'disabled':''}><b>${letters[i]}</b><span>${e(o.text)}</span></button>`).join('')}</div></div>`:'';
  return `<section class="wall-play">
   <div class="wall-hud"><span>النقاط <b>${nf(r.score)}</b></span><span>السلسلة <b>${nf(r.streak)}</b></span><span>السرعة <b>${nf(Math.round(r.speed*100))}٪/ث</b></span><span>السؤال <b>${nf(r.index+1)} / ${nf(r.total)}</b></span></div>
   <div class="wall-arena" data-danger="green" aria-hidden="true"><div class="wall-stones"></div><div class="wall-danger-line"></div></div>
   <div class="wall-danger-status"><span id="wall-danger-label" role="status">الخطورة منخفضة</span><span id="wall-time">${fmt(r.elapsed)}</span></div>
   <div class="wall-controls">${btn('sound',S.settings.sounds?'كتم الصوت':'تشغيل الصوت')}${r.phase==='playing'?btn('pause','إيقاف مؤقت',pending):''}${btn('exit','إنهاء الجولة',pending)}</div>${body}</section>`;
 }
 function view(){
  syncAccount();
  return heroTitle('تحدي الجدار – سباق مع المعرفة',round?`${e(levels[round.level])} · ${round.lesson==='all'?(round.unit==='all'?'جميع الدروس':e(unitFor(round.unit)?.name)):e(byLesson(round.lesson)?.name)}`:'أجب قبل خط الخطر')+
   (message?`<p class="auth-message is-error" role="alert">${e(message)}</p>`:'')+
   (round?(round.phase==='finished'?result():play()):setup());
 }
 function bind(){
  cancelAnimationFrame(raf);
  const arena=document.querySelector('.wall-arena'),r=round;
  if(!arena||!r)return;
  const stone=arena.querySelector('.wall-stones'),label=document.getElementById('wall-danger-label'),time=document.getElementById('wall-time');
  const counter=document.getElementById('wall-countdown');
  function tick(){
   if(!active()||!arena.isConnected||round!==r)return;
   const seconds=elapsed(),p=WallRules.project(r,seconds);
   stone.style.transform=`translateY(${p.height*100}cqh)`;
   const band=p.height<.42?'green':p.height<.65?'yellow':p.height<.84?'orange':'red';
   if(arena.dataset.danger!==band)arena.dataset.danger=band;
   const text=r.phase==='playing'&&r.freeze>seconds&&r.delay<=seconds?'الجدار مجمّد':p.height<.42?'الخطورة منخفضة':p.height<.65?'الخطورة متوسطة':p.height<.84?'اقترب الجدار':'خطر وشيك';
   if(label.textContent!==text)label.textContent=text;
   if(time.textContent!==fmt(p.elapsed))time.textContent=fmt(p.elapsed);
   if(counter){const n=Math.ceil(r.delay-seconds);if(n<=0){ui();return;}if(counter.textContent!==nf(n))counter.textContent=nf(n);}
   if(p.height>=1&&r.phase==='playing'){if(!pending&&!stateRequested){stateRequested=true;void act('state');}return;}
   if(r.phase==='playing'&&!document.hidden)raf=requestAnimationFrame(tick);
  }
  tick();
 }
 async function refreshBoard(){
  const requested=period;
  try{const result=await Auth.wallRpc('wall_board',{p_period:requested});if(period===requested){board=result;boardError='';}}
  catch(error){if(period===requested){board=null;boardError=error.message;}}
  if(!round||round.phase==='finished')ui();
 }
 function install(result){
  round=result;mark=performance.now();stateRequested=false;
  if(round?.phase==='finished'){
   if(!ranked&&round.reason!=='abandoned')localBest=Math.max(localBest,round.score);
   playSound(round.reason==='complete'?'win':'finish');if(ranked)void refreshBoard();
  }
  ui();
 }
 async function enter(){
  syncAccount();void refreshBoard();
  if(round||!online()||pending)return;
  const token=scope;pending=true;
  try{const saved=await Auth.wallRpc('wall_act',{p_id:null,p_action:'state'});if(token===db.scopeToken()&&saved){ranked=true;install(saved);}}
  catch(error){if(token===db.scopeToken())message=error.message;}
  finally{pending=false;ui();}
  if((!active()||document.hidden)&&round?.phase==='playing')void act('pause');
 }
 async function start(server){
  if(pending||round)return;
  const token=scope;pending=true;message='';
  try{
   if(server){
    const next=await Auth.wallRpc('wall_start',{p_level:level,p_unit:unit,p_lesson:lesson});
    if(token!==db.scopeToken())return;
    ranked=true;install(next);
   }else{
    const pool=S.valid.filter(q=>ids.has(q.id)&&(unit==='all'||q.unit_id===unit)&&(lesson==='all'||q.lesson_id===lesson));
    const priority=q=>q.difficulty===level?0:q.difficulty==='medium'?1:2;
    const questions=shuffle(pool).sort((a,b)=>priority(a)-priority(b)).slice(0,40).map(q=>presentQuestion(q));
    if(!questions.length)throw Error('لا توجد أسئلة في هذا النطاق.');
    ranked=false;install(WallRules.start(questions,level,unit,lesson));
   }
  }catch(error){message=error.message;}
  finally{pending=false;ui();}
  if((!active()||document.hidden)&&round?.phase==='playing')void act('pause');
 }
 async function act(action,option){
  if(!round||pending)return;
  if(action==='answer'&&(round.phase!=='playing'||round.delay>elapsed()))return;
  const token=scope,q=question(),prior=round.phase;
  pending=true;message='';
  try{
   const result=ranked?await Auth.wallRpc('wall_act',{p_id:round.id,p_action:action,p_question:q?.id||null,p_option:option||null})
    :WallRules.act(round,elapsed(),action,q?.id,option);
   if(token!==db.scopeToken())return;
   install(result);
   if(prior!=='feedback'&&round.phase==='feedback')playSound(round.feedback.correct?'correct':'wrong');
  }catch(error){message=error.message;if(action==='state')stateRequested=true;}
  finally{pending=false;ui();}
  const shouldPause=suspend||!active()||document.hidden;
  suspend=false;
  if(shouldPause&&round?.phase==='playing'&&action!=='pause')void act('pause');
 }
 function leave(){
  cancelAnimationFrame(raf);
  if(round?.phase==='playing'){if(pending)suspend=true;else void act('pause');}
 }
 document.addEventListener('visibilitychange',()=>{
  if(!active())return;
  if(document.hidden)leave();else{ui();if(round?.phase==='playing'&&ranked&&!pending)void act('state');}
 });
 document.addEventListener('change',event=>{
  if(!active())return;
  const value=event.target.value;
  if(event.target.id==='wall-unit'){unit=value;lesson='all';ui();}
  if(event.target.id==='wall-lesson')lesson=value;
  if(event.target.id==='wall-level')level=value;
  if(event.target.id==='wall-period'){period=value;board=null;void refreshBoard();}
 });
 document.addEventListener('click',event=>{
  const b=event.target.closest('[data-wall]');if(!b||!active())return;
  const action=b.dataset.wall;
  if(action==='sound'){S.settings.sounds=!S.settings.sounds;void saveState().catch(()=>{});if(S.settings.sounds)playSound('tap');ui();return;}
  if(action==='ranked'||action==='practice'){void start(action==='ranked');return;}
  if(action==='replay'&&!pending){round=null;message='';ui();return;}
  if(action==='exit'&&!confirm('إنهاء المحاولة الآن؟ المحاولة المنسحَب منها لا تدخل الترتيب.'))return;
  void act(action,b.dataset.value);
 });
 return {view,bind,enter,leave,card:()=>`<article class="surface panel wall-catalog"><div aria-hidden="true" class="wall-icon">▦</div><h2>تحدي الجدار – سباق مع المعرفة</h2><p>ادفع الجدار بإجاباتك الصحيحة وابقَ في التحدي لأطول وقت.</p><button type="button" class="btn btn-gold" data-action="navigate" data-page="wall">ابدأ التحدي</button></article>`};
})();
