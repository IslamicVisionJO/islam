const WallAdmin=(()=>{
 let tab='questions',rows=[],editing=null,search='',error='',busy=false,loaded=false,generation=0;
 const allowed=()=>authState().isAdmin;
 const current=()=>S.page==='wall-admin'&&allowed();
 const paint=()=>{if(current())render();};
 const btn=(action,text,id='')=>`<button type="button" class="btn btn-outline" data-wall-admin="${action}" data-id="${e(id)}" ${busy?'disabled':''}>${e(text)}</button>`;
 const option=(id,label,selected)=>`<option value="${e(id)}" ${id===selected?'selected':''}>${e(label)}</option>`;
 async function load(){
  if(!current())return;
  const request=++generation;const token=db.scopeToken();
  busy=true;error='';paint();
  try{
   const response=await Auth.wallRpc('wall_admin',{p_action:tab});
   if(request===generation&&token===db.scopeToken()){rows=response;loaded=true;}
  }catch(err){if(request===generation)error=err.message;}
  finally{if(request===generation){busy=false;paint();}}
 }
 function editor(){
  const q=editing,options=q.options||[];
  const correct=String(options.findIndex(o=>o.id===q.correct_id)+1);
  return `<form class="surface panel wall-editor" id="wall-editor">
   <h2>${q.id?'تعديل السؤال':'إضافة سؤال'}</h2><label>السؤال<input name="prompt" required minlength="5" maxlength="500" value="${e(q.prompt)}"></label>
   <div class="wall-settings"><label>الدرس<select name="lesson">${allLessons().map(l=>option(l.id,l.name,q.lesson_id)).join('')}</select></label>
   <label>الصعوبة<select name="difficulty">${DIFFICULTIES.map(d=>option(d,DIFF_NAMES[d],q.difficulty)).join('')}</select></label>
   <label>صفحة الكتاب<input type="number" name="page" min="6" max="178" required value="${e(q.page)}"></label></div>
   <div class="wall-settings">${['أ','ب','ج','د'].map((label,i)=>`<label>الخيار ${label}<input name="option${i+1}" maxlength="400" required value="${e(options[i]?.text)}"></label>`).join('')}</div>
   <label>الإجابة الصحيحة<select name="correct" required><option value="">اختر الرمز</option>${['أ','ب','ج','د'].map((label,i)=>option(String(i+1),label,correct)).join('')}</select></label>
   <label>تفسير الإجابة<textarea name="explanation" minlength="5" maxlength="1200" required>${e(q.explanation)}</textarea></label>
   <label><input name="enabled" type="checkbox" ${q.enabled!==false?'checked':''}> متاح في الجولات الجديدة</label>
   <button class="btn btn-primary" type="submit" ${busy?'disabled':''}>حفظ السؤال</button>${btn('cancel','إلغاء')}
  </form>`;
 }
 function view(){
  const query=search.trim().toLowerCase();
  const matched=rows.filter(q=>[q.id,q.prompt,q.name,byLesson(q.lesson_id)?.name].some(value=>value?.toLowerCase().includes(query)));
  return heroTitle('إدارة تحدي الجدار','الأسئلة ونتائج الترتيب')+
   `<div class="wall-controls"><button class="btn" data-action="navigate" data-page="wall">العودة إلى التحدي</button>
   ${btn('questions','الأسئلة')}${btn('results','النتائج')}${btn('refresh','تحديث')}${tab==='questions'?btn('new','إضافة سؤال'):''}</div>
   ${error?`<p role="alert" class="auth-message is-error">${e(error)}</p>`:''}
   ${editing?editor():''}
   <label>بحث <input id="wall-admin-search" type="search" value="${e(search)}"></label>
   ${busy?'<p role="status">جارٍ تحميل البيانات…</p>':''}
   ${loaded?`<p>${nf(matched.length)} سجلًا · يُعرض أول ${nf(Math.min(50,matched.length))}</p>`:''}
   <div class="wall-admin-rows">${matched.slice(0,50).map(row=>tab==='questions'?
    `<article class="surface panel"><h3>${e(row.prompt)}</h3><p>${e(byLesson(row.lesson_id)?.name)} · ${row.enabled?'متاح':'معطّل'} · صفحة ${nf(row.page)}</p>
    ${btn('edit','تعديل',row.id)}${btn('delete','حذف',row.id)}</article>`:
    `<article class="surface panel"><h3>${e(row.name)} · ${nf(row.score)} نقطة</h3>
    <p>${e(row.finished_at?.slice(0,10))} · ${row.hidden?'مخفي':'ظاهر'}</p>${btn('visibility',row.hidden?'إظهار في الترتيب':'إخفاء من الترتيب',row.id)}</article>`).join('')}</div>`;
 }
 async function mutate(action,data){
  const token=db.scopeToken(),request=++generation;
  busy=true;error='';
  try{
   await Auth.wallRpc('wall_admin',{p_action:action,p_data:data});
   if(request===generation&&token===db.scopeToken()){editing=null;await load();}
  }catch(err){if(request===generation){busy=false;error=err.message;paint();}}
 }
 document.addEventListener('submit',event=>{
  if(event.target.id!=='wall-editor')return;
  event.preventDefault();if(!current()||busy||!editing)return;
  const data=new FormData(event.target);
  const options=Array.from({length:4},(_,i)=>({id:String(i+1),text:data.get('option'+(i+1)).trim()}));
  const payload={id:editing.id,lesson_id:data.get('lesson'),difficulty:data.get('difficulty'),prompt:data.get('prompt').trim(),
   explanation:data.get('explanation').trim(),page:Number(data.get('page')),enabled:data.has('enabled'),options,correct_id:data.get('correct')};
  if(!isStandaloneGameQuestion({prompt:payload.prompt,payload:{options}})){error='اكتب السؤال بحيث يُفهم دون الرجوع إلى الدرس أو نص غير ظاهر.';paint();return;}
  event.submitter.disabled=true;void mutate('save',payload);
 });
 document.addEventListener('change',event=>{if(event.target.id==='wall-admin-search'&&current()){search=event.target.value;paint();}});
 document.addEventListener('click',event=>{
  const b=event.target.closest('[data-wall-admin]');if(!b||!current()||busy)return;
  const action=b.dataset.wallAdmin,row=rows.find(r=>r.id===b.dataset.id);
  if(['questions','results','refresh'].includes(action)){if(action!=='refresh')tab=action;search='';rows=[];editing=null;loaded=false;void load();return;}
  if(action==='new'||action==='edit'||action==='cancel'){editing=action==='new'?{}:action==='edit'?row:null;paint();return;}
  if(action==='delete'&&row&&confirm('حذف السؤال من الجولات الجديدة؟'))void mutate('delete',{id:row.id});
  if(action==='visibility'&&row)void mutate('visibility',{id:row.id,hidden:!row.hidden});
 });
 function leave(){generation++;busy=false;search='';rows=[];editing=null;loaded=false;error='';}
 return {view,load,leave};
})();
