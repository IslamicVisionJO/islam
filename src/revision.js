/** The catalog has shared lesson IDs for routing and explicit aliases for academic progress. */
const Revision=(()=>{
 const catalog=REVISION_CATALOG;
 const lessons=new Map(catalog.flatMap(l=>[[l.id,l],...(l.academicId?[[l.academicId,l]]:[])]));
 const academic=new Map(ACADEMIC_SEMESTER.units.flatMap(u=>u.lessons.map(l=>[l.id,l])));
 const cache=new Map(), pending=new Map(), failures=new Set();
 const normalize=s=>s.normalize('NFKC').replace(/[\p{M}ـ]/gu,'').replace(/[أإآٱ]/g,'ا').trim();
 let archivePage=0;
 let selected=catalog[0],query='',globalSearch=false,filter='',single=false,index=0,scope,searchVersion=0;
 const state=()=>S.profile.revisionStudy||{};
 function loaded(id,kind='rows'){return cache.get(id+kind)||(kind==='rows'&&OFFLINE_REVISION?.[id]?{rows:OFFLINE_REVISION[id]}:null);}
 async function load(id,kind='rows'){
  const key=id+kind;
  if(loaded(id,kind))return loaded(id,kind);
  if(!pending.has(key)){
   const task=fetch('lesson-data/'+LESSON_FILES[id][kind]).then(async response=>{
    if(!response.ok)throw Error('HTTP '+response.status);
    const chapter=await response.json();
    if(kind==='rows'&&chapter.rows?.length!==lessons.get(id).count)throw Error('Invalid lesson data');
    cache.set(key,chapter);
    if(kind==='levels')MINISTERIAL_REVIEW[id]=chapter.levels;
    failures.delete(key);
    return chapter;
   }).catch(error=>{failures.add(key);throw error;}).finally(()=>pending.delete(key));
   pending.set(key,task);
  }
  return pending.get(key);
 }
 function loading(id,kind='rows'){
  const key=id+kind;
  if(!failures.has(key)&&!pending.has(key)){
   void load(id,kind).catch(()=>{}).finally(()=>{
    if((S.page==='revision'&&selected.id===id)||(S.page==='learning'&&Learning.selectedLesson()===id))render();
   });
  }
  return failures.has(key)?`<p role="alert">تعذر تحميل الدرس. <button class="btn" data-revision-retry="${e(key)}">إعادة المحاولة</button></p>`:'<p role="status">جارٍ تحميل محتوى الدرس…</p>';
 }
 function persist(change){
  return Learning.updateProfile(profile=>{profile.revisionStudy??={};change(profile.revisionStudy);}).catch(()=>notify('تعذر حفظ تقدم المكثف.'));
 }
 function open(id,replace=false,legacyPage=0){
  if(scope!==db.scopeToken()){scope=db.scopeToken();query='';filter='';single=false;archivePage=0;}
  if(legacyPage)archivePage=legacyPage;
  selected=lessons.get(id)||lessons.get(state().lesson)||catalog[0];
  query='';globalSearch=false;single=Boolean(state().single);
  index=single&&state().lesson===selected.id?state().index||0:0;searchVersion++;
  const hash='#revision/'+selected.id;
  if(location.hash!==hash)history[replace?'replaceState':'pushState'](null,'',hash);
  go('revision');
  if(state().lesson!==selected.id)void persist(s=>{s.lesson=selected.id;s.index=0;});
 }
 function restore(){
  const match=location.hash.match(/^#revision(?:\/([\w-]+))?$/);
  if(!match)return false;
  // Numeric bookmarks open the archive link; their page numbers belong to the original PDF.
  const oldPage=Number(match[1]);
  if(oldPage>0&&Number.isInteger(oldPage)){
   open(undefined,true,oldPage);notify('يمكن فتح الصفحة القديمة من رابط النسخة السابقة.');
  }else open(match[1],true);
  return true;
 }
 function button(id,label='راجع هذا الدرس في المكثف'){
  const l=lessons.get(id);
  return l?`<a class="btn btn-outline" href="#revision/${l.id}">${e(label)}</a>`:'';
 }
 function entries(id){
  return (loaded(id)?.rows||[]).map((row,i)=>({row,number:i+1,lesson:lessons.get(id)}));
 }
 function article({row,number,lesson},controls){
  const flags=state().marks?.[row.id]||{};
  return `<article class="revision-entry" data-card="${e(row.id)}"><small>${e(row.category)} · ${row.range?'نطاق الدرس':'ص'} ${row.pages.map(nf).join(row.range?'–':'، ')}</small>
   <h3>${nf(number)}. ${e(row.question)}</h3><p>${e(row.answer)}</p><small>${e(row.source)}${row.status==='draft'?' · مادة مراجعة أولية':row.status==='suggested'?' · إجابة مقترحة':['verify','needs_human_review'].includes(row.status)?' · تحتاج إلى تحقق':''}</small>
   ${controls?`<div class="study-actions no-print">${[['saved','حفظ للمراجعة'],['difficult','صعب'],['mastered','أتقنت']].map(([key,label])=>`<button class="btn btn-outline" data-mark="${key}" data-lesson-id="${lesson.id}" aria-pressed="${Boolean(flags[key])}">${label}</button>`).join('')}</div>`:''}</article>`;
 }
 function panel(id){
  if(!loaded(id))return loading(id);
  return `<div class="revision-list">${entries(id).map(item=>article(item,false)).join('')}</div>`;
 }
 function results(){
  const rows=(globalSearch?catalog.flatMap(l=>entries(l.id)):entries(selected.id)).filter(({row,lesson})=>
   (!filter||state().marks?.[row.id]?.[filter])&&(!query||normalize([lesson.title,row.question,row.answer].join(' ')).includes(normalize(query))));
  index=Math.max(0,Math.min(index,rows.length-1));
  return `<p role="status">${nf(rows.length)} سؤالًا</p>${single&&rows.length?`<div class="study-actions no-print"><button class="btn" data-rev-step="-1" ${index?'':'disabled'}>السابق</button><span>${nf(index+1)} / ${nf(rows.length)}</span><button class="btn" data-rev-step="1" ${index===rows.length-1?'disabled':''}>التالي</button></div>`:''}
   ${(single?rows.slice(index,index+1):rows).map(item=>(globalSearch?`<h2>${button(item.lesson.id,item.lesson.title)}</h2>`:'')+article(item,true)).join('')}`;
 }
 function options(items,current){return items.map(([key,label])=>`<option value="${e(key)}" ${key===current?'selected':''}>${e(label)}</option>`).join('');}
 function view(){
  const l=selected,term=catalog.filter(x=>x.semester===l.semester),unit=term.filter(x=>x.unit===l.unit);
  return `<section class="surface panel revision-reader">${heroTitle('المكثف الشامل',e(l.title))}
   <div class="study-filters no-print"><label>الفصل<select id="rev-term">${options([[1,'الفصل الأول'],[2,'الفصل الثاني']],l.semester)}</select></label>
   <label>الوحدة<select id="rev-unit">${options([...new Set(term.map(x=>x.unit))].map(n=>[n,'الوحدة '+nf(n)]),l.unit)}</select></label>
   <label>الدرس<select id="rev-lesson">${options(unit.map(x=>[x.id,x.title]),l.id)}</select></label></div>
   <p>مراجعة دراسية من الكتاب المدرسي وحلول الكتاب وتدريبات المنصة. الإجابات المقترحة أمثلة للأنشطة المفتوحة. يشير نطاق الدرس إلى الصفحات التي يشملها الدرس كاملًا.</p>
   <form id="revision-search" class="study-filters no-print"><label>بحث<input type="search" name="query" value="${e(query)}"></label>
   <label>النطاق<select name="scope">${options([['lesson','داخل الدرس'],['all','الفصلان']],globalSearch?'all':'lesson')}</select></label>
   <label>حالة السؤال<select name="filter">${options([['','الكل'],['saved','محفوظ'],['difficult','صعب'],['mastered','متقن']],filter)}</select></label><button class="btn">بحث وتصفية</button></form>
   <div class="study-actions no-print"><button class="btn" data-rev-mode>${single?'عرض جميع الأسئلة':'مراجعة سؤال واحد'}</button><button class="btn" data-rev-print>طباعة العرض</button>
   <a href="revision-downloads/semester-${l.semester}.pdf" download>تحميل مكثف الفصل PDF</a><a href="revision-downloads/full.pdf" download>تحميل المكثف كاملًا PDF</a>
   <a href="content/BTEC_Islamic_Education_Revision.pdf${(archivePage||Number(S.profile.revisionPage))>0?'#page='+(archivePage||Number(S.profile.revisionPage)):''}" data-revision-archive>النسخة السابقة</a></div>
   <div class="revision-list" id="rev-results">${loaded(l.id)?results():loading(l.id)}</div></section>`;
 }
 document.addEventListener('change',ev=>{
  if(ev.target.id==='rev-term')open(catalog.find(l=>l.semester===Number(ev.target.value)).id);
  if(ev.target.id==='rev-unit')open(catalog.find(l=>l.semester===selected.semester&&l.unit===Number(ev.target.value)).id);
  if(ev.target.id==='rev-lesson')open(ev.target.value);
 });
 document.addEventListener('submit',async ev=>{
  if(ev.target.id!=='revision-search')return;
  ev.preventDefault();
  const version=++searchVersion,data=new FormData(ev.target),all=data.get('scope')==='all',out=document.querySelector('#rev-results');
  out.textContent='جارٍ البحث…';
  try{
   if(all){
    for(let start=0;start<catalog.length;start+=6){
     if(version!==searchVersion||!out.isConnected)return;
     await Promise.all(catalog.slice(start,start+6).map(l=>load(l.id)));
    }
   }
   if(version!==searchVersion||!out.isConnected)return;
   query=data.get('query');filter=data.get('filter');globalSearch=all;index=0;out.innerHTML=results();
  }catch{if(out.isConnected)out.textContent='تعذر تحميل نتائج البحث كاملة. أعد البحث.';}
 });
 document.addEventListener('click',async ev=>{
  const b=ev.target.closest('button');if(!b)return;
  if(b.dataset.revisionRetry){failures.delete(b.dataset.revisionRetry);render();return;}
  if(b.hasAttribute('data-revision-home')){open();return;}
  if(!b.closest('.revision-reader'))return;
  if(b.hasAttribute('data-rev-print')){window.print();return;}
  if(b.hasAttribute('data-rev-mode')){single=!single;index=0;await persist(s=>{s.single=single;s.index=0;});render();return;}
  if(b.dataset.revStep){index+=Number(b.dataset.revStep);if(!globalSearch&&!query&&!filter)await persist(s=>{s.index=index;});render();return;}
  if(b.dataset.mark){
   const id=b.closest('[data-card]').dataset.card,key=b.dataset.mark;
   if(!['saved','mastered','difficult'].includes(key))return;
   await persist(s=>{s.marks??={};s.marks[id]??={};s.marks[id][key]=!s.marks[id][key];});
   if(S.page==='revision')render();
  }
 });
 return {open,restore,view,button,panel,loaded,loading,meta:id=>lessons.get(id),academicLesson:id=>academic.get(id)};
})();
