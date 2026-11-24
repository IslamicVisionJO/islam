const BookSolutions=(()=>{
 let lessonId;
 const normalize=text=>text.normalize('NFKC').replace(/[\p{M}\u0640]/gu,'').replace(/[أإآ]/g,'ا');
 function open(id){
  if(id&&!Object.hasOwn(BOOK_SOLUTIONS,id))return;
  lessonId=id||null;
  history.replaceState(null,'',id?'#learning/'+id+'/solutions':'#learning/solutions');
  go('book-solutions');
 }
 function view(){
  const rows=BOOK_SOLUTIONS[lessonId]||[];
  const options=[...new Set(rows.map(row=>row.category))];
  return `<section class="book-solutions" dir="rtl">
    ${heroTitle('حلول الكتاب',lessonId?e(unitOfLesson(lessonId).name+' · '+byLesson(lessonId).name):'اختر درسًا لعرض أسئلته وإجاباته')}
    <label class="book-lesson-picker no-print">الدرس
    <select id="book-lesson"><option value="">اختر درسًا</option>
    ${S.units.map(unit=>`<optgroup label="${e(unit.name)}">${unit.lessons.filter(lesson=>Object.hasOwn(BOOK_SOLUTIONS,lesson.id)).map(lesson=>`<option value="${lesson.id}" ${lessonId===lesson.id?'selected':''}>${e(lesson.name)}</option>`).join('')}</optgroup>`).join('')}
    </select></label>
    ${!lessonId?'<button type="button" class="btn btn-outline" data-book-catalog>العودة إلى شرح الدروس</button>':`
    <div class="study-actions no-print"><button class="btn" data-learning="open" data-id="${lessonId}">العودة إلى شرح الدرس</button>
    <button class="btn btn-outline" data-book-print>طباعة الحلول</button></div>
    <p class="muted">من ملف «التربية الإسلامية سؤال وجواب». بعض الأسئلة مختصرة في المصدر، وتحتاج الحلول إلى مطابقة مع دليل المعلم.</p>
    <div class="study-filters no-print"><label>ابحث في السؤال أو الإجابة<input type="search" id="book-search"></label>
    <label>نوع النشاط<select id="book-category"><option value="">جميع الأنشطة والأسئلة</option>${options.map(t=>`<option>${e(t)}</option>`).join('')}</select></label></div>
    <p id="book-count" role="status">${nf(rows.length)} سؤالًا ونشاطًا</p>
    ${rows.map(row=>`<article class="surface panel book-answer" data-category="${e(row.category)}">
      <small class="tag">${e(row.category)}</small> <small>صفحة الكتاب ${row.pages.map(nf).join('–')}${row.number?' · السؤال '+e(row.number):''}</small>
      <h2>${e(row.question)}</h2><p><strong>${row.status==='verify'?'إجابة بحاجة إلى تحقق':row.status==='suggested'?'إجابة مقترحة':'الإجابة في ملف الحلول'}</strong></p>
      <p class="book-answer-text">${e(row.answer)}</p>
      ${row.note?`<p class="inline-note">${e(row.note)}</p>`:''}
      <small class="muted">صفحة ملف الحلول ${nf(row.handoutPage)}</small>
    </article>`).join('')}`}</section>`;
 }
 function filter(){
  const query=normalize(document.querySelector('#book-search').value.trim());
  const category=document.querySelector('#book-category').value;
  let count=0;
  for(const card of document.querySelectorAll('.book-answer')){
   card.hidden=Boolean(category&&card.dataset.category!==category)||!normalize(card.textContent).includes(query);
   if(!card.hidden)count++;
  }
  document.querySelector('#book-count').textContent=count?nf(count)+' سؤالًا ونشاطًا':'لا توجد نتائج مطابقة.';
 }
 document.addEventListener('change',ev=>{
  if(ev.target.id==='book-lesson'){open(ev.target.value);document.querySelector('#book-lesson')?.focus({preventScroll:true});}
 });
 document.addEventListener('input',ev=>{if(ev.target.id==='book-search'||ev.target.id==='book-category')filter();});
 document.addEventListener('click',ev=>{if(ev.target.closest('[data-book-print]'))window.print();if(ev.target.closest('[data-book-catalog]'))Learning.catalog();});
 return {open,view};
})();
