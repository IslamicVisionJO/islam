import {games,levels,random,deck} from './core.mjs';
import {runSolo} from './solo.mjs';

export const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const option=(v,t)=>`<option value="${escape(v)}">${escape(t)}</option>`;
export async function mount(panel,host){
 let destroyed=false,cleanRound,cleanRoom,busy=false,screen='setup';
 const life=new AbortController(),listen={signal:life.signal};
 const bank=host.bank||await fetch(new URL('bank.json',import.meta.url)).then(r=>{if(!r.ok)throw Error();return r.json();});
 const id=host.id,game=games[id];
 let semester=1,unit='*',level='easy',duration=90,scope='term',selected=new Set(),mode='solo';
 const filtered=()=>bank.lessons.filter(l=>Number(l.semester)===semester&&(scope==='term'||l.unit===unit));
 const lessonIds=()=>filtered().filter(l=>scope!=='lessons'||selected.has(l.id)).map(l=>l.id);
 const count=()=>mode==='online'?Math.max(1,Math.floor(duration/30)):Math.ceil(duration/45)+1;
 const available=()=>bank.questions.filter(q=>q.level===level&&lessonIds().includes(q.lesson)).length;
 panel.dir='rtl';
 const controls=()=>`<div class="toolbar"><button data-do="back">العودة إلى الألعاب</button><span>${game.title}</span></div>`;
 function reset(){
  cleanRound?.();cleanRoom?.();cleanRound=null;cleanRoom=null;screen='setup';busy=false;
  const units=new Map(bank.lessons.filter(l=>Number(l.semester)===semester).map(l=>[l.unit,l.unitTitle]));
  if(!units.has(unit))unit=units.keys().next().value;
  panel.innerHTML=controls()+`<div class="intro"><img alt="" src="${host.cover||new URL('covers/'+id+'.png',import.meta.url)}"><div><h1>${game.title}</h1><p>${game.tip}</p></div></div>
  <form><div class="fields">
  <label>الفصل الدراسي<select name="semester">${option(1,'الأول · السنة الأولى BTEC')+option(2,'الثاني · السنة الثانية BTEC')}</select></label>
  <label>نطاق الأسئلة<select name="scope">${option('term','جميع دروس الفصل')+option('unit','جميع دروس الوحدة')+option('lessons','اختيار درس أو أكثر')}</select></label>
  ${scope!=='term'?`<label>الوحدة<select name="unit">${[...units].map(([k,v])=>option(k,v)).join('')}</select></label>`:''}
  <label>المستوى<select name="level">${Object.entries(levels).map(([k,v])=>option(k,v)).join('')}</select></label>
  <label>مدة اللعب<select name="duration">${[45,90,180].map(n=>option(n,n+' ثانية')).join('')}</select></label>
  <label>نمط اللعب<select name="mode">${option('solo','فردي')+(!host.offline?option('online','غرفة أونلاين'):'')}</select></label></div>
  ${scope==='lessons'?`<fieldset><legend>الدروس</legend>${filtered().map(l=>`<label><input type="checkbox" value="${escape(l.id)}" ${selected.has(l.id)?'checked':''}> ${escape(l.title)}</label>`).join('')}</fieldset>`:''}
  <p role="status" class="inventory"></p><button type="submit" class="primary"></button></form>
  ${host.isAdmin?'<button data-do="admin">إدارة المواجهات</button>':''}<button data-do="history">سجل جولاتي</button>${host.offline?'':' <a href="arcade/offline.html" download="learning-arcade.html">تحميل الألعاب للعب دون اتصال</a>'}`;
  const f=panel.querySelector('form');
  for(const [k,v] of Object.entries({semester,unit,level,duration,mode,scope}))if(f.elements[k])f.elements[k].value=v;
  const n=available(),need=count();
  f.querySelector('.inventory').textContent=`المتاح ${n} سؤالًا، وتحتاج الجولة إلى ${need}. `+(n<need?'اختر نطاقًا أوسع أو مستوى آخر.':mode==='online'&&!host.userId?'سجّل الدخول إلى حساب المنصة للعب مع الآخرين.':'');
  const submit=f.querySelector('[type=submit]');submit.textContent=mode==='solo'?'ابدأ الجولة':'فتح ردهة المواجهات';submit.disabled=n<need||(mode==='online'&&!host.userId);
 }
 panel.addEventListener('change',e=>{
  if(screen!=='setup')return;
  const t=e.target;if(t.type==='checkbox'){if(t.checked)selected.add(t.value);else selected.delete(t.value);}
  else switch(t.name){case 'semester':semester=Number(t.value);selected.clear();break;case 'unit':unit=t.value;selected.clear();break;case 'scope':scope=t.value;break;case 'level':level=t.value;break;case 'duration':duration=Number(t.value);break;case 'mode':mode=t.value;break;default:return;}
  reset();
 },listen);
 panel.addEventListener('click',e=>{
  const a=e.target.closest('[data-do]')?.dataset.do;
  if(a==='back')host.close();if(a==='setup')reset();
  if(a==='admin'&&host.isAdmin){screen='admin';import('./admin.mjs').then(m=>{if(!destroyed)m.mountAdmin(panel,host.rpc,reset);});}
  if(a==='history'){
   screen='history';const rows=host.history().filter(r=>r.game===id),best=Math.max(0,...rows.map(r=>r.score));
   panel.innerHTML=controls()+`<section><h1>سجل ${game.title}</h1><p>الجولات المحفوظة ${rows.length} · أفضل نتيجة ${best}</p>${rows.map(r=>`<p>${escape(new Date(r.at).toLocaleDateString('ar'))} · ${escape(r.score)} نقطة · ${escape(r.correct)} إجابات صحيحة من ${escape(r.answered)}</p>`).join('')}<button data-do="setup">العودة للإعدادات</button></section>`;
  }
 },listen);
 panel.addEventListener('submit',async e=>{
  if(screen!=='setup')return;e.preventDefault();if(busy||available()<count())return;busy=true;
  const settings={game:id,level,duration,lessons:lessonIds()};
  try{
   if(mode==='online'){
    const {openLobby}=await import('./online.mjs');if(destroyed)return;screen='room';
    const dispose=await openLobby({container:panel,rpc:host.rpc,verify:host.verify,userId:host.userId,isAdmin:host.isAdmin,settings,onExit:reset});
    if(destroyed)dispose?.();else cleanRoom=dispose;return;
   }
   const module=await (host.loadGame?host.loadGame(id):({blocks:()=>import('./blocks.mjs'),space:()=>import('./space.mjs'),tiles:()=>import('./tiles.mjs'),bubbles:()=>import('./bubbles.mjs')})[id]());if(destroyed)return;
   const seed=crypto.getRandomValues(new Uint32Array(1))[0],questions=deck(bank.questions,settings.lessons,level,count(),random(seed^0x68bc21eb));
   screen='playing';cleanRound=runSolo(panel,{...host,settings,module,questions,rng:random(seed),onReplay:reset,onFriend:()=>{mode='online';reset();},lessons:bank.lessons});
  }catch(error){if(!destroyed){reset();panel.querySelector('.inventory').textContent='تعذر بدء الجولة. '+(mode==='online'?'تحقق من اتصال الحساب وتفعيل خدمة الغرف.':error.message);}}
  finally{busy=false;}
 },listen);
 reset();return ()=>{destroyed=true;life.abort();cleanRound?.();cleanRoom?.();};
}
