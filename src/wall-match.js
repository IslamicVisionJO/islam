const WallMatch=(()=>{
 const active=()=>S.page==='wall-online';
 const player=()=>authState().mode==='account';
 let room=null, pending=false, blocked=false, checking=true, message='', mark=0, timer=0, generation=0;
 let unit='all',lesson='all',level='medium', code='';
 const elapsed=()=>Math.max(0,(performance.now()-mark)/1000);
 const ui=()=>{if(active())render();};
 const button=(action,label)=>`<button type="button" class="btn btn-outline" data-wall-match="${action}" ${pending?'disabled':''}>${e(label)}</button>`;
 const select=(id,label,options,value)=>`<label>${label}<select id="${id}">${options.map(([key,name])=>`<option value="${e(key)}" ${key===value?'selected':''}>${e(name)}</option>`).join('')}</select></label>`;

 function lobby(){
  if(!player())return '<section class="surface panel"><p>سجّل الدخول بحسابك لإنشاء مواجهة أو الانضمام إلى صديقك.</p><button class="btn btn-outline" data-action="auth-signout">العودة لتسجيل الدخول</button></section>';
  if(checking)return '<p role="status">جارٍ التحقق من اتصال الأونلاين…</p>';
  if(blocked)return button('retry','إعادة المحاولة');
  return `<section class="surface panel"><h2>أنشئ مواجهة</h2><p>يلعب كلاكما ترتيب الأسئلة نفسه. يبدأ عدّ مشترك مدته 90 ثانية بعد انضمام صديقك.</p>
   <div class="wall-settings">${select('wall-match-unit','الوحدة',[['all','جميع الوحدات'],...S.units.map(u=>[u.id,u.name])],unit)}
   ${select('wall-match-lesson','الدرس',[['all','جميع الدروس'],...S.units.filter(u=>unit==='all'||u.id===unit).flatMap(u=>u.lessons.map(l=>[l.id,l.name]))],lesson)}
   ${select('wall-match-level','المستوى',Object.entries(DIFF_NAMES),level)}</div>
   ${button('create','إنشاء مواجهة')}</section>
   <form class="surface panel wall-join" id="wall-join"><h2>انضم إلى صديقك</h2><label>رمز الدعوة<input dir="ltr" name="code" value="${e(code)}" required maxlength="8" autocomplete="off" autocapitalize="characters"></label>
   <button type="submit" class="btn btn-gold" ${pending?'disabled':''}>انضمام</button></form>`;
 }
 function matchup(){
  if(room.status==='waiting')return `<section class="surface panel"><h2>بانتظار صديقك</h2>
   <p>أرسل رمز الدعوة لصديقك ليدخله من صفحة الأونلاين في سباق الجدار. يبقى الرمز صالحًا 10 دقائق.</p>
   <strong class="online-invite-code" dir="ltr" data-wall-code>${e(room.code)}</strong>
   <div class="wall-controls">${button('copy','نسخ الرمز')}${button('leave','إلغاء المواجهة')}</div></section>`;
  if(room.status==='cancelled')return `<section class="surface panel"><h2>${room.reason==='expired'?'انتهت صلاحية الدعوة':'أُلغيت المواجهة'}</h2>${button('new','مواجهة جديدة')}</section>`;
  const r=room.round;
  const summary=`<div class="wall-hud wall-match-score"><span>أنت <b>${nf(r.score)}</b></span><span>${e(room.opponent||'المنافس')} <b>${nf(room.opponentScore)}</b></span>
   <span>الوقت المشترك <b id="wall-match-time">${fmt(secondsLeft())}</b></span></div>`;
  if(room.status==='active'&&r.phase!=='finished')return summary+Wall.play(r,r.question,elapsed,pending,true);
  if(room.status==='active')return summary+'<p role="status">انتهت جولتك. بانتظار صديقك أو انتهاء الوقت المشترك.</p>';
  const title=room.winner==='you'?'فزت بالمواجهة':room.winner==='tie'?'تعادلتما':'فاز منافسك';
  const reason=room.reason==='forfeit'?'حُسمت المواجهة بالانسحاب.':room.reason==='timeout'?'انتهى الوقت المشترك.':'انتهت جولة اللاعبين.';
  return summary+`<section class="surface panel wall-result"><h2>${title}</h2><p>${reason}</p>
   ${r.receipts.filter(a=>!a.correct).map(a=>`<details><summary>${e(a.prompt)}</summary><p>${e(a.answer)}<br>${e(a.explanation)}</p></details>`).join('')}
   ${button('new','مواجهة جديدة')}</section>`;
 }
 const secondsLeft=()=>room?.deadline?Math.max(0,(Date.parse(room.deadline)-Date.parse(room.serverNow))/1000-elapsed()):0;
 function view(){
  return heroTitle('سباق الجدار أونلاين','يتنافس لاعبان بالنقاط والوقت المشترك',
   '<button class="btn btn-outline" data-action="navigate" data-page="educational">جميع الألعاب</button>')+
   (message?`<p class="auth-message is-error" role="status">${e(message)}</p>`:'')+
   (room?matchup():lobby());
 }
 function bind(){
  const r=room?.round;
  if(r&&room.status==='active'&&r.phase!=='finished'){
   Wall.bindScene(r,elapsed,()=>active()&&room?.round===r,ui,()=>void send('state'));
  }
 }
 function schedule(){
  clearTimeout(timer);
  if(active()&&room&&['waiting','active'].includes(room.status)){
   timer=setTimeout(async()=>{
    const time=document.querySelector('#wall-match-time');
    if(time)time.textContent=fmt(secondsLeft());
    await send('state');schedule();
   },2200);
  }
 }
 async function send(action,extra={}){
  if(!active()||!player()||pending)return;
  const request=generation,token=db.scopeToken();
  const previous=room?.round?.phase;
  pending=true;
  try{
   const next=await Auth.wallRpc('wall_match',{p_action:action,p_id:room?.id??null,...extra});
   if(request!==generation||token!==db.scopeToken())return;
   room=next;mark=performance.now();blocked=false;message='';
   if(action==='play'&&previous!=='feedback'&&room?.round?.phase==='feedback'){
    playSound(room.round.feedback.correct?'correct':'wrong');
   }
  }catch(error){
   if(request!==generation||token!==db.scopeToken())return;
   if(checking)blocked=true;
   message=error.message;
  }finally{
   if(request===generation){checking=false;pending=false;ui();schedule();}
  }
 }
 async function enter(){
  generation++;pending=false;room=null;message='';blocked=false;checking=player();clearTimeout(timer);ui();
  if(player())await send('state');
 }
 function leave(){generation++;clearTimeout(timer);pending=false;}
 document.addEventListener('change',event=>{
  if(!active())return;
  const value=event.target.value;
  if(event.target.id==='wall-match-unit'){unit=value;lesson='all';ui();}
  if(event.target.id==='wall-match-lesson')lesson=value;
  if(event.target.id==='wall-match-level')level=value;
 });
 document.addEventListener('input',event=>{if(active()&&event.target.form?.id==='wall-join')code=event.target.value;});
 document.addEventListener('submit',event=>{
  if(event.target.id!=='wall-join'||!active())return;
  event.preventDefault();
  void send('join',{p_code:code.trim().toUpperCase()});
 });
 document.addEventListener('click',async event=>{
  if(!active())return;
  const control=event.target.closest('[data-wall-match],[data-wall]');
  if(!control||pending)return;
  const action=control.dataset.wallMatch||control.dataset.wall;
  if(action==='retry'){await enter();return;}
  if(action==='new'){room=null;message='';code='';ui();return;}
  if(action==='create'){await send('create',{p_level:level,p_unit:unit,p_lesson:lesson});return;}
  if(action==='copy'){try{await navigator.clipboard.writeText(room.code);notify('نُسخ رمز الدعوة.');}catch{notify('حدد الرمز الظاهر وانسخه.');}return;}
  if(action==='leave'||action==='exit'){if(confirm(room.status==='waiting'?'إلغاء المواجهة؟':'الانسحاب يمنح الفوز لصديقك. هل تريد المتابعة؟'))await send('leave');return;}
  if(action==='sound'){S.settings.sounds=!S.settings.sounds;void saveState().catch(()=>{});ui();return;}
  if(action==='answer'&&room?.round?.phase==='playing'&&room.round.delay<=elapsed())
   await send('play',{p_move:'answer',p_question:room.round.question?.id,p_option:control.dataset.value});
  if(action==='next'&&room?.round?.phase==='feedback')await send('play',{p_move:'next'});
 });
 return {view,bind,enter,leave};
})();
