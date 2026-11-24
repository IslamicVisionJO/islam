const AcademicSemester=(()=>{
 const units=ACADEMIC_SEMESTER.units;
 const lessons=units.flatMap(unit=>unit.lessons);
 const study=ACADEMIC_STUDY;
 const bank=lessons.flatMap(lesson=>study[lesson.id].questions);
 const texts=ACADEMIC_MEMORIZATION.texts;
 const byId=new Map(lessons.map(lesson=>[lesson.id,lesson]));
 const reviewRows=lesson=>lesson.rows.filter(row=>!row.status);
 const empty=()=>({completed:{},cards:{},attempts:[],mistakes:{}});
 const progress=()=>S.profile.academicSemesterOne||empty();
 const day=86400000;
 const levels=['easy','medium','hard'];
 const levelLabels={easy:'سهل',medium:'متوسط',hard:'متقدم'};
 let lessonId=null, tab='lesson', cardIndex=0, flipped=false, quiz=null, timer=null, saving=false;
 let recall=null, activity=null;
 const pages=['lesson','solutions','cards','memorization'];
 const labels={lesson:'شرح الدرس',solutions:'حلول الكتاب',cards:'البطاقات التعليمية',memorization:'الحفظ والتسميع'};
 const normalize=text=>text.normalize('NFKC').replace(/[\p{M}\u0640]/gu,'').replace(/[أإآ]/g,'ا');
 const button=(text,action,value='',style='btn-outline')=>`<button type="button" class="btn ${style}" data-academic="${action}" data-value="${e(value)}">${e(text)}</button>`;

 function leave(){
  clearInterval(timer);
  timer=null;
  quiz=null;
  activity=null;
  recall=null;
 }
 function open(id=null,nextTab='lesson'){
  leave();
  lessonId=byId.has(id)?id:null;
  tab=pages.includes(nextTab)?nextTab:'lesson';
  cardIndex=0;
  flipped=false;
  go('academic-semester');
  history.replaceState(null,'','#academic/s1'+(lessonId?'/'+lessonId+'/'+tab:''));
  if(tab==='lesson'&&lessonId){
   const id=lessonId;
   void AcademicAdmin.refresh().then(updated=>{
    if(updated&&S.page==='academic-semester'&&lessonId===id&&tab==='lesson'&&!quiz&&!activity)render();
   });
  }
 }
 function restore(){
  const route=location.hash.match(/^#academic\/s1(?:\/(academic-s1-u[1-4]-l0[1-7])(?:\/(lesson|solutions|cards|memorization))?)?$/);
  if(!route)return false;
  const [,id,nextTab]=route;
  open(id,nextTab);
  return true;
 }
 async function save(change){
  if(saving||S.writerBlocked||S.writerSuspended)return false;
  saving=true;
  try{
   await Learning.updateProfile(profile=>{
    profile.academicSemesterOne??=empty();
    change(profile.academicSemesterOne);
   });
   return true;
  }catch{
   notify('تعذر حفظ تقدم الفصل الأول. حاول مجددًا.');
   return false;
  }finally{saving=false;}
 }
 function overview(){
  const {completed,attempts,mistakes,cards}=progress();
  const count=lessons.filter(l=>completed[l.id]).length;
  const scores=attempts.map(a=>Math.round(100*a.correct/a.total));
  const lessonScores=new Map();
  for(const {coverage} of attempts){
   for(const [id,[correct,total]] of Object.entries(coverage||{})){
    const [previous,seen]=lessonScores.get(id)||[0,0];
    lessonScores.set(id,[previous+correct,seen+total]);
   }
  }
  const ranked=[...lessonScores].filter(([id])=>byId.has(id)).map(([id,[right,total]])=>
   ({name:byId.get(id).name,score:Math.round(100*right/total)})).sort((a,b)=>b.score-a.score);
  const memorized=Object.keys(progress().memorized||{}).length;
  const due=lessons.flatMap(reviewRows).filter(r=>cards[r.id]&&cards[r.id].due<=Date.now()).length;
  return `<section class="surface panel">
   <h2>تقدمي في الفصل الأول</h2>
   <progress value="${count}" max="${lessons.length}" aria-label="الدروس المكتملة"></progress>
   <p>${nf(count)} من ${nf(lessons.length)} درسًا · ${nf(lessons.length-count)} متبقية · ${nf(Math.round(100*count/lessons.length))}٪</p>
   <p>${nf(attempts.length)} محاولة · ${nf(Object.keys(mistakes).length)} سؤالًا للمراجعة · ${nf(due)} بطاقة حان موعدها</p>
   <p>${nf(memorized)} من ${nf(Object.values(texts).flat().length)} نصًا راجعته في مركز الحفظ</p>
   ${progress().games?`<ul>${Object.entries(progress().games).map(([name,score])=>`<li>${e(name)} · أفضل نتيجة ${nf(score)}</li>`).join('')}</ul>`:''}
   ${ranked.length>=2?`<p>أعلى إتقان: ${e(ranked[0].name)} (${nf(ranked[0].score)}٪) · أولوية المراجعة: ${e(ranked.at(-1).name)} (${nf(ranked.at(-1).score)}٪)</p>`:''}
   <p>${Object.keys(mistakes).length?'ابدأ بمراجعة أخطائك، ثم أعد اختبار الدروس الأقل إتقانًا.':due?'ابدأ بالبطاقات المستحقة اليوم.':'ابدأ بالدرس التالي وأكمل بطاقاته بعد القراءة.'}</p>
   ${scores.length?`<p>متوسط آخر ${nf(scores.length)} محاولة ${nf(Math.round(scores.reduce((a,b)=>a+b,0)/scores.length))}٪ · أفضل نتيجة ${nf(Math.max(...scores))}٪</p>
   <details><summary>آخر النتائج</summary><ul>${attempts.slice(-5).reverse().map(a=>`<li>${e(a.label)} · ${nf(a.correct)} / ${nf(a.total)}</li>`).join('')}</ul></details>`:''}
   ${button('راجع أخطائي','retry')}
   </section>`;
 }
 function catalog(){
  return `${heroTitle('الفصل الدراسي الأول','الصف الحادي عشر · المسار الأكاديمي · المنهاج الأردني، الطبعة الثانية 2026')}
   ${overview()}
   <section class="surface panel">
    <h2>مركز الحفظ والتسميع</h2>
    <ul class="academic-lessons">${lessons.filter(l=>texts[l.id]).map(l=>`<li><a href="#academic/s1/${l.id}/memorization">${e(l.name)}</a></li>`).join('')}</ul>
   </section>
   <section class="surface panel">
    <h2>اختبارات الفصل الأول</h2>
    <p>بنك تدريبي يضم ${nf(bank.length)} سؤالًا. تُعرض الحلول بعد التسليم، وفق إعدادات تدريبية.</p>
    <form id="academic-quiz-form" class="study-filters">
     <label>نطاق الأسئلة<select name="scope"><option value="all">جميع الوحدات</option>${units.map(unit=>`<option value="${unit.number}">${e(unit.name)}</option>`).join('')}</select></label>
     <label>الدرس<select name="lesson"><option value="">جميع دروس النطاق</option>${units.map(unit=>`<optgroup label="${e(unit.name)}">${unit.lessons.map(l=>`<option value="${l.id}" data-unit="${unit.number}">${e(l.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <label>عدد الأسئلة<input name="count" type="number" min="1" max="${bank.length}" value="6" required></label>
     <label>نوع التدريب<select name="mode"><option value="custom">اختبار مخصص</option><option value="trial">امتحان تجريبي</option><option value="speed">تحدي الوقت</option><option value="wall">تحدي الجدار</option><option value="knowledge">من سيربح المعرفة</option><option value="error">اكتشف الخطأ</option><option value="match">الذاكرة والمطابقة</option></select></label>
     <label id="academic-wall-level" hidden>سرعة الجدار<select name="level"><option value="easy">هادئ</option><option value="medium">متوسط</option><option value="hard">سريع</option></select></label>
    <button class="btn btn-gold" type="submit">ابدأ</button>
    </form>
    <div class="study-actions">
     ${button('الامتحان الشامل','comprehensive')}
     ${button('محاكاة نهائية تدريبية','simulation')}
     ${button('الذاكرة والمطابقة','match')}
     ${button('رتّب أحداث مؤتة','order','muta')}
     ${button('رتّب أحداث فتح مكة','order','mecca')}
    </div>
   </section>
   ${units.map(unit=>`<section class="surface panel">
    <h2>${e(unit.name)}</h2>
    ${button('اختبار الوحدة','unit-quiz',unit.number)}
    <ol class="academic-lessons">${unit.lessons.map(l=>`<li><a href="#academic/s1/${l.id}/lesson">${e(l.name)}</a> <small>ص ${nf(l.startPage)}${progress().completed[l.id]?' · مكتمل':''}</small></li>`).join('')}</ol>
   </section>`).join('')}`;
 }
 function solutions(lesson){
  const rows=lesson.rows;
  const categories=[...new Set(rows.map(row=>row.category))];
  return `<section class="book-solutions">
   <h2>حلول الكتاب</h2>
   <p class="muted">من الملف المرفق «التربية الإسلامية سؤال وجواب». يتضمن المصدر أسئلة مختصرة وإجابات إرشادية؛ راجع الكتاب عند الحاجة إلى النص الكامل.</p>
   <div class="study-filters no-print">
    <label>ابحث في الحلول<input id="academic-search" type="search"></label>
    <label>نوع النشاط<select id="academic-category"><option value="">جميع الأنشطة</option>${categories.map(c=>`<option>${e(c)}</option>`).join('')}</select></label>
    ${button('طباعة الحلول','print')}
   </div>
   <p role="status" id="academic-count" class="no-print">${nf(rows.length)} بندًا</p>
   ${rows.map(row=>`<article class="surface panel book-answer" data-category="${e(row.category)}">
    <small class="tag">${e(row.category)}</small> <small>ص ${nf(row.page)} من الكتاب${row.number?' · الرقم '+e(row.number):''}</small>
    <h3>${e(row.question)}</h3>
    <p><strong>${row.status==='suggested'?'إجابة مقترحة':row.status==='verify'?'إجابة إرشادية تحتاج إلى تحقق':'الإجابة في ملف الحلول'}</strong></p>
    <p class="book-answer-text">${e(row.answer)}</p>
    ${row.editorialNote?`<p class="inline-note">${e(row.editorialNote)}</p>`:''}
    <small class="muted">ص ${nf(row.handoutPage)} من ملف الحلول</small>
   </article>`).join('')}
  </section>`;
 }
 function cards(lesson){
  const rows=reviewRows(lesson);
  const saved=progress().cards;
  const now=Date.now();
  const due=rows.filter(row=>!saved[row.id]||saved[row.id].due<=now);
  if(!due.length)return '<section class="surface panel"><h2>البطاقات التعليمية</h2><p>راجعت كل البطاقات المستحقة لهذا الدرس. عُد عند موعد المراجعة التالي.</p></section>';
  const row=due[cardIndex%due.length];
  return `<section class="surface panel academic-card">
   <h2>البطاقات التعليمية</h2><p>${nf(due.length)} بطاقة متاحة للمراجعة · ص ${nf(row.page)}</p>
   <h3>${e(row.question)}</h3>
   ${flipped?`<p>${e(row.answer)}</p><div class="study-actions">
    ${button('أعرف الإجابة','rate','known')}${button('أحتاج إلى المراجعة','rate','review')}${button('لم أحفظ الإجابة','rate','again')}
   </div>`:`<div class="study-actions">${button('اقلب البطاقة','flip','', 'btn-gold')}${button('البطاقة التالية','card-next')}</div>`}
  </section>`;
 }
 function lessonView(lesson){
  const guide=AcademicAdmin.guide(lesson.id);
  const unit=units.find(u=>u.number===lesson.unit);
  const range=lesson.actualStartPage||lesson.startPage;
  return `<nav class="learning-trail no-print" aria-label="مسار الفصل الأول"><a href="#academic/s1">الفصل الأول</a> / <span>${e(unit.name)}</span></nav>
   ${heroTitle(e(lesson.name),`الكتاب · الصفحات ${nf(range)}–${nf(lesson.endPage)}${lesson.actualStartPage?` · صفحة الفهرس ${nf(lesson.startPage)}`:''}`)}
   <nav class="study-actions no-print" aria-label="موارد الدرس">
    ${pages.filter(key=>key!=='memorization'||texts[lesson.id]).map(key=>`<a class="btn ${tab===key?'btn-gold':'btn-outline'}" href="#academic/s1/${lesson.id}/${key}" ${tab===key?'aria-current="page"':''}>${labels[key]}</a>`).join('')}
    ${button('اختبار الدرس','lesson-quiz')}
   </nav>
   ${tab==='solutions'?solutions(lesson):tab==='cards'?cards(lesson):tab==='memorization'?memorization(lesson):`
   <section class="surface panel">
    <h2>نتاج التعلّم</h2><p>${e(guide.outcome)}</p>
    <h2>مراجعة الدرس</h2><p>${e(guide.overview)}</p>
    <h2>تطبيق في حياتنا</h2><p>${e(guide.practice)}</p>
    ${lessonResources(lesson)}
    <details><summary>أسئلة للمراجعة السريعة</summary><ul>${reviewRows(lesson).slice(0,4).map(row=>`<li><details><summary>${e(row.question)}</summary><p>${e(row.answer)}</p></details></li>`).join('')}</ul></details>
    <div class="study-actions">${progress().completed[lesson.id]?'<p role="status">اكتمل الدرس</p>':button('تسجيل إكمال الدرس','complete','', 'btn-gold')}</div>
   </section>`}`;
 }
 function memorization(lesson){
  const entries=texts[lesson.id]||[];
  const saved=progress().memorized||{};
  return `<section class="surface panel">
   <h2>الحفظ والتسميع</h2>
   <div class="study-actions">${button('معاني المفردات ودلالات الدرس','lesson-quiz')}</div>
   <p class="muted">نص الآيات بالرسم العثماني من <a href="https://tanzil.net/">مشروع تنزيل</a> عبر quran-json. الحديثان من كتاب الطالب.</p>
   ${entries.map((entry,index)=>`<article class="academic-passage">
    <h3>${e(entry.label)}</h3><small>ص ${nf(entry.page)} · ${saved[lesson.id+'-'+index]?'تمت المراجعة':'بانتظار المراجعة'}</small>
    ${recall?.index===index?recallView(entry):`<p class="academic-scripture">${e(entry.text)}</p>
    <div class="study-actions">${button('أكمل النص','recall',index)}${button('رتّب الكلمات','word-order',index)}</div>`}
   </article>`).join('')}
  </section>`;
 }
 function beginRecall(lesson,index,mode){
  const tokens=texts[lesson.id][index].text.split(/\s+/);
  const length=Math.min(mode==='order'?5:3,tokens.length-1);
  const start=Math.floor(Math.random()*(tokens.length-length+1));
  const words=tokens.slice(start,start+length);
  recall={index,mode,start,length,order:shuffle(words.map((_,i)=>i)),picked:[],result:null,value:''};
 }
 const recallNormalize=text=>normalize(text).replace(/[ٱ]/g,'ا').replace(/[^\p{L} ]/gu,'').replace(/\s+/g,' ').trim();
 function recallView(entry){
  const tokens=entry.text.split(/\s+/);
  const missing=tokens.slice(recall.start,recall.start+recall.length);
  const hidden=[...tokens.slice(0,recall.start),'ـــــــ',...tokens.slice(recall.start+recall.length)].join(' ');
  return `<p class="academic-scripture">${e(hidden)}</p>
   ${recall.mode==='order'?`
   <p aria-live="polite">${e(recall.picked.map(i=>missing[i]).join(' '))}</p>
   <div class="study-actions">${recall.order.filter(i=>!recall.picked.includes(i)).map(i=>button(missing[i],'pick-word',i)).join('')}</div>
   ${button('إعادة ترتيب الكلمات','reset-words')}
   ${button('تحقق','check-words')}`:`
   <form id="academic-recall" class="study-filters"><label>اكتب الكلمات الناقصة<input name="missing" required value="${e(recall.value)}"></label>
   <button type="submit" class="btn btn-gold">تحقق</button></form>`}
   ${recall.result===null?'':`<p role="status">${recall.result?'أحسنت':'حاول مرة أخرى'}</p>
   ${recall.result?`<p class="academic-scripture">${e(missing.join(' '))}</p>`:''}`}
   ${button('إظهار النص الكامل','end-recall')}`;
 }
 async function checkRecall(value){
  if(!recall)return;
  const lesson=byId.get(lessonId);
  const current=recall;
  const missing=texts[lesson.id][current.index].text.split(/\s+/).slice(current.start,current.start+current.length);
  current.value=value;
  current.result=recallNormalize(value)===recallNormalize(missing.join(' '));
  if(current.result)await save(p=>{p.memorized??={};p.memorized[lesson.id+'-'+current.index]=true;});
  if(S.page==='academic-semester'&&recall===current)render();
 }
 const sequences={
  muta:{lesson:'academic-s1-u2-l03',name:'معركة مؤتة',steps:['قتل الحارث بن عمير الأزدي','قيادة زيد بن حارثة','قيادة جعفر بن أبي طالب','قيادة عبد الله بن رواحة','قيادة خالد بن الوليد']},
  mecca:{lesson:'academic-s1-u3-l03',name:'فتح مكة',steps:['عقد صلح الحديبية','الاعتداء على خزاعة','مسير النبي ﷺ إلى مكة','دخول مكة','إعادة المفتاح إلى عثمان بن طلحة']}
 };
 function lessonResources(lesson){
  const sequence=Object.values(sequences).find(item=>item.lesson===lesson.id);
  const map=ACADEMIC_RESOURCES.maps[lesson.id];
  const concepts=ACADEMIC_RESOURCES.concepts[lesson.id]||[];
  const comparison=ACADEMIC_RESOURCES.comparisons[lesson.id];
  return `${concepts.length?`<h2>المفاهيم ومحاور الدرس</h2><dl class="academic-concepts">${concepts.map(([term,meaning])=>`<dt>${e(term)}</dt><dd>${e(meaning)}</dd>`).join('')}</dl>`:''}
   ${sequence?`<details><summary>الخط الزمني · ${e(sequence.name)}</summary><ol>${sequence.steps.map(step=>`<li>${e(step)}</li>`).join('')}</ol></details>`:''}
   ${map?`<h2>خريطة الدرس</h2><div class="learning-units">${map.map(([label,text])=>`<details class="learning-card"><summary>${e(label)}</summary><p>${e(text)}</p></details>`).join('')}</div>`:''}
   ${comparison?`<div class="academic-table"><table><caption>مقارنة من الدرس</caption>
    <thead><tr>${comparison.head.map((label)=>`<th scope="col">${e(label)}</th>`).join('')}</tr></thead>
    <tbody>${comparison.rows.map(([label,...values])=>`<tr><th scope="row">${e(label)}</th>${values.map(value=>`<td>${e(value)}</td>`).join('')}</tr>`).join('')}</tbody>
   </table></div>`:''}
   ${(ACADEMIC_RESOURCES.applications[lesson.id]||[]).map(applicationCard).join('')}`;
 }
 function applicationCard({title,evidence,scenario,task}){
  return `<details class="learning-card"><summary>${e(title)}</summary><p><strong>الدليل:</strong> ${e(evidence)}</p><p>${e(scenario)}</p><p><strong>تطبيق:</strong> ${e(task)}</p></details>`;
 }
 function applicationsView(steam){
  const items=Object.values(ACADEMIC_RESOURCES.applications).flat().filter(item=>item.title.startsWith('STEAM')===steam);
  return `<h3>${steam?'مشروعات الفصل الدراسي الأول':'تطبيقات الفصل الدراسي الأول'}</h3><div class="knowledge-grid">${items.map(applicationCard).join('')}</div>`;
 }
 function startActivity(type,key,pool=lessonId?study[lessonId].questions:bank){
  leave();
  if(type==='order'){
   const sequence=sequences[key];
   activity={type,label:sequence.name,items:sequence.steps,order:shuffle(sequence.steps.map((_,i)=>i)),picked:[]};
  }else{
   const selectedLessons=[...new Set(pool.map(q=>q.lesson))];
   const terms=selectedLessons.flatMap(id=>(ACADEMIC_RESOURCES.concepts[id]||[]).map(([prompt,meaning])=>
    ({prompt,options:[meaning],correct:0})));
   const used=new Set();
   const items=shuffle([...terms,...pool]).filter(q=>{
    const meaning=q.options[q.correct];
    if(used.has(meaning))return false;
    used.add(meaning);
    return true;
   }).slice(0,4);
   activity={type,label:'الذاكرة والمطابقة',items,order:shuffle(items.map((_,i)=>i)),selection:null,matches:[],errors:0};
  }
  render();
 }
 function activityView(){
  const {type,label,items,order,selection,matches,picked,finished,errors}=activity;
  return `${heroTitle(e(label),type==='order'?'اختر الأحداث وفق تسلسلها الزمني':'اختر مصطلحًا أو سؤالًا، ثم طابقه مع معناه أو إجابته')}
   <section class="surface panel">
    ${type==='order'?`<ol>${picked.map(i=>`<li>${e(items[i])}</li>`).join('')}</ol>
     ${finished?`<p role="status">${picked.every((id,i)=>id===i)?'الترتيب صحيح.':'راجع الخط الزمني وحاول مرة أخرى.'}</p>
     <details><summary>التسلسل الصحيح</summary><ol>${items.map(item=>`<li>${e(item)}</li>`).join('')}</ol></details>`:`
     <div class="study-actions">${order.filter(i=>!picked.includes(i)).map(i=>button(items[i],'pick-event',i)).join('')}</div>`}
     ${button('أعد المحاولة','order-reset')}`:`
     <p role="status">${nf(matches.length)} من ${nf(items.length)} مطابقات · ${nf(errors)} محاولات خاطئة</p>
     <div class="learning-units"><div class="study-answers">${items.map((q,i)=>matches.includes(i)?`<p>${e(q.prompt)} ✓</p>`:button(q.prompt,'choose-pair',i,selection===i?'btn-gold':'btn-outline')).join('')}</div>
      <div class="study-answers">${order.map(i=>matches.includes(i)?`<p>${e(items[i].options[items[i].correct])} ✓</p>`:button(items[i].options[items[i].correct],'match-pair',i)).join('')}</div></div>
     ${finished?'<p role="status">أكملت جميع المطابقات.</p>':''}`}
    ${button('العودة','quiz-close')}
   </section>`;
 }
 function finishActivity(correct){
  activity.finished=true;
  const label=activity.label;
  void save(p=>{
   p.games??={};
   p.games[label]=Math.max(p.games[label]||0,correct);
  });
 }
 function startQuiz(label,questions,mode='custom',level='easy'){
  if(!questions.length){notify('لا توجد أسئلة لهذا النطاق.');return;}
  leave();
  quiz={label,questions:questions.map(q=>({...q, order:shuffle([0,1,2,3])})), answers:{}, index:0, submitted:false,
   deadline:mode==='speed'?Date.now()+30000:null,mode,streak:0,bestStreak:0,points:0,
   hintUsed:false,skipUsed:false,hidden:[]};
  if(mode==='wall'){
   const wallItems=questions.map(q=>({
    id:q.id,type:'multiple_choice',prompt:q.prompt,explanation:q.explanation,
    payload:{options:q.options.map((text,i)=>({id:String(i),text}))},answer:{option_id:String(q.correct)},source:{printed_pages:[q.page]}
   }));
   quiz.wall=WallRules.start(wallItems,level,'all','all');
   quiz.wallTime=performance.now();
  }
  render();
  if(quiz.wall)timer=setInterval(()=>advanceWall(),50);
  if(quiz.deadline)timer=setInterval(()=>{
   if(!quiz||S.page!=='academic-semester'){leave();return;}
   const remaining=Math.max(0,Math.ceil((quiz.deadline-Date.now())/1000));
   const clock=document.querySelector('#academic-clock');
   if(clock)clock.textContent=nf(remaining);
   if(!remaining)void submitQuiz();
  },250);
 }
 function advanceWall(action, option){
  if(!quiz?.wall||quiz.submitted)return;
  const now=performance.now();
  const elapsed=(now-quiz.wallTime)/1000;
  quiz.wallTime=now;
  const q=quiz.questions[quiz.index];
  WallRules.act(quiz.wall,elapsed,action,q.id,String(option));
  const {phase,height,delay}=quiz.wall;
  const block=document.querySelector('.academic-wall-block');
  if(block)block.style.transform='translateY('+height*733.3+'%)';
  const readiness=document.querySelector('#academic-wall-status');
  if(readiness)readiness.textContent=delay?'استعد · '+nf(Math.ceil(delay)):'أجب قبل خط الخطر';
  for(const button of document.querySelectorAll('[data-academic="answer"]'))button.disabled=Boolean(delay);
  if(phase==='finished')void submitQuiz();
  if(action==='answer'&&phase==='feedback'){
   quiz.answers[q.id]=option;
   quiz.points=quiz.wall.score;
   quiz.bestStreak=quiz.wall.best;
   WallRules.act(quiz.wall,0,'next');
   quiz.index=quiz.wall.index;
   if(quiz.wall.phase==='finished')void submitQuiz();
   else render();
  }
 }
 async function submitQuiz(){
  if(!quiz||quiz.submitted)return;
  clearInterval(timer);
  const attempt=quiz;
  attempt.submitted=true;
  const correct=attempt.questions.filter(q=>attempt.answers[q.id]===q.correct).length;
  const saved=await save(p=>{
   const coverage={};
   for(const q of attempt.questions){
    const lesson=coverage[q.lesson]??=[0,0];
    lesson[1]++;
    if(attempt.answers[q.id]===q.correct)lesson[0]++;
   }
   p.attempts=[...p.attempts,{label:attempt.label,correct,total:attempt.questions.length,coverage}].slice(-50);
   for(const q of attempt.questions){
    if(attempt.answers[q.id]===q.correct)delete p.mistakes[q.id];
    else p.mistakes[q.id]=true;
   }
   if(['speed','wall','knowledge','error'].includes(attempt.mode)){
    p.games??={};
    const points=attempt.mode==='error'?correct:attempt.points;
    p.games[attempt.label]=Math.max(p.games[attempt.label]||0,points);
   }
  });
  if(quiz===attempt&&S.page==='academic-semester'){
   attempt.saved=saved;
   render();
  }
 }
 function quizView(){
  const {label,questions,answers,index,submitted,deadline,mode,points,bestStreak}=quiz;
  const q=questions[index];
  if(submitted){
   const correct=questions.filter(item=>answers[item.id]===item.correct).length;
   return `${heroTitle(e(label),`النتيجة ${nf(correct)} من ${nf(questions.length)}`)}
    ${['speed','wall','knowledge'].includes(mode)?`<p>النقاط ${nf(points)} · أفضل سلسلة ${nf(bestStreak)} · أعلى رصيد محفوظ ${nf(progress().games?.[label]||0)}</p>`:''}
    ${quiz.wall?.reason==='danger'?'<p role="status">وصل الجدار إلى خط الخطر.</p>':''}
    ${quiz.saved===false?'<p role="alert">تعذر حفظ هذه المحاولة.</p>':''}
    ${button('العودة','quiz-close')}
    ${questions.map(item=>`<article class="surface panel"><h3>${e(item.prompt)}</h3>
     <p>إجابتك: ${e(item.options[answers[item.id]]??'لم تجب')}</p><p>الإجابة الصحيحة: ${e(item.options[item.correct])}</p>
     <p>${e(item.explanation)}</p><small>كتاب الطالب · ص ${nf(item.page)}</small></article>`).join('')}`;
  }
  return `${heroTitle(e(label),`السؤال ${nf(index+1)} من ${nf(questions.length)}`)}
   <section class="surface panel">
    ${deadline?`<p>الوقت المتبقي <strong id="academic-clock">${nf(Math.max(0,Math.ceil((deadline-Date.now())/1000)))}</strong> ثانية</p>`:''}
    ${mode==='wall'?`<div class="academic-wall" aria-hidden="true"><div class="academic-wall-block" style="transform:translateY(${quiz.wall.height*733.3}%)"></div><div class="academic-wall-danger"></div></div>
      <p id="academic-wall-status">استعد</p><p>النقاط ${nf(points)} · سلسلة ${nf(quiz.wall.streak)}</p>`:''}
    ${mode==='knowledge'?`<p>المستوى ${levelLabels[q.difficulty]} · النقاط ${nf(points)}</p>
      <div class="study-actions">${quiz.hintUsed?'':button('احذف خيارين','hint')}${quiz.skipUsed?'':button('تجاوز سؤالًا','skip-knowledge')}</div>`:''}
    <h2>${e(q.prompt)}</h2>
    ${mode==='error'?`<p><strong>إجابة تحتاج تصحيحًا:</strong> ${e(q.options[q.order.find(option=>option!==q.correct)])}</p>`:''}
    <div class="study-answers">${q.order.map((option,i)=>`<button type="button" class="btn ${answers[q.id]===option?'btn-gold':'btn-outline'}" data-academic="answer" data-value="${option}" aria-pressed="${answers[q.id]===option}" ${quiz.hidden.includes(option)||quiz.wall?.delay?'disabled':''}>${['أ','ب','ج','د'][i]}. ${e(q.options[option])}</button>`).join('')}</div>
    <div class="study-actions">${['speed','wall','knowledge','error'].includes(mode)?'':`
    ${index>0?button('السابق','quiz-move',-1):''}
    ${index+1<questions.length?button('التالي','quiz-move',1):''}
    ${button('تسليم الاختبار','submit','', 'btn-gold')}`}
    ${button('إنهاء التدريب','quiz-close')}</div>
   </section>`;
 }
 function view(){
  const lesson=byId.get(lessonId);
  return `<div class="academic-semester">${quiz?quizView():activity?activityView():lesson?lessonView(lesson):catalog()}</div>`;
 }
 document.addEventListener('submit',event=>{
  if(event.target.id==='academic-recall'){
   event.preventDefault();
   void checkRecall(new FormData(event.target).get('missing'));
   return;
  }
  if(event.target.id!=='academic-quiz-form')return;
  event.preventDefault();
  const form=new FormData(event.target);
  const scope=form.get('scope');
  const lesson=form.get('lesson');
  const pool=bank.filter(q=>(scope==='all'||q.unit===Number(scope))&&(!lesson||q.lesson===lesson));
  const mode=form.get('mode');
  if(mode==='match'){
   if(pool.length)startActivity('match',null,pool);
   else notify('لا توجد أسئلة لهذا النطاق.');
   return;
  }
  const label={custom:'الاختبار المخصص',trial:'امتحان تجريبي',speed:'تحدي الوقت',wall:'تحدي الجدار',knowledge:'من سيربح المعرفة',error:'اكتشف الخطأ'}[mode];
  const count=Number(form.get('count'));
  if(!Number.isInteger(count)||count<1||count>pool.length){
   notify('اختر من ١ إلى '+nf(pool.length)+' سؤالًا في هذا النطاق.');
   return;
  }
  const selected=shuffle(pool).slice(0,count);
  startQuiz(label,mode==='knowledge'?selected.sort((a,b)=>levels.indexOf(a.difficulty)-levels.indexOf(b.difficulty)):selected,mode,form.get('level'));
 });
 document.addEventListener('change',event=>{
  const form=event.target.form;
  if(form?.id!=='academic-quiz-form')return;
  const {scope,lesson,count,mode}=form.elements;
  if(event.target===scope){
   for(const option of lesson.options){
    option.hidden=Boolean(option.value)&&scope.value!=='all'&&option.dataset.unit!==scope.value;
    option.disabled=option.hidden;
   }
   if(lesson.selectedOptions[0]?.disabled)lesson.value='';
  }
  const available=bank.filter(q=>(scope.value==='all'||q.unit===Number(scope.value))&&(!lesson.value||q.lesson===lesson.value)).length;
  count.max=String(available);
  count.value=String(Math.min(Number(count.value)||1,available));
  count.disabled=mode.value==='match';
  document.querySelector('#academic-wall-level').hidden=mode.value!=='wall';
 });
 document.addEventListener('input',event=>{
  if(!['academic-search','academic-category'].includes(event.target.id))return;
  const category=document.querySelector('#academic-category').value;
  const query=normalize(document.querySelector('#academic-search').value.trim());
  let count=0;
  for(const row of document.querySelectorAll('[data-category].book-answer')){
   row.hidden=Boolean(category&&row.dataset.category!==category)||!normalize(row.textContent).includes(query);
   if(!row.hidden)count++;
  }
  document.querySelector('#academic-count').textContent=count?nf(count)+' بندًا':'لا توجد نتائج مطابقة.';
 });
 document.addEventListener('click',async event=>{
  const btn=event.target.closest('[data-academic]');
  if(btn?.dataset.academic==='print'&&S.page==='learning'){window.print();return;}
  if(!btn||S.page!=='academic-semester')return;
  const {academic:action,value}=btn.dataset;
  const lesson=byId.get(lessonId);
  switch(action){
   case 'recall':beginRecall(lesson,Number(value),'missing');break;
   case 'word-order':beginRecall(lesson,Number(value),'order');break;
   case 'pick-word':recall.picked.push(Number(value));recall.result=null;break;
   case 'reset-words':recall.picked=[];recall.result=null;break;
   case 'check-words':{
    const entry=texts[lessonId][recall.index];
    const words=entry.text.split(/\s+/).slice(recall.start,recall.start+recall.length);
    await checkRecall(recall.picked.map(i=>words[i]).join(' '));
    return;
   }
   case 'end-recall':recall=null;break;
   case 'match':startActivity('match');return;
   case 'order':startActivity('order',value);return;
   case 'order-reset':activity.picked=[];activity.finished=false;activity.order=shuffle(activity.order);break;
   case 'pick-event':
    activity.picked.push(Number(value));
    if(activity.picked.length===activity.items.length)finishActivity(activity.picked.every((item,i)=>item===i)?activity.items.length:0);
    break;
   case 'choose-pair':activity.selection=Number(value);break;
   case 'match-pair':
    if(activity.selection===null)return;
    if(activity.selection===Number(value)){
     activity.matches.push(Number(value));
     if(activity.matches.length===activity.items.length)finishActivity(Math.max(0,activity.items.length-activity.errors));
    }else activity.errors++;
    activity.selection=null;
    break;
   case 'print':window.print();return;
   case 'complete':if(await save(p=>{p.completed[lesson.id]=true;}))render();return;
   case 'flip':flipped=true;break;
   case 'card-next':cardIndex++;flipped=false;break;
   case 'rate':{
    const now=Date.now();
    const due=reviewRows(lesson).filter(row=>(progress().cards[row.id]?.due||0)<=now);
    if(!due.length||!flipped)return;
    const row=due[cardIndex%due.length];
    if(!await save(p=>{
     const previous=p.cards[row.id]?.interval||0;
     const interval=value==='known'?Math.min(90,Math.max(3,previous*2)):value==='review'?1:0;
     p.cards[row.id]={interval,due:now+(interval?interval*day:600000)};
    }))return;
    flipped=false;
    break;
   }
   case 'lesson-quiz':startQuiz('اختبار الدرس',shuffle(study[lesson.id].questions));return;
   case 'unit-quiz':startQuiz('اختبار الوحدة',shuffle(bank.filter(q=>q.unit===Number(value))));return;
   case 'simulation':startQuiz('محاكاة نهائية تدريبية',units.flatMap(unit=>shuffle(bank.filter(q=>q.unit===unit.number)).slice(0,6)));return;
   case 'comprehensive':startQuiz('الامتحان الشامل',shuffle(bank));return;
   case 'retry':startQuiz('مراجعة الأخطاء',shuffle(bank.filter(q=>progress().mistakes[q.id])));return;
   case 'quiz-close':leave();break;
   case 'quiz-move':if(!quiz||quiz.submitted)return;quiz.index+=Number(value);break;
   case 'submit':await submitQuiz();return;
   case 'hint':{
    if(quiz?.mode!=='knowledge'||quiz.hintUsed)return;
    const q=quiz.questions[quiz.index];
    quiz.hidden=q.order.filter(i=>i!==q.correct).slice(0,2);
    quiz.hintUsed=true;
    break;
   }
   case 'skip-knowledge':
    if(quiz?.mode!=='knowledge'||quiz.skipUsed)return;
    quiz.skipUsed=true;
    quiz.hidden=[];
    if(quiz.index+1===quiz.questions.length){await submitQuiz();return;}
    quiz.index++;
    break;
   case 'answer':{
    if(!quiz||quiz.submitted)return;
    const option=Number(value);
    const question=quiz.questions[quiz.index];
    if(quiz.mode==='wall'){advanceWall('answer',option);return;}
    if(quiz.mode==='speed'&&Date.now()>=quiz.deadline){await submitQuiz();return;}
    quiz.answers[question.id]=option;
    if(quiz.mode==='speed'){
     if(option===question.correct){
      quiz.deadline+=3000;
      quiz.streak++;
      quiz.bestStreak=Math.max(quiz.bestStreak,quiz.streak);
      quiz.points+=10+Math.min(quiz.streak-1,5);
     }else quiz.streak=0;
     if(quiz.index+1===quiz.questions.length){await submitQuiz();return;}
     quiz.index++;
    }else if(['knowledge','error'].includes(quiz.mode)){
     if(option===question.correct){
      quiz.streak++;
      quiz.bestStreak=Math.max(quiz.bestStreak,quiz.streak);
      quiz.points+=100*(levels.indexOf(question.difficulty)+1);
     }else{
      quiz.streak=0;
      if(quiz.mode==='knowledge'){await submitQuiz();return;}
     }
     quiz.hidden=[];
     if(quiz.index+1===quiz.questions.length){await submitQuiz();return;}
     quiz.index++;
    }
    break;
   }
   default:return;
  }
  render();
 });
 return {open,restore,leave,view,applicationsView,lessonResources,solutions};
})();
