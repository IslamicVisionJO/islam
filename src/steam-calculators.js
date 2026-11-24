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
 function view() {
  return `<section class="knowledge-section steam-calculators"><h2>حاسبتا الزكاة والمواريث</h2>
   <details class="surface panel"><summary>حاسبة الزكاة في الأردن</summary>
   <form data-steam-calc="zakat"><p>أدخل أموالك بالدينار الأردني يوم الحساب. احسب كل مبلغ مرة واحدة.</p>
   <div class="enrichment-grid">
   ${amount('cash','النقد والأرصدة المدّخرة')}
   ${amount('trade','قيمة البضائع المعدّة للبيع')}
   ${amount('metals','قيمة الذهب والفضة المدّخرين')}
   ${amount('nisab','النصاب المعتمد يوم الحساب (د.أ.)',true)}</div>
   <p>يمكنك مراجعة قيمة النصاب لدى <a href="https://www.aliftaa.jo/" target="_blank" rel="noopener noreferrer">دائرة الإفتاء العام الأردنية</a>.</p>
   <label>هل مرّت سنة هجرية كاملة على المال البالغ للنصاب؟
   <select name="year" required><option value="">اختر الإجابة</option><option value="yes">نعم</option><option value="no">لا</option></select></label>
   <button class="btn btn-primary">احسب الزكاة</button><div role="status"></div></form></details>
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
 function zakat(form) {
  const total=['cash','trade','metals'].reduce((sum,key)=>sum+Math.round(Number(form.get(key))*1000),0);
  const nisab=Math.round(Number(form.get('nisab'))*1000);
  const reason=total<nisab?'المجموع دون النصاب.':form.get('year')!=='yes'?'لم يكتمل الحول الهجري.':'بلغ المال النصاب واكتمل الحول. نسبة الزكاة ٢٫٥٪.';
  const due=total>=nisab&&form.get('year')==='yes'?total/40000:0;
  return `<h3>الزكاة المستحقة · ${money(due)}</h3><p>مجموع الأموال ${money(total/1000)}. ${reason}</p>`;
 }
 document.addEventListener('submit',event=>{
  const form=event.target;
  if(!form.matches('[data-steam-calc]'))return;
  event.preventDefault();
  const data=new FormData(form);
  form.querySelector('[role=status]').innerHTML=form.dataset.steamCalc==='zakat'?zakat(data):inheritance(data);
 });
 document.addEventListener('input',event=>{
  const form=event.target.closest('[data-steam-calc]');
  if(form)form.querySelector('[role=status]').replaceChildren();
 });
 return {view};
})();
