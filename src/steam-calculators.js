const SteamCalculators = (() => {
 const currency = new Intl.NumberFormat('ar-JO', {style:'currency',currency:'JOD'});
 const digits = new Intl.NumberFormat('ar-JO');
 const money = value => currency.format(value);
 function amount(name,label,required=false) {
  return `<label>${label}<input type="number" inputmode="decimal" name="${name}" step="0.001" min="${required?'0.001':'0'}" max="99999999999" ${required?'required':'placeholder="٠"'}></label>`;
 }
 function count(name,label,max) {
  return `<label>${label}<input type="number" inputmode="numeric" name="${name}" step="1" min="0" max="${max}" value="0" required></label>`;
 }
 const categories=[['zakat','زكاة المال'],['gold','زكاة الذهب'],['livestock','زكاة الأنعام'],['shares','زكاة الأسهم']];
 function zakatForms() {
  const bodies={
   zakat:`<p>للحساب المجمّع، أضف قيمة أموالك الزكوية مرة واحدة، بما فيها الذهب والأسهم إن وجدت.</p><div class="enrichment-grid">
    ${amount('cash','النقد والأرصدة المدّخرة (د.أ.)')}${amount('trade','قيمة البضائع المعدّة للبيع (د.أ.)')}
    ${amount('metals','قيمة المدّخرات الزكوية الأخرى (د.أ.)')}</div>`,
   gold:`<p>أدخل وزن الذهب المدّخر من كل عيار، ثم سعر غرام الذهب الخالص في الأردن يوم الحساب.</p><div class="enrichment-grid">
    ${[24,22,21,18,14].map(k=>amount('gold'+k,'وزن عيار '+digits.format(k)+' (غرام)')).join('')}
    ${amount('price','سعر غرام عيار ٢٤ (د.أ.)',true)}</div>`,
   shares:`<p>لأسهم المتاجرة أدخل سعر السوق يوم الحساب. لأسهم الاستثمار طويل الأجل أدخل حصة السهم من الموجودات الزكوية بحسب بيانات الشركة. احسب ما لم تُخرج الشركة زكاته عنك.</p><div class="enrichment-grid">
    ${count('shares','عدد الأسهم',999999999)}
    <label>غرض التملّك<select name="purpose"><option value="trade">المتاجرة</option><option value="invest">الاستثمار طويل الأجل</option></select></label>
    ${amount('shareValue','سعر السهم في السوق (د.أ.)',true)}</div>`,
   livestock:`<p>للأنعام السائمة التي ترعى معظم السنة، المقتناة للنماء أو الدرّ والنسل. للقطعان المعدّة للبيع استخدم قيمة البضائع في زكاة المال.</p>
    <label>نوع الأنعام<select name="animal"><option value="sheep">الغنم (الضأن والمعز)</option><option value="cattle">البقر والجاموس</option><option value="camels">الإبل</option></select></label>
    ${count('herd','عدد رؤوس النوع المختار',999999)}`
  };
  const buttons=categories.map(([key,title],i)=>`<button type="button" class="btn" data-zakat-category="${key}" aria-controls="calc-${key}" aria-pressed="${!i}">${title}</button>`).join('');
  return `<div class="zakat-options" role="group" aria-label="نوع الزكاة">${buttons}</div>`+categories.map(([key,title],i)=>
   `<form data-steam-calc="${key}" id="calc-${key}" aria-label="${title}" ${i?'hidden':''}>${bodies[key]}
    ${key==='livestock'?'':amount('nisab','النصاب المعتمد يوم الحساب (د.أ.)',true)+
    '<small>راجع قيمة النصاب لدى <a href="https://www.aliftaa.jo/" target="_blank" rel="noopener noreferrer">دائرة الإفتاء العام الأردنية</a>. لجمع أنواع من المال عند مقارنة المجموع بالنصاب، استخدم زكاة المال.</small>'}
    <label>هل اكتمل حول هجري على بلوغ النصاب؟
    <select name="year" required><option value="">اختر الإجابة</option><option value="yes">نعم</option><option value="no">لا</option></select></label>
    <button class="btn btn-primary">احسب الزكاة</button><div role="status"></div></form>`).join('');
 }
 function view() {
  return `<section class="knowledge-section steam-calculators"><h2>حاسبتا الزكاة والمواريث</h2>
   <details class="surface panel"><summary>حاسبة الزكاة في الأردن</summary>
   ${zakatForms()}</details>
   <details class="surface panel"><summary>حاسبة المواريث</summary><form data-steam-calc="estate">
   <p>تدرّب على قسمة التركة بين الزوج أو الزوجات والأبوين والأبناء والبنات. للقسمة الرسمية في الأردن يُرجع إلى حجة حصر الإرث.</p>
   <div class="enrichment-grid">${amount('estate','صافي التركة بعد التجهيز والديون والوصايا المستحقة (د.أ.)',true)}
   <label>الزوج أو الزوجات<select name="partner"><option value="0">لا يوجد</option><option value="husband">زوج</option>
   ${[1,2,3,4].map(n=>`<option value="${n}">${['زوجة واحدة','زوجتان','ثلاث زوجات','أربع زوجات'][n-1]}</option>`).join('')}</select></label>
   ${count('sons','عدد الأبناء الذكور',999)}${count('daughters','عدد البنات',999)}</div>
   <label><input type="checkbox" name="father"> الأب على قيد الحياة</label>
   <label><input type="checkbox" name="mother"> الأم على قيد الحياة</label>
   <label>هل يوجد أقارب آخرون قد يرثون (كالأجداد أو الإخوة)، أو أحفاد من ولد متوفّى، أو حمل أو مانع إرث؟
   <select name="other" required><option value="">اختر الإجابة</option><option value="yes">نعم أو لست متأكدًا</option><option value="no">لا</option></select></label>
   <button class="btn btn-primary">احسب الأنصبة</button><div role="status"></div></form></details></section>`;
 }
 function inheritance(form) {
  const sons=Number(form.get('sons')), daughters=Number(form.get('daughters'));
  const children=sons+daughters, father=form.has('father'), mother=form.has('mother');
  const partner=form.get('partner'), husband=partner==='husband', wives=husband?0:Number(partner);
  if(form.get('other')!=='no') return 'تحتاج هذه المسألة إلى حصر الورثة ودراسة حالتهم لدى المحكمة الشرعية.';
  if(!children&&!father&&!mother) return 'تحتاج هذه المسألة إلى مراجعة المحكمة الشرعية لتحديد مستحقي التركة.';
  // Fixed shares use a common denominator of 24 before awl, residue or radd.
  const rows=[];
  const add=(label,units,people=1)=>rows.push({label,units,people});
  const spouse=husband?(children?6:12):wives?(children?3:6):0;
  if(spouse) add(husband?'الزوج':wives===1?'الزوجة':'الزوجات',spouse,wives||1);
  if(mother) add('الأم',children?4:father&&spouse?(24-spouse)/3:8);
  if(father) add('الأب',children?4:0);
  if(daughters&&!sons) add(daughters===1?'البنت':'البنات',daughters===1?12:16,daughters);
  let total=rows.reduce((sum,row)=>sum+row.units,0);
  const remainder=24-total;
  if(sons){
   const weights=2*sons+daughters;
   rows.forEach(row=>row.units*=weights);
   add(sons===1?'الابن':'الأبناء',remainder*2*sons,sons);
   if(daughters) add(daughters===1?'البنت':'البنات',remainder*daughters,daughters);
   total=24*weights;
  }else if(remainder>0&&father){
   rows.find(row=>row.label==='الأب').units+=remainder;
   total=24;
  }else if(remainder>0){
   const kin=total-spouse;
   rows.forEach((row,i)=>row.units*=spouse&&i===0?kin:24-spouse);
   total=24*kin;
  }
  const estate=Number(form.get('estate'));
  return '<h3>توزيع صافي التركة</h3><ul>'+rows.map(({label,units,people})=>{
   let a=units,b=total;
   while(b){const rest=a%b;a=b;b=rest;}
   const fraction=`<bdi>${digits.format(units/a)}/${digits.format(total/a)}</bdi>`;
   return `<li><strong>${label}</strong> · ${fraction} من التركة · ${money(estate*units/total)}${people>1?` (لكل فرد ${money(estate*units/total/people)})`:''}</li>`;
  }).join('')+'</ul><small>المبالغ مقرّبة لأقرب فلس.</small>';
 }
 // Find the combination accounting for the most animals under the two group rules.
 function groupedHerd(size,small,large,first,second) {
  let best=-1,counts=[];
  for(let j=0;j<=Math.floor(size/large);j++){
   const i=Math.floor((size-j*large)/small);
   const covered=i*small+j*large;
   if(covered>best){best=covered;counts=[i,j];}
   if(covered===size)break;
  }
  return [first,second].map((label,i)=>counts[i]?digits.format(counts[i])+' × '+label:'').filter(Boolean).join(' و ');
 }
 function livestock(form) {
  const n=Number(form.get('herd')), animal=form.get('animal');
  const minimum={sheep:40,cattle:30,camels:5}[animal];
  if(n<minimum)return 'القطيع دون النصاب ('+digits.format(minimum)+' رأسًا).';
  if(form.get('year')!=='yes')return 'لم يكتمل الحول الهجري.';
  let due;
  if(animal==='sheep'){
   const sheep=n<121?1:n<201?2:n<400?3:Math.floor(n/100);
   due=digits.format(sheep)+' من الغنم';
  }else if(animal==='cattle')due=groupedHerd(n,30,40,'تبيع أو تبيعة (أتمّ سنة)','مُسنّة (أتمّت سنتين)');
  else if(n<25)due=digits.format(Math.floor(n/5))+' من الغنم';
  else if(n<=120)due=[[35,'بنت مخاض'],[45,'بنت لبون'],[60,'حِقّة'],[75,'جَذَعة'],[90,'بنتا لبون'],[120,'حِقّتان']].find(([limit])=>n<=limit)[1];
  else due=groupedHerd(n,40,50,'بنت لبون','حِقّة');
  return '<h3>الواجب في القطيع</h3><p>'+due+'</p>';
 }
 function zakat(form,kind) {
  if(kind==='livestock')return livestock(form);
  let detail='',total;
  if(kind==='gold'){
   const pure=[24,22,21,18,14].reduce((sum,k)=>sum+Number(form.get('gold'+k))*k/24,0);
   detail='وزن الذهب الخالص '+digits.format(pure)+' غرام. ';
   total=Math.round(pure*Number(form.get('price'))*1000);
  }else if(kind==='shares'){
   total=Number(form.get('shares'))*Math.round(Number(form.get('shareValue'))*1000);
  }else total=['cash','trade','metals'].reduce((sum,key)=>sum+Math.round(Number(form.get(key))*1000),0);
  const nisab=Math.round(Number(form.get('nisab'))*1000);
  const reason=total<nisab?'المجموع دون النصاب.':form.get('year')!=='yes'?'لم يكتمل الحول الهجري.':'بلغ المال النصاب واكتمل الحول. نسبة الزكاة ٢٫٥٪.';
  const due=total>=nisab&&form.get('year')==='yes'?total/40000:0;
  return `<h3>الزكاة المستحقة · ${money(due)}</h3><p>${detail}القيمة الزكوية ${money(total/1000)}. ${reason}</p>`;
 }
 document.addEventListener('click',event=>{
  const selected=event.target.closest('[data-zakat-category]');
  if(!selected)return;
  const container=selected.closest('details');
  for(const button of container.querySelectorAll('[data-zakat-category]')){
   const active=button===selected;
   button.setAttribute('aria-pressed',String(active));
   container.querySelector('#'+button.getAttribute('aria-controls')).hidden=!active;
  }
 });
 document.addEventListener('change',event=>{
  if(!event.target.matches('#calc-shares [name=purpose]'))return;
  const input=event.target.form.elements.shareValue;
  input.value='';
  input.parentNode.firstChild.textContent=event.target.value==='invest'?'حصة السهم من الموجودات الزكوية (د.أ.)':'سعر السهم في السوق (د.أ.)';
 });
 document.addEventListener('submit',event=>{
  const form=event.target;
  if(!form.matches('[data-steam-calc]'))return;
  event.preventDefault();
  const data=new FormData(form);
  form.querySelector('[role=status]').innerHTML=form.dataset.steamCalc==='estate'?inheritance(data):zakat(data,form.dataset.steamCalc);
 });
 document.addEventListener('input',event=>{
  const form=event.target.closest('[data-steam-calc]');
  if(form)form.querySelector('[role=status]').replaceChildren();
 });
 return {view};
})();
