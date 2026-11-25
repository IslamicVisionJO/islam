/** Learning data extends the existing account profile, including its existing sync route. */
const Learning=(()=>{
 const years=[
  {id:'btec1',name:'السنة الأولى BTEC',units:FIRST_BTEC_LESSONS},
  {id:'btec2',name:'السنة الثانية BTEC',units:LEARNING_DATA.units}
 ];
 const catalogLessons=years.flatMap(year=>year.units.flatMap(unit=>unit.lessons));
 let selected=null,selectedYear=null,selectedUnit=null,tab='explanation',search='',saveQueue=Promise.resolve();
 let reviewLevel='easy',reviewIndex=0,reviewAnswer=null;
 const reviewBank=new Map(), reviewLoading=new Set();
 const normalize=s=>s.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا');
 const asset=p=>new URL(p,new URL('./',location.href)).href;
 const media=p=>MEDIA_CONFIG.baseUrl?new URL(p,MEDIA_CONFIG.baseUrl.replace(/\/?$/,'/')).href:asset(p);
 function mergeRanges(ranges){const result=[];for(const [a,b] of ranges.filter(x=>x.length===2&&x.every(Number.isFinite)&&x[1]>x[0]&&x[0]>=0).sort((a,b)=>a[0]-b[0])){const last=result.at(-1);if(last&&a<=last[1]+.1)last[1]=Math.max(last[1],b);else result.push([a,b]);}return result;}
 const progress=id=>S.profile.learning?.[id]||{};
 function updateProfile(change){
  const token=db.scopeToken();
  saveQueue=saveQueue.catch(()=>{}).then(async()=>{
   if(token!==db.scopeToken()||S.writerBlocked||S.writerSuspended)return;
   const profile=clone(S.profile);
   change(profile);
   await db.put('profile',profile,{scopeToken:token});
   if(token!==db.scopeToken())return;
   for(const key of ['learning','lastLearningLesson','revisionPage','academicSemesterOne','revisionStudy']){
    if(Object.hasOwn(profile,key))S.profile[key]=profile[key];
   }
  });
  return saveQueue;
 }
 function save(id,patch){
  return updateProfile(next=>{
   next.learning??={};
   next.learning[id]={...next.learning[id],...patch};
  });
 }
 const lessonTabs=[['explanation','الشرح'],['video','الفيديو'],['solutions','حلول الكتاب'],...(typeof LOCAL_REVIEW!=="undefined"&&LOCAL_REVIEW?[['quiz','مراجعة بنك الأسئلة']]:[]),['revision','المكثف']];
 function route(hash){
  if(location.hash!==hash)history.pushState(null,'',hash);
 }
 function lessonHash(){return '#learning/'+selectedYear.id+'/'+selectedUnit.id+'/'+selected+'/'+tab;}
 function show(year,unit,page='learning'){
  selected=null;
  selectedYear=year||null;
  selectedUnit=unit||null;
  search='';
  route((page==='units'?'#questions':'#learning')+(year?'/'+year.id:'')+(unit?'/'+unit.id:''));
  go(page);
 }
 function catalog(){show();}
 function questionsCatalog(){show(null,null,'units');}
 function questionsUnit(id){
  const year=years.find(year=>year.units.some(unit=>unit.id===id));
  if(year)show(year,year.units.find(unit=>unit.id===id),'units');
 }
 function open(id,initialTab='explanation'){
  const lesson=catalogLessons.find(l=>l.id===id);
  if(!lesson)return;
  if(initialTab==='solutions'&&!id.startsWith('s1_')){BookSolutions.open(id);return;}
  if(selected!==id){
   Ministerial.reset();
   reviewLevel='easy';
   reviewIndex=0;
   reviewAnswer=null;
  }
  selected=id;
  selectedYear=years.find(year=>year.units.some(unit=>unit.id===lesson.unitId||unit.id===lesson.unit_id));
  selectedUnit=selectedYear.units.find(unit=>unit.lessons.includes(lesson));
  tab=lessonTabs.some(([key])=>key===initialTab)?initialTab:'explanation';
  route(lessonHash());
  go('learning');
  if(S.profile.lastLearningLesson!==id)void updateProfile(next=>{next.lastLearningLesson=id;}).catch(()=>notify('تعذر حفظ آخر درس.'));
 }
 function openQuestions(id){
  const year=years[0],unit=year.units.find(u=>u.lessons.some(l=>l.id===id));
  if(!unit)return;
  lesson(id);
 }
 function restore(){
  if(['#steam','#life'].includes(location.hash)){const life=location.hash==='#life';go('knowledge');if(life)document.querySelector('#knowledge-life')?.scrollIntoView();return;}
  if(typeof AcademicSemester!=='undefined'&&AcademicSemester.restore())return;
  if(S.session)return;
  if(Revision.restore())return;
  if(location.hash==='#learning/solutions'){BookSolutions.open();return;}
  const solution=location.hash.match(/^#learning\/(u\d\d_l\d\d)\/solutions$/);
  if(solution){BookSolutions.open(solution[1]);return;}
  if(location.hash==='#compendium'){Revision.open();return;}
  const fullLesson=location.hash.match(/^#learning\/(btec[12])\/((?:s1_)?u0[1-4])\/((?:s1_)?u0[1-4]_l\d\d)(?:\/([a-z]+))?$/);
  if(fullLesson){
   const year=years.find(y=>y.id===fullLesson[1]),unit=year?.units.find(u=>u.id===fullLesson[2]);
   if(unit?.lessons.some(l=>l.id===fullLesson[3])){open(fullLesson[3],fullLesson[4]||'explanation');return;}
  }
  const lesson=location.hash.match(/^#learning\/(?:btec[12]\/)?((?:s1_)?u\d\d_l\d\d)(?:\/([a-z]+))?$/);
  if(lesson){open(lesson[1],lesson[2]||'video');return;}
  const firstQuestions=location.hash.match(/^#questions\/btec1\/(s1_u0[1-4])\/(s1_u0[1-4]_l\d\d)$/);
  if(firstQuestions&&firstQuestions[2].startsWith(firstQuestions[1]+'_')){openQuestions(firstQuestions[2]);return;}
  const directory=location.hash.match(/^#(learning|questions)(?:\/(btec[12])(?:\/((?:s1_)?u0[1-4]))?)?$/);
  if(directory){
   const year=years.find(y=>y.id===directory[2]);
   show(year,year?.units.find(unit=>unit.id===directory[3]),directory[1]==='questions'?'units':'learning');
  }
 }
 function completion(list){
  const completed=list.filter(l=>progress(l.id).completed===true).length;
  const percent=Math.round(100*completed/list.length);
  return `<progress max="100" value="${percent}" aria-label="نسبة اكتمال المشاهدة"></progress><p>${nf(completed)} من ${nf(list.length)} اكتملت مشاهدتها • ${nf(percent)}٪</p>`;
 }
 function progressView(){
  return `<section class="surface panel" aria-label="تقدم مشاهدة الدروس"><h2>تقدم مشاهدة الدروس</h2>
   ${completion(catalogLessons)}
   <div class="learning-units">${years.map(year=>{
    const lessons=year.units.flatMap(unit=>unit.lessons);
    const videos=lessons.filter(lesson=>lesson.video);
    const seconds=videos.reduce((sum,lesson)=>sum+mergeRanges(progress(lesson.id).ranges||[]).reduce((n,[a,b])=>n+b-a,0),0);
    return `<article><h3>${year.name}</h3>${completion(lessons)}<p>${nf(videos.length)} فيديو متاح · ${nf(Math.floor(seconds/60))} دقيقة مشاهدة فعلية</p>
     <button class="btn btn-outline" data-learning="year" data-id="${year.id}">عرض وحدات السنة</button></article>`;
   }).join('')}</div>
  </section>`;
 }
 function trail(lesson){
  const action=(kind,id,title)=>`<button class="text-link" data-learning="${kind}" data-id="${id}">${e(title)}</button>`;
  return `<nav class="learning-trail" aria-label="مسار الدرس">${action('catalog','',S.page==='units'?'الدروس والأسئلة':'شرح الدروس')}
   ${selectedYear?`<span aria-hidden="true">/</span>${action('year',selectedYear.id,selectedYear.name)}`:''}
   ${selectedUnit?`<span aria-hidden="true">/</span>${action('unit',selectedUnit.id,selectedUnit.name)}`:''}
   ${lesson?`<span aria-hidden="true">/</span><span class="learning-current" aria-current="page">${e(lesson.name)}</span>`:''}</nav>`;
 }
 function directory(){
  const questions=S.page==='units';

  if(!selectedYear){
   const last=catalogLessons.find(l=>l.id===S.profile.lastLearningLesson);
   return `${heroTitle(questions?'الدروس والأسئلة':'شرح الدروس','اختر السنة الدراسية')}
    <div class="learning-units">${years.map(year=>{
     const list=year.units.flatMap(unit=>unit.lessons),videos=list.filter(lesson=>lesson.video).length;
     return `<section class="surface panel"><h2>${year.name}</h2><p>${nf(year.units.length)} وحدات • ${nf(list.length)} درسًا${questions?'':' • '+nf(videos)+' فيديو متاح'}</p>
     ${questions?'':completion(list)}<button class="btn btn-gold" data-learning="year" data-id="${year.id}" aria-label="اختر ${year.name}">اختر السنة</button></section>`;
    }).join('')}</div>
    ${questions?'':`<div class="study-actions">${last?`<button class="btn btn-gold" data-learning="open" data-id="${last.id}">متابعة آخر درس · ${e(last.name)}</button>`:''}
    <button class="btn btn-outline" data-learning="solutions-catalog">حلول كتاب السنة الثانية</button>
    <button class="btn btn-outline" data-revision-home>المكثف الشامل</button></div>`}`;
  }
  if(!selectedUnit)return `${trail()}${heroTitle(selectedYear.name,'اختر الوحدة')}
   <div class="learning-units">${selectedYear.units.map(unit=>`<section class="surface panel"><h2>${e(unit.name)}</h2>
    ${questions?`<p>${nf(unit.lessons.length)} دروس</p>`:completion(unit.lessons)}<button class="btn btn-gold" data-learning="unit" data-id="${unit.id}" aria-label="افتح ${e(unit.name)}">افتح الوحدة</button></section>`).join('')}</div>`;
  const items=selectedUnit.lessons.filter(l=>normalize(l.name).includes(normalize(search)));
  return `${trail()}${heroTitle(e(selectedUnit.name),'اختر الدرس')}
   <label>البحث داخل الوحدة <input id="learning-search" type="search" value="${e(search)}" placeholder="اسم الدرس"></label>
   <div class="learning-units">${items.map(l=>{
    const result=S.results.findLast(row=>row.lessonId===l.id||(row.lessonIds?.length===1&&row.lessonIds[0]===l.id));
    const number=selectedUnit.lessons.indexOf(l)+1;
    const details=questions?[]:[progress(l.id).completed?'اكتملت المشاهدة':l.video?'فيديو متاح':'الفيديو غير متاح'];
    if(Number.isFinite(result?.accuracy))details.push('آخر نتيجة '+nf(result.accuracy)+'٪');
    let destination=`data-learning="open" data-id="${l.id}"`;
    if(questions)destination=`data-action="lesson" data-lesson="${l.id}"`;
    return `<article class="surface panel"><small>الدرس ${nf(number)} · صفحة ${nf(l.startPage)}</small><h2>${e(l.name)}</h2>
     ${details.length?`<p>${details.join(' · ')}</p>`:''}
     <button class="btn btn-gold" ${destination} aria-label="افتح ${e(l.name)}">${questions?'أسئلة الدرس':'افتح الدرس'}</button></article>`;
   }).join('')}</div>${items.length?'':'<p>لم يُعثر على درس مطابق.</p>'}`;
 }
 function revisionPanel(lesson){
  return Revision.button(lesson.id);
 }
 function reviewView(lesson){
  if(!LOCAL_REVIEW)return '<p>أسئلة هذا الدرس بانتظار المراجعة العلمية والاعتماد.</p>';
  if(!reviewBank.has(lesson.id))return '<p role="status">جارٍ تحميل الأسئلة المرشحة…</p>';
  const records=reviewBank.get(lesson.id);
  if(!records)return '<p>تعذر تحميل الأسئلة المرشحة.</p><button class="btn btn-outline" data-learning="review-retry">حاول مجددًا</button>';
  const games=reviewLevel==='games';
  const items=records.filter(q=>games?q.delivery_allocation==='games_challenges':q.delivery_allocation==='lesson_wizari'&&q.difficulty===reviewLevel);
  const question=items[reviewIndex];
  const flagLabels={
   correct_option_length_bias:'طول الخيار الصحيح',
   compound_item_review:'ملاءمة صيغة السؤال المركب',
   concept_overlap_and_difficulty_review:'تداخل المفاهيم والصعوبة'
  };
  return `<p class="muted">معاينة محلية قبل اعتماد المعلم.</p>
   <label>نوع الأسئلة أو المستوى <select id="first-btec-level">${[['easy','سهل'],['medium','متوسط'],['hard','صعب'],['games','مرشحات الألعاب والتحديات']].map(([id,label])=>`<option value="${id}" ${id===reviewLevel?'selected':''}>${label}</option>`).join('')}</select></label>
   <p>${nf(reviewIndex+1)} / ${nf(items.length)}</p><h2>${e(question.prompt)}</h2>
   <p class="muted">${e(question.id)}${question.flags.length?' · أولوية المراجعة: '+e(question.flags.map(flag=>flagLabels[flag]||flag).join('، ')):''}</p>
   ${games?`${['options','left','right','items'].filter(key=>question.payload[key]).map(key=>
    `<ul>${question.payload[key].map(item=>`<li>${e(item.text)}</li>`).join('')}</ul>`).join('')}
    <details class="learning-card"><summary>الإجابة المرجعية في المسودة</summary><p>${e(describeAnswer(question))}</p>
    <p>${e(question.explanation)}</p><p>مرجع الكتاب · صفحة ${question.source.printed_pages.map(nf).join('، ')}</p></details>`:`<div class="study-answers">${question.payload.options.map((o,index)=>`<button class="btn btn-outline" data-learning="review-answer" data-id="${e(o.id)}" aria-pressed="${o.id===reviewAnswer}">${['أ','ب','ج','د'][index]}. ${e(o.text)}</button>`).join('')}</div>`}
   ${!games&&reviewAnswer?`<div role="status"><strong>${reviewAnswer===question.answer.option_id?'إجابة صحيحة بحسب المسودة':'راجع الإجابة في المسودة'}</strong>
    <p>${e(question.payload.options.find(o=>o.id===question.answer.option_id).text)}</p><p>${e(question.explanation)}</p>
    <p>مرجع الكتاب · صفحة ${question.source.printed_pages.map(nf).join('، ')}</p></div>`:''}
   <div class="study-actions"><button class="btn btn-outline" data-learning="review-prev" ${reviewIndex===0?'disabled':''}>السابق</button>
   <button class="btn btn-gold" data-learning="review-next" ${reviewIndex===items.length-1?'disabled':''}>التالي</button></div>`;
 }
 function loadReview(){
  if(!LOCAL_REVIEW||tab!=='quiz'||!selected?.startsWith('s1_')||reviewBank.has(selected)||reviewLoading.has(selected))return;
  const id=selected;
  reviewLoading.add(id);
  fetch(asset('first-btec-review/'+id+'.json')).then(response=>{
   if(!response.ok)throw Error('Question review unavailable');
   return response.json();
  }).then(records=>reviewBank.set(id,records)).catch(()=>reviewBank.set(id,null)).finally(()=>{
   reviewLoading.delete(id);
   if(S.page==='learning'&&selected===id&&tab==='quiz')render();
  });
 }

 // Read-only explanation cards reuse the source-linked answers in the existing bank.
 // The first-year bank is a draft; keep its scientific review status explicit.
 function firstGuideGroups(lesson){
  const buckets=new Map();
  const broad=new Set(['الربط بين معلومات الدرس','تحديد المفهوم أو المحور','تفاصيل الدرس والفهم والتطبيق','تصنيف المفاهيم وتطبيقها ومراجعة التفاصيل','التطبيق والمقارنة','تطبيق','التطبيق','تحليل','الفهم','الربط','ربط','الاستنتاج','تمييز','التصنيف']);
  const questions=EMBEDDED_QUESTIONS.questions.filter(q=>q.lesson_id===lesson.id&&q.delivery_allocation==='lesson_wizari'&&q.type==='multiple_choice'&&!q.review?.excluded);
  for(const q of questions){
   const answer=q.payload.options.find(o=>o.id===q.answer.option_id)?.text;
   const pages=q.source?.printed_pages||[];
   if(!answer||!q.explanation||!pages.length||pages.some(p=>p<lesson.startPage||p>lesson.endPage))continue;
   const topic=(q.topic||'').trim();
   const heading=!topic||broad.has(topic)?'الفهم والربط والتطبيق':topic;
   if(!buckets.has(heading))buckets.set(heading,[]);
   buckets.get(heading).push({question:q.prompt,answer,explanation:q.explanation,pages,questionId:q.id,difficulty:q.difficulty});
  }
  const groups=[];
  for(const [heading,items] of buckets){
   const ordered=items.slice().sort((a,b)=>Math.min(...a.pages)-Math.min(...b.pages)||DIFFICULTIES.indexOf(a.difficulty)-DIFFICULTIES.indexOf(b.difficulty)||a.questionId.localeCompare(b.questionId));
   const chosen=[],seen=new Set();
   const limit=heading==='الفهم والربط والتطبيق'?6:2;
   // Prefer coverage of different source pages before taking a second item from a page.
   for(const item of ordered){
    const key=item.pages.join(',');
    if(seen.has(key))continue;
    seen.add(key);chosen.push(item);
    if(chosen.length===limit)break;
   }
   for(const item of ordered){
    if(chosen.length>=limit)break;
    if(!chosen.includes(item))chosen.push(item);
   }
   if(chosen.length)groups.push({heading,items:chosen.sort((a,b)=>Math.min(...a.pages)-Math.min(...b.pages))});
  }
  return groups.sort((a,b)=>Math.min(...a.items.flatMap(x=>x.pages))-Math.min(...b.items.flatMap(x=>x.pages)));
 }
 function explanationView(lesson){
  const first=selectedYear.id==='btec1';
  const academicId=first?Revision.meta(lesson.id)?.academicId:null;
  const academicLesson=academicId?Revision.academicLesson(academicId):null;
  const guide=academicId?AcademicAdmin.guide(academicId):null;
  const groups=first?firstGuideGroups(lesson):(LESSON_GUIDES[lesson.id]||[]);
  const overview=guide?.overview||LESSON_SUMMARIES[lesson.id]||'';
  return `<div class="lesson-overview"><span class="eyebrow">افهم الفكرة ثم طبّقها</span><h2>شرح الدرس</h2>${guide?.outcome?`<p><strong>نتاج التعلّم:</strong> ${e(guide.outcome)}</p>`:''}<p>${e(overview)}</p></div>
   ${groups.length?`<nav class="guide-topics" aria-label="محاور الشرح">${groups.map((g,i)=>`<a href="#guide-${i}" data-guide-scroll="guide-${i}">${e(g.heading)}</a>`).join('')}</nav>`:''}
   ${groups.map((g,i)=>`<section class="guide-section" id="guide-${i}"><h3>${e(g.heading)}</h3>${g.items.map(x=>`<article><h4>${e(x.question)}</h4><p class="guide-answer">${e(x.answer)}</p><p>${e(x.explanation)}</p><small>مرجع الشرح في بنك المنصة: صفحة ${e(x.pages.join('، '))}</small></article>`).join('')}</section>`).join('')}
   ${academicLesson?`<section class="guide-section"><h3>المفاهيم والخرائط والتطبيقات</h3>${AcademicSemester.lessonResources(academicLesson)}</section>`:''}
   ${guide?.practice?`<section class="guide-section"><h3>تطبيق عملي</h3><p>${e(guide.practice)}</p></section>`:''}
   <details class="guide-source-note"><summary>مصدر الشرح</summary><p>${first?'شرح منظم من ملخصات المنصة وتفسيرات بنك السنة الأولى المرتبطة بصفحات الكتاب. هذا المحتوى التدريبي قيد المراجعة العلمية ولم يُعتمد من المعلم بعد.':'شرح منظم من تفسيرات بنك المنصة المرتبطة بالكتاب. لا يغني عن نص الكتاب وتوجيه المعلم؛ المراجعة العلمية المستقلة لكل فقرة لم تكتمل.'}</p></details>`;
 }
 function view(){
  const l=catalogLessons.find(lesson=>lesson.id===selected);
  if(!l)return directory();
  const yearLessons=selectedYear.units.flatMap(unit=>unit.lessons);
  const i=yearLessons.indexOf(l);
  const tabs=lessonTabs;
  let body='';
  if(tab==='video'&&!l.video)body='<p>فيديو هذا الدرس غير متاح حاليًا.</p>';
  if(tab==='video'&&l.video)body=`<video id="lesson-video" data-paused controls playsinline preload="none" src="${e(media(l.video))}" aria-label="شرح ${e(l.name)}"></video><label class="video-speed">سرعة التشغيل<select id="video-speed">${[.5,.75,1,1.25,1.5,2].map(n=>`<option value="${n}" ${n===1?'selected':''}>${n}×</option>`).join('')}</select></label><progress id="watch-progress" max="100" value="${Math.min(100,(progress(l.id).ranges||[]).reduce((s,[a,b])=>s+b-a,0)/(progress(l.id).duration||1)*100)}" aria-label="نسبة المشاهدة الفعلية"></progress><p id="video-status" role="status">${progress(l.id).completed?'اكتملت المشاهدة':'يُحسب التقدم من المقاطع المشاهدة، وليس من القفز إلى النهاية.'}</p>`;
  if(tab==='explanation')body=explanationView(l)+readingButton('lesson-panel',l.name);
  if(tab==='revision')body=revisionPanel(l);
  if(tab==='solutions'&&selectedYear.id==='btec1')body=AcademicSemester.solutions(Revision.academicLesson(Revision.meta(l.id).academicId));
  if(tab==='solutions'&&selectedYear.id==='btec2')body=BookSolutions.view();
  if(LOCAL_REVIEW&&tab==='quiz'&&selectedYear.id==='btec1')body=`<button class="text-link" data-learning="questions-unit" data-id="${selectedUnit.id}">أسئلة الوحدة</button>`+(LOCAL_REVIEW?reviewView(l):Ministerial.view(l));
  if(LOCAL_REVIEW&&tab==='quiz'&&selectedYear.id==='btec2')body=Ministerial.view(l)||`<p>اختبر هذا الدرس باستخدام بنك الأسئلة الحالي.</p><button class="btn btn-gold" data-action="lesson" data-lesson="${l.id}">انتقل إلى اختبار الدرس</button>`;
  return `${trail(l)}${heroTitle(e(l.name),`صفحات الكتاب ${l.startPage}–${l.endPage}`)}<div class="learning-tabs" role="tablist" aria-label="محتوى الدرس">${tabs.map(([id,name])=>`<button role="tab" aria-controls="lesson-panel" id="learning-tab-${id}" aria-selected="${tab===id}" data-learning="tab" data-id="${id}">${name}</button>`).join('')}</div><section class="surface panel learning-panel" id="lesson-panel" role="tabpanel" aria-labelledby="learning-tab-${tab}">${body}</section><div class="learning-toolbar">${i?`<button class="btn" data-learning="open" data-id="${yearLessons[i-1].id}">الدرس السابق</button>`:''}${i<yearLessons.length-1?`<button class="btn" data-learning="open" data-id="${yearLessons[i+1].id}">الدرس التالي</button>`:''}</div>`;
 }
 function bind(){if(S.page==='learning'){
   loadReview();
   if(tab==='explanation'&&selected?.startsWith('s1_')){
    const id=selected;
    void AcademicAdmin.refresh().then(updated=>{
     if(updated&&S.page==='learning'&&selected===id&&tab==='explanation')render();
    });
   }
  }const v=document.getElementById('lesson-video');if(!v||v.dataset.bound)return;v.dataset.bound='true';const id=selected,token=db.scopeToken();let ranges=progress(id).ranges||[],last=null,wall=null,lastSaved=0;
  const commit=()=>{if(token!==db.scopeToken()||!Number.isFinite(v.duration))return;const duration=v.duration,total=mergeRanges(ranges).reduce((n,[a,b])=>n+b-a,0);if(v.isConnected){const bar=document.getElementById('watch-progress');if(bar)bar.value=Math.min(100,total/duration*100);const label=document.getElementById('video-status');if(label)label.textContent=duration>0&&total/duration>=.9?'✓ اكتملت المشاهدة':'المشاهدة الفعلية: '+Math.floor(total/duration*100)+'٪';}void save(id,{position:v.currentTime,ranges:mergeRanges(ranges),duration,completed:duration>0&&total/duration>=.9}).catch(err=>notify('تعذر حفظ تقدم الفيديو: '+err.message));};
  v.addEventListener('loadedmetadata',()=>{v.currentTime=Math.min(progress(id).position||0,v.duration||0);});
  v.addEventListener('play',()=>{delete v.dataset.paused;last=v.currentTime;wall=performance.now();Sound.stop();});
  v.addEventListener('seeking',()=>{last=null;wall=null;});
  v.addEventListener('timeupdate',()=>{const now=performance.now(),t=v.currentTime;if(!v.paused&&!v.seeking&&last!==null&&wall!==null&&t>last&&t-last<=(now-wall)/1000*v.playbackRate+0.5)ranges=mergeRanges([...ranges,[last,t]]);last=t;wall=now;if(now-lastSaved>5000){lastSaved=now;commit();}});
  v.addEventListener('pause',()=>{v.dataset.paused='true';commit();});v.addEventListener('ended',commit);v.addEventListener('error',()=>{if(!v.isConnected)return;document.getElementById('video-status').textContent='تعذر تحميل الفيديو. تحقق من الاتصال أو إعداد استضافة الوسائط.';});v._save=commit;
 }
 function beforeRender(){const v=document.getElementById('lesson-video');if(v){v.pause();v._save?.();}}
 document.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-learning]');
  if(!b)return;
  const {learning:action,id}=b.dataset;
  if(action==='open-questions'){openQuestions(id);return;}
  if(action==='open'){open(id);return;}
  if(action==='solutions-catalog'){BookSolutions.open();return;}
  if(action==='quiz'){open(id,LOCAL_REVIEW?'quiz':'explanation');return;}
  if(action==='questions-unit'){questionsUnit(id);return;}
  if(action==='catalog'){if(S.page==='units')questionsCatalog();else catalog();return;}
  if(action==='year'){const year=years.find(y=>y.id===id);if(year)show(year,null,S.page==='units'?'units':'learning');return;}
  if(action==='unit'){const unit=selectedYear?.units.find(u=>u.id===id);if(unit)show(selectedYear,unit,S.page==='units'?'units':'learning');return;}
  if(action==='tab'&&id==='solutions'&&selectedYear.id==='btec2'){BookSolutions.open(selected);return;}
  if(action==='tab'){
   if(!lessonTabs.some(([key])=>key===id))return;
   tab=id;
   route(lessonHash());
   render();
   document.getElementById('learning-tab-'+tab)?.focus({preventScroll:true});
   return;
  }
  if(!LOCAL_REVIEW||tab!=='quiz'||!selected?.startsWith('s1_'))return;
  if(action==='review-answer')reviewAnswer=id;
  if(action==='review-prev'||action==='review-next'){
   reviewIndex+=action==='review-next'?1:-1;
   reviewAnswer=null;
  }
  if(action==='review-retry')reviewBank.delete(selected);
  render();
 });
 document.addEventListener('change',ev=>{
  if(ev.target.id==='video-speed'){const v=document.getElementById('lesson-video');if(v)v.playbackRate=Number(ev.target.value);}
  if(ev.target.id==='learning-search'){search=ev.target.value;render();document.getElementById('learning-search')?.focus();}
  if(ev.target.id==='first-btec-level'){reviewLevel=ev.target.value;reviewIndex=0;reviewAnswer=null;render();document.getElementById('first-btec-level')?.focus();}
 });
 window.addEventListener('hashchange',()=>{if(S.ready)restore();});
 document.addEventListener('click',ev=>{const a=ev.target.closest('[data-guide-scroll]');if(a){ev.preventDefault();document.getElementById(a.dataset.guideScroll)?.scrollIntoView({block:'start'});}});
 document.addEventListener('keydown',ev=>{if(!ev.target.matches('.learning-tabs [role=tab]')||!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;ev.preventDefault();const buttons=[...document.querySelectorAll('.learning-tabs [role=tab]')],i=buttons.indexOf(ev.target),n=ev.key==='Home'?0:ev.key==='End'?buttons.length-1:(i+(ev.key==='ArrowLeft'?1:-1)+buttons.length)%buttons.length;const id=buttons[n].dataset.id;buttons[n].click();document.getElementById('learning-tab-'+id)?.focus();});
 return {view,directory,questionsCatalog,bind,beforeRender,restore,open,catalog,mergeRanges,save,updateProfile,progressView,selectedLesson:()=>selected};
})();
