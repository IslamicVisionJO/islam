/** Displays the original two-year revision guide without loading PDF assets on other screens. */
const Revision=(()=>{
 const filename='content/BTEC_Islamic_Education_Revision.pdf';
 const total=65, firstPage=5, secondPage=35;
 const pages=new Map();
 for(const [units,start] of [[FIRST_BTEC_LESSONS,firstPage],[LEARNING_DATA.units,secondPage]]){
  units.flatMap(unit=>unit.lessons).forEach((lesson,index)=>pages.set(lesson.id,start+index));
 }
 const asset=path=>new URL(path,new URL('./',location.href)).href;
 const pdfUrl=()=>asset(filename);
 let loadDocument, renderTask, sequence=0, searchSequence=0, resizeObserver=null, zoom=1, page=1, scope;
 const safePage=n=>Number.isInteger(n)&&n>=1&&n<=total;
 const searchText=text=>text.normalize('NFKC').replace(/[\p{M}\p{Cf}\u0640]/gu,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/\s+/g,' ').trim().toLowerCase();
 const pageText=new Map();

 function getDocument(){
  if(!loadDocument)loadDocument=(async()=>{
   const base=asset('vendor/pdfjs/');
   const pdfjs=await import(base+'pdf.min.mjs');
   pdfjs.GlobalWorkerOptions.workerSrc=base+'pdf.worker.min.mjs';
   const pdf=await pdfjs.getDocument({url:pdfUrl(), cMapUrl:base+'cmaps/', cMapPacked:true,
    standardFontDataUrl:base+'standard_fonts/', wasmUrl:base+'wasm/', isEvalSupported:false}).promise;
   if(pdf.numPages!==total)throw Error('عدد صفحات المكثف لا يطابق الفهرس.');
   return pdf;
  })().catch(error=>{loadDocument=null;throw error;});
  return loadDocument;
 }
 function open(number){
  const token=db.scopeToken();
  if(token!==scope){scope=token;zoom=1;}
  page=safePage(number)?number:S.profile.revisionPage;
  if(!safePage(page))page=1;
  history.replaceState(null,'','#revision/'+page);
  go('revision');
  const openedPage=page;
  void Learning.updateProfile(next=>{next.revisionPage=openedPage;}).catch(()=>notify('تعذر حفظ صفحة المكثف.'));
 }
 function restore(){
  const match=location.hash.match(/^#revision(?:\/(\d{1,2}))?$/);
  if(!match)return false;
  open(match[1]?Number(match[1]):undefined);
  return true;
 }
 function button(lessonId,label='راجع هذا الدرس في المكثف'){
  return `<button class="btn btn-outline" data-revision-page="${pages.get(lessonId)}">${label}</button>`;
 }
 function view(){
  return `${heroTitle('المكثف الشامل','دليل المراجعة للسنة الأولى BTEC والسنة الثانية BTEC')}
  <section class="surface panel revision-reader" aria-label="قارئ المكثف">
   <div class="study-actions"><button class="btn btn-outline" data-revision-page="${firstPage}">السنة الأولى BTEC</button>
   <button class="btn btn-outline" data-revision-page="${secondPage}">السنة الثانية BTEC</button>
   <a class="btn btn-outline" href="${e(pdfUrl()+'#page='+page)}" target="_blank" rel="noopener">فتح PDF</a>
   <a class="btn btn-outline" href="${e(pdfUrl())}" download>تحميل المكثف الأصلي</a>
   <button class="btn btn-outline" data-revision="share">نسخ رابط الصفحة</button></div>
   <div class="study-actions revision-controls">
    <button class="btn btn-outline" data-revision-page="${page-1}" ${page===1?'disabled':''}>السابق</button>
    <label>صفحة <input type="number" id="revision-page" min="1" max="${total}" value="${page}" required> من ${nf(total)}</label>
    <button class="btn btn-outline" data-revision-page="${page+1}" ${page===total?'disabled':''}>التالي</button>
    <button class="btn btn-outline" data-revision="smaller" aria-label="تصغير" ${zoom<=1?'disabled':''}>−</button>
    <button class="btn btn-outline" data-revision="larger" aria-label="تكبير" ${zoom>=2?'disabled':''}>+</button>
    <button class="btn btn-outline" data-revision="fullscreen">ملء الشاشة</button>
   </div>
   <form class="study-actions" id="revision-search"><label>البحث في النص <input type="search" id="revision-query" required></label>
    <button class="btn btn-outline" type="submit">ابحث</button></form>
   <div id="revision-matches" class="study-actions" aria-live="polite"></div>
   <p id="revision-status" role="status">جارٍ تحميل صفحة المكثف…</p>
   <div class="revision-sheet" tabindex="0" aria-label="صفحة المكثف"><canvas aria-label="صفحة ${nf(page)} من المكثف"></canvas></div>
  </section>`;
 }
 async function draw(){
  const reader=document.querySelector('.revision-reader');
  if(!reader)return;
  const status=reader.querySelector('#revision-status'), target=reader.querySelector('canvas'), viewport=target.parentElement;
  const request=++sequence;
  renderTask?.cancel();
  try{
   const doc=await getDocument();
   const pdfPage=await doc.getPage(page);
   if(request!==sequence||!target.isConnected)return;
   const scale=Math.min(920,viewport.clientWidth)/pdfPage.getViewport({scale:1}).width*zoom;
   const ratio=Math.min(devicePixelRatio||1,2);
   const pixels=pdfPage.getViewport({scale:scale*ratio});
   target.width=Math.ceil(pixels.width);
   target.height=Math.ceil(pixels.height);
   target.style.width=Math.ceil(pixels.width/ratio)+'px';
   renderTask=pdfPage.render({canvas:target,viewport:pixels});
   await renderTask.promise;
   if(request===sequence&&target.isConnected)status.textContent='صفحة '+nf(page)+' من '+nf(total);
  }catch{
   if(request===sequence&&target.isConnected)status.textContent='تعذر عرض الصفحة هنا. يمكنك فتح ملف PDF أو تحميله.';
  }
 }
 async function search(form){
  const results=document.getElementById('revision-matches'), query=searchText(form.querySelector('input').value);
  const active=++searchSequence;
  if(!query)return;
  results.textContent='جارٍ البحث في صفحات المكثف…';
  try{
   const doc=await getDocument(), matches=[];
   for(let i=1;i<=total;i++){
    if(active!==searchSequence||!results.isConnected)return;
    if(!pageText.has(i)){
     const contents=await (await doc.getPage(i)).getTextContent();
     pageText.set(i,searchText(contents.items.map(x=>x.str||'').join(' ')));
    }
    if(pageText.get(i).includes(query))matches.push(i);
   }
   if(active!==searchSequence||!results.isConnected)return;
   results.innerHTML=matches.length?matches.map(i=>`<button class="btn btn-outline" data-revision-page="${i}">صفحة ${nf(i)}</button>`).join(''):'لم يظهر النص في الصفحات القابلة للبحث.';
  }catch{
   if(active===searchSequence&&results.isConnected)results.textContent='تعذر البحث في المكثف.';
  }
 }
 document.addEventListener('click',async event=>{
  const nav=event.target.closest('[data-revision-page]');
  if(nav){const n=Number(nav.dataset.revisionPage);if(safePage(n))open(n);return;}
  const action=event.target.closest('[data-revision]')?.dataset.revision;
  if(!action)return;
  try{
   if(action==='share'){await navigator.clipboard.writeText(location.href);notify('نُسخ رابط صفحة المكثف.');}
   if(action==='fullscreen'){
    if(document.fullscreenElement===document.documentElement)await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
   }
   if(action==='larger'||action==='smaller'){
    zoom=Math.max(1,Math.min(2,zoom+(action==='larger'?.25:-.25)));
    render();
    document.querySelector(`[data-revision="${action}"]:not(:disabled)`)?.focus();
   }
  }catch{notify('هذه العملية غير متاحة في المتصفح الحالي.');}
 });
 document.addEventListener('change',event=>{
  if(event.target.id!=='revision-page')return;
  if(event.target.reportValidity())open(event.target.valueAsNumber);
 });
 document.addEventListener('submit',event=>{
  if(event.target.id!=='revision-search')return;
  event.preventDefault();
  void search(event.target);
 });
 function bind(){
  const reader=document.querySelector('.revision-reader');
  resizeObserver?.disconnect();
  if(!reader)return;
  resizeObserver=new ResizeObserver(()=>void draw());
  resizeObserver.observe(reader.querySelector('.revision-sheet'));
 }
 function beforeRender(){sequence++;renderTask?.cancel();resizeObserver?.disconnect();}
 return {open,restore,button,view,bind,beforeRender,pages};
})();
