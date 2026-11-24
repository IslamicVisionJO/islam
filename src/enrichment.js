const Enrichment=(()=>{
 const fields=[
  ['العلوم · Science','قِس أثر ترشيد الماء في المدرسة، واربط النتائج بمسؤولية تجنّب الإسراف.'],
  ['التكنولوجيا · Technology','صمّم بطاقة رقمية للتحقق من الأخبار تراعي خصوصية أصحابها وتوضح مصادرها.'],
  ['الهندسة · Engineering','ارسم نموذجًا لتجميع مياه المطر وقارن بين الحلول بحسب الكلفة والمنفعة.'],
  ['الفنون · Arts','صمّم ملصقًا يعبّر عن قيمة الرفق باستخدام الخط العربي والتكوين البصري.'],
  ['الرياضيات · Mathematics','احسب أثر تنظيم ميزانية مبادرة تطوعية ومثّل أوجه الإنفاق بمخطط بياني.']
 ];
 const topics=[
  ['الأخلاق الإسلامية','حسن الخلق يظهر في طريقة الرد عند الاختلاف.','اعترض زميل على رأيك أمام الصف.','استمع إليه ثم ناقش الفكرة بهدوء من دون تجريح.','لقمان 18–19'],
  ['بر الوالدين','الإحسان يشمل الكلام الطيب والمساعدة بحسب الحاجة.','عاد أحد والديك متعبًا من العمل.','اعرض تولّي مهمة منزلية وتحدث باحترام إذا اختلفتما.','الإسراء 23–24'],
  ['الصدق والأمانة','الأمانة تحفظ حقوق الناس وتقوم على الصدق.','وجدت مبلغًا في الساحة المدرسية.','سلّمه للإدارة واشرح أين وجدته.','النساء 58'],
  ['احترام الآخرين','كرامة الإنسان تقتضي احترامه ولو اختلفت معه.','أخطأ طالب في قراءة نص أمام الجميع.','أعطه وقتًا للمحاولة وقدّم التصحيح بلطف.','الحجرات 11'],
  ['التعامل مع الأصدقاء','الصداقة تقوى بالنصح والوفاء والستر.','طلب صديق مشاركة صورة أحرجت زميلًا.','امتنع عن نشرها واشرح الضرر لصديقك.','الحجرات 12'],
  ['المسؤولية المجتمعية','المبادرة النافعة تبدأ بملاحظة حاجة يمكن معالجتها.','هناك طلاب يصعب عليهم الوصول إلى مواد المراجعة.','نسّق مع المعلم لتنظيم مشاركة المواد بين الطلاب.','المائدة 2'],
  ['المحافظة على البيئة','ترشيد الموارد يحفظها ويحدّ من الضرر على الآخرين.','يُترك صنبور الماء مفتوحًا بعد النشاط.','أغلقه وبلّغ عن التسرب وتابع إصلاحه.','الأعراف 31'],
  ['وسائل التواصل الاجتماعي','المسؤولية تشمل التثبت واحترام الخصوصية.','وصلتك رسالة تدّعي إلغاء الدوام بلا مصدر.','تحقق من إعلان المدرسة قبل إعادة الإرسال.','الحجرات 6'],
  ['الاستخدام المسؤول للتكنولوجيا','الخصوصية والصدق مطلوبان عند استخدام الأدوات الرقمية.','تريد استخدام أداة رقمية للمساعدة في واجب.','تأكد من الناتج واذكر المساعدة إذا طلب المعلم، واحذف الأسماء من أي ملف ترفعه.','الإسراء 36'],
  ['مواجهة التنمر والشائعات','رد الأذى يشمل عدم المشاركة ومساعدة المتضرر.','ينشر طلاب تعليقًا ساخرًا في مجموعة الصف.','امتنع عن التفاعل معه وادعم المتضرر وأبلغ شخصًا موثوقًا.','الحجرات 11–12'],
  ['إدارة الوقت','الالتزام بالواجبات يتحقق بتحديد الأولويات.','تتراكم المهام قبل أسبوع الامتحان.','قسّمها إلى فترات واضحة وخصص وقتًا للراحة والعبادة.','العصر 1–3'],
  ['العمل والتطوع','العمل النافع يحتاج اتفاقًا واضحًا وإتقانًا للمهمة.','شاركت في تنظيم حملة تنظيف.','حدّد دورك وموعد تسليمه ونسّق مع الفريق.','المائدة 2'],
  ['الوسطية والاعتدال','التوازن يساعد على أداء الواجبات دون إسراف أو إهمال.','تراجع لفترة طويلة وتفقد التركيز.','ضع جدولًا يوزع الدراسة والنوم والنشاط البدني.','البقرة 143'],
  ['حقوق الإنسان','العدل والكرامة أساس في التعامل مع الجميع.','توزع المجموعة الأدوار على أعضائها حسب صداقاتهم.','اتفقوا على معيار عادل وامنحوا الجميع فرصة المشاركة.','الإسراء 70، المائدة 8'],
  ['التعاون والتكافل الاجتماعي','المساعدة تراعي حاجة المستفيد وتحفظ كرامته.','يحتاج بعض الزملاء إلى أدوات مدرسية.','نظّم جمع الأدوات مع المعلم واحفظ أسماء المستفيدين.','المائدة 2'],
  ['القيم في المدرسة والأسرة والمجتمع','يمكن تطبيق القيمة نفسها في مواقف مختلفة.','اتفقت مع أخيك وفريق الصف على تقسيم المسؤوليات.','اكتب ما تعهدت به، ونفّذه أو اعتذر مبكرًا إن تعذّر.','المائدة 1']
 ];
 let rows=[], manage=false, edit=null, loading=false, message='', generation=0;
 const admin=()=>authState().isAdmin;
 function lifeTopics(){
  return '<div class="enrichment-grid">'+topics.map(([title,value,example,practice,reference])=>
    `<article class="surface panel"><h2>${e(title)}</h2><p>${e(value)}</p><p><strong>موقف يومي</strong> · ${e(example)}</p>
    <p><strong>كيف أطبّقها؟</strong> ${e(practice)}</p><small>للمراجعة من القرآن الكريم · ${e(reference)}</small></article>`).join('')+'</div>';
 }
 function image(raw,alt){
  return typeof raw==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(raw)
   ? `<img loading="lazy" src="data:image/jpeg;base64,${raw}" alt="${e(alt)}">` : '';
 }
 function editor(){
  const row=edit||{};
  return `<form id="steam-editor" class="surface panel">
   <h3>${row.id?'تعديل الإنجاز':'إضافة إنجاز'}</h3>
   <div class="enrichment-grid">
   <label>العنوان<input name="title" value="${e(row.title)}" required maxlength="120"></label>
   <label>الطالب أو الفريق<input name="team" value="${e(row.team)}" maxlength="120"></label>
   <label>التاريخ<input name="date" type="date" value="${e(row.achievement_date)}"></label>
   <label>الصور<input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
   </div>
   <label>الوصف<textarea name="description" required maxlength="2000">${e(row.description)}</textarea></label>
   ${(row.images||[]).map((img,i)=>`<label><input name="keep" type="checkbox" value="${i}" checked> الاحتفاظ بالصورة ${nf(i+1)}</label>`).join('')}
   <p class="muted">حتى خمس صور بصيغة JPEG أو PNG أو WebP. الحد للملف الأصلي 8 ميغابايت.</p>
   <label><input type="checkbox" name="published" ${row.published?'checked':''}> نشر للزوار</label>
   <button type="submit" class="btn btn-primary" ${loading?'disabled':''}>حفظ الإنجاز</button>
   ${row.id?'<button type="button" class="btn" data-steam="cancel">إلغاء التعديل</button>':''}
  </form>`;
 }
 function steam(){
  const authorized=manage&&admin();
  const shown=authorized?rows:rows.filter(row=>row.published);
  return heroTitle('التكامل المعرفي STEAM','مشاريع تربط التربية الإسلامية بالعلوم والتكنولوجيا والهندسة والفنون والرياضيات')+
   '<div class="enrichment-grid">'+fields.map(([title,value])=>`<article class="surface panel"><h2>${e(title)}</h2><p>${e(value)}</p></article>`).join('')+'</div>'+
   `<section class="steam-achievements"><h2>الإنجازات</h2>
   ${admin()?'<button class="btn btn-outline" data-steam="manage">'+(authorized?'عرض صفحة الزوار':'إدارة الإنجازات')+'</button>':''}
   ${authorized?editor():''}
   ${message?`<p class="auth-message" role="status">${e(message)}</p>`:''}
   ${loading?'<p role="status">جارٍ تحميل الإنجازات…</p>':''}
   ${shown.length?`<div class="enrichment-grid">${shown.map(row=>`<article class="surface panel">
    <h3>${e(row.title)}</h3><p>${e(row.description)}</p><p><small>${e([row.team,row.achievement_date].filter(Boolean).join(' · '))}</small></p>
    <div class="steam-gallery">${row.images.map((img,i)=>image(img,`${row.title}، الصورة ${nf(i+1)}`)).join('')}</div>
    ${authorized?`<p>${row.published?'منشور':'مسودة'}</p><button class="btn" data-steam="edit" data-id="${e(row.id)}">تعديل</button>
    <button class="btn btn-outline" data-steam="delete" data-id="${e(row.id)}">حذف</button>`:''}
   </article>`).join('')}</div>`:loading||message?'':'<p>سيتم إضافة الإنجازات قريبًا.</p>'}</section>`;
 }
 const repaint=()=>{if(S.page==='knowledge')render();};
 async function load(){
  const request=++generation;
  const identity=authState().user?.id;
  loading=true;message='';repaint();
  try{
   const result=await Auth.steamRpc('steam_list',{p_manage:manage&&admin()});
   if(request===generation&&identity===authState().user?.id)rows=result;
  }catch(error){
   if(request===generation){rows=[];message=error.message;}
  }finally{if(request===generation){loading=false;repaint();}}
 }
 async function encode(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('صيغة الصورة غير مدعومة أو حجمها يتجاوز الحد.');
  const bitmap=await createImageBitmap(file).catch(()=>{throw Error('تعذر قراءة الصورة.');});
  const canvas=document.createElement('canvas');
  try{
   const ratio=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));
   canvas.width=Math.max(1,Math.floor(bitmap.width*ratio));
   canvas.height=Math.max(1,Math.floor(bitmap.height*ratio));
   const ctx=canvas.getContext('2d');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const encoded=canvas.toDataURL('image/jpeg',0.76).split(',')[1];
   if(!encoded||encoded.length>666664)throw Error('الصورة كبيرة بعد المعالجة. اختر صورة أصغر.');
   return encoded;
  }finally{bitmap.close();}
 }
 document.addEventListener('submit',async ev=>{
  if(ev.target.id!=='steam-editor')return;
  ev.preventDefault();
  if(!admin()||!manage||loading)return;
  const form=new FormData(ev.target), button=ev.submitter;
  const editing=edit;
  const files=[...ev.target.elements.images.files];
  const kept=form.getAll('keep').map(i=>editing?.images[Number(i)]);
  if(kept.length+files.length>5){notify('الحد الأقصى خمس صور.');return;}
  button.disabled=true;
  try{
   const images=[...kept,...await Promise.all(files.map(encode))];
   await Auth.steamRpc('steam_save',{p_id:editing?.id||null,p_title:form.get('title'),p_description:form.get('description'),
    p_date:form.get('date')||null,p_team:form.get('team'),p_published:form.has('published'),p_images:images});
   edit=null;await load();
  }catch(error){notify(error.message);}finally{button.disabled=false;}
 });
 document.addEventListener('click',async ev=>{
  if(ev.target.closest('[data-steam-back]')){ev.preventDefault();go('home');return;}
  const btn=ev.target.closest('[data-steam]');
  if(!btn||!admin())return;
  const action=btn.dataset.steam;
  if(action==='manage'){manage=!manage;edit=null;rows=[];await load();return;}
  if(!manage||loading)return;
  if(action==='edit'){edit=rows.find(row=>row.id===btn.dataset.id)||null;repaint();document.querySelector('#steam-editor')?.scrollIntoView();}
  if(action==='cancel'){edit=null;repaint();}
  if(action==='delete'&&window.confirm('هل تريد حذف هذا الإنجاز وصوره؟')){
   btn.disabled=true;
   try{await Auth.steamRpc('steam_delete',{p_id:btn.dataset.id});edit=null;await load();}
   catch(error){notify(error.message);}finally{btn.disabled=false;}
  }
 });
 return {steam,lifeTopics,load};
})();
