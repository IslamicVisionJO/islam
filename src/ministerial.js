/** Lesson exams use the independently indexed ministerial pool. */
const Ministerial = (() => {
 const symbols = ['أ', 'ب', 'ج', 'د'];
 let attempt = null;
 const reset = () => { attempt = null; };
 const answered = () => attempt.responses.size;
 const button = (action, label, value='', disabled=false) =>
  `<button type="button" class="btn btn-outline" data-ministerial="${action}" data-value="${e(value)}" ${disabled?'disabled':''}>${e(label)}</button>`;

 function pool(id){
  const academicId=Revision.meta(id)?.academicId;
  if(!academicId)return MINISTERIAL_REVIEW?.[id]||Revision.loaded(id,'levels')?.levels;
  const levels={easy:[],medium:[],hard:[]};
  for(const q of ACADEMIC_STUDY[academicId].questions){
   levels[q.difficulty].push({id:q.id,type:'multiple_choice',prompt:q.prompt,explanation:q.explanation,
    payload:{options:q.options.map((text,i)=>({id:String(i),text}))},answer:{option_id:String(q.correct)},source:{printed_pages:[q.page]}});
  }
  return levels;
 }
 function view(lesson) {
  const levels = pool(lesson.id);
  if(!levels&&MINISTERIAL_REVIEW&&!Revision.loaded(lesson.id,'levels'))return Revision.loading(lesson.id,'levels');
  if (!levels) return '';
  const unit = unitFor(lesson.unitId);
  const title = `<h2>محاكاة وزارية تدريبية — اختر الإجابة الصحيحة</h2><p>${e(unit?.name || '')} · ${e(lesson.name)}</p>`;
  if (!attempt || attempt.lesson !== lesson.id || attempt.scope !== db.scopeToken()) {
   return title + '<p>اختر مستوى الاختبار</p><div class="study-actions">' +
    DIFFICULTIES.map(level => button('start', `المستوى ${{easy:'السهل',medium:'المتوسط',hard:'الصعب'}[level]}`, level)).join('') + '</div>';
  }
  const {questions, responses, index, level, done} = attempt;
  const total = questions.length;
  const heading = title + `<p>المستوى ${e(DIFF_NAMES[level])} · ${nf(total)} سؤالًا</p>`;
  if (done) {
   const correct = questions.filter(q => checkAnswer(q, responses.get(q.id))).length;
   return heading + `<p role="status">صحيحة ${nf(correct)} · خاطئة ${nf(answered()-correct)} · غير مجابة ${nf(total-answered())} · النسبة ${nf(Math.round(100*correct/total))}٪</p>
    ${button('start','أعد اختبار المستوى',level)}${button('reset','اختر مستوى آخر')}
    ${questions.map((q, i) => `<details class="learning-card"><summary>${nf(i+1)}. ${e(q.prompt)}</summary>
     <p>إجابتك: ${e(q.payload.options.find(o=>o.id===responses.get(q.id))?.text || 'لم تتم الإجابة')}</p>
     <p>${typeof REFINED_BANK_RELEASE!=='undefined'&&REFINED_BANK_RELEASE?'الإجابة الصحيحة:':'الإجابة في مفتاح المراجعة:'} ${e(describeAnswer(q))}</p><p>${e(q.explanation)}</p>
     <small>صفحة الكتاب: ${q.source.printed_pages.map(nf).join('، ')}</small></details>`).join('')}`;
  }
  const q = questions[index];
  return heading + `<p role="status">السؤال ${nf(index+1)} من ${nf(total)} · أجبت عن ${nf(answered())}</p>
   <progress aria-label="تقدم الاختبار" max="${total}" value="${answered()}"></progress>
   <fieldset class="ministerial-options"><legend>${e(q.prompt)}</legend>
   ${q.payload.options.map((option,i) => `<label><input type="radio" name="ministerial-answer" data-ministerial-answer value="${e(option.id)}" ${responses.get(q.id)===option.id?'checked':''}><span><strong>${symbols[i]}</strong> ${e(option.text)}</span></label>`).join('')}</fieldset>
   <div class="study-actions">${button('previous','السابق','',index===0)}${button('next','التالي','',index===total-1)}${button('submit','سلّم الاختبار')}</div>`;
 }

 document.addEventListener('change', event => {
  const input = event.target;
  if (!input.matches('[data-ministerial-answer]') || !attempt || attempt.done || attempt.scope !== db.scopeToken()) return;
  const q = attempt.questions[attempt.index];
  if (!isAnswered(q,input.value)) return;
  attempt.responses.set(q.id,input.value);
  const panel = input.closest('.learning-panel');
  panel.querySelector('progress').value = answered();
  panel.querySelector('[role=status]').textContent =
   `السؤال ${nf(attempt.index+1)} من ${nf(attempt.questions.length)} · أجبت عن ${nf(answered())}`;
 });

 document.addEventListener('click', event => {
  const control = event.target.closest('[data-ministerial]');
  if (!control) return;
  const lesson = Learning.selectedLesson();
  const levels = pool(lesson);
  if (!levels) return;
  const action = control.dataset.ministerial;
  if (action==='start') {
   const level = control.dataset.value;
   if (!DIFFICULTIES.includes(level)) return;
   attempt = {lesson, level, scope:db.scopeToken(), index:0, done:false, responses:new Map(),
    questions:shuffle(levels[level]).map(q => presentQuestion(q))};
  } else if (action==='reset') reset();
  else {
   if (!attempt || attempt.lesson!==lesson || attempt.done || attempt.scope!==db.scopeToken()) return;
   if (action==='next') attempt.index = Math.min(attempt.questions.length-1,attempt.index+1);
   if (action==='previous') attempt.index = Math.max(0,attempt.index-1);
   if (action==='submit') {
    const remaining = attempt.questions.length-answered();
    if (!window.confirm(remaining ? `بقي ${nf(remaining)} سؤالًا بلا إجابة. هل تريد التسليم؟` : 'هل تريد تسليم الاختبار؟')) return;
    attempt.done = true;
   }
  }
  render();
  document.querySelector('.learning-panel [data-ministerial]:not(:disabled), .learning-panel input')?.focus({preventScroll:true});
 });
 return {view, reset};
})();
