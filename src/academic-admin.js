const AcademicAdmin=(()=>{
 const lessons=ACADEMIC_SEMESTER.units.flatMap(unit=>unit.lessons);
 const fields=[
  ['outcome','نتاج التعلّم',1200],['overview','شرح الدرس',6000],['practice','التطبيق العملي',2400]
 ];
 let selected=lessons[0].id, guides={}, pending=null, loaded=false, failed=false;
 let editing=false;
 const active=()=>S.page==='admin'&&authState().isAdmin&&Boolean(document.querySelector('#academic-guide-editor'));
 const guide=id=>guides[id]||ACADEMIC_STUDY[id].guide;
 function refresh(force=false){
  if(pending)return pending;
  if((loaded||failed)&&!force)return Promise.resolve(false);
  pending=Auth.knowledgeRpc('academic_guide_list').then(records=>{
   if(!records||typeof records!=='object'||Array.isArray(records))throw Error('Invalid response');
   guides=Object.fromEntries(lessons.filter(l=>{
    const item=records[l.id];
    return Number.isSafeInteger(item?.revision)&&item.revision>0&&fields.every(([key,,max])=>
     typeof item[key]==='string'&&item[key].trim()&&item[key].length<=max);
   }).map(l=>[l.id,records[l.id]]));
   loaded=true;
   failed=false;
   return Object.keys(guides).length>0;
  }).catch(()=>{failed=true;return false;}).finally(()=>{pending=null;});
  return pending;
 }
 function view(){
  const record=guide(selected);
  return `<section class="surface panel" id="academic-guide-editor">
   <h2>شروحات الفصل الدراسي الأول</h2>
   ${!loaded?`<p role="status">${failed?'تعذر تحميل سجل الشروحات. تحقق من الاتصال ومن تطبيق الترحيل 013.':'جارٍ تحميل الشروحات…'}</p>`:
    `<form id="academic-guide-form" class="ka-fields">
     <label>الدرس<select id="academic-guide-lesson" ${editing?'disabled':''}>${lessons.map(l=>`<option value="${l.id}" ${l.id===selected?'selected':''}>${e(l.name)}</option>`).join('')}</select></label>
     ${fields.map(([key,label,max])=>`<label class="ka-wide">${label}
      <textarea name="${key}" rows="4" maxlength="${max}" required ${editing?'disabled':''}>${e(record[key])}</textarea></label>`).join('')}
     <button class="btn btn-gold" type="submit" ${editing?'disabled':''}>حفظ الشرح المنشور</button>
    </form>`}
   <button class="btn btn-outline" type="button" id="academic-guide-refresh" ${editing?'disabled':''}>تحديث الشروحات</button>
  </section>`;
 }
 async function enter(){
  await refresh(true);
  if(active())render();
 }
 document.addEventListener('change',event=>{
  if(!active()||event.target.id!=='academic-guide-lesson')return;
  selected=event.target.value;
  render();
  document.querySelector('#academic-guide-lesson')?.focus();
 });
 document.addEventListener('click',event=>{
  if(active()&&event.target.closest('#academic-guide-refresh'))void enter();
 });
 document.addEventListener('submit',async event=>{
  if(!active()||event.target.id!=='academic-guide-form')return;
  event.preventDefault();
  if(editing)return;
  const form=new FormData(event.target);
  const args=Object.fromEntries(fields.map(([key])=>['p_'+key,form.get(key).trim()]));
  const id=selected;
  const writer=authState().user?.id;
  event.submitter.disabled=true;
  editing=true;
  try{
   await Auth.knowledgeRpc('academic_guide_save',{...args,p_lesson_id:id,p_revision:guide(id).revision||0});
   await refresh(true);
   notify('حُفظ الشرح المنشور.');
   if(active()&&writer===authState().user?.id)render();
  }catch(error){
   notify(error.message||'تعذر حفظ الشرح.');
  }finally{
   editing=false;
   if(event.submitter.isConnected)event.submitter.disabled=false;
   if(active()&&writer===authState().user?.id){
    const button=document.querySelector('#academic-guide-form [type="submit"]');
    if(button?.disabled)render();
   }
  }
 });
 return {view,enter,refresh,guide};
})();
