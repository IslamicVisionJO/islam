/** Scene decoration never changes the canonical educational content or RPC contract. */
const EducationalScenes=(()=>{
 const instructions=[
 'أكمل جميع الأسئلة لتفوز. الخطأ أو انتهاء الوقت أو الخروج يمنح صفرًا. لكل مساعدة استخدام واحد؛ الجمهور والصديق محاكاة قد تخطئ.',
 'صِل المصطلحات بمعانيها. الخطوط تُظهر اختياراتك قبل التسليم.',
 'افحص عناصر الغرفة واجمع التلميح، ثم حل لغز كل قفل لفتح باب الخروج.',
 'أدر العجلة وانتظر توقفها، ثم أجب عن سؤال القطاع المحدد.',
 'اختر بوابة صح أو خطأ قبل انتهاء مهلة العبارة إن فعّلتها.',
 'اختر قيمة من لوحة الفئات؛ كل خانة تُلعب مرة واحدة.',
 'افتح الكتب على الرفوف، واقرأ الأدلة، ثم حل لغز المكتبة.',
 'اضغط الحروف لبناء المصطلح. يمكنك التراجع وإعادة التركيب.',
 'ركّب البلاطات بالترتيب أو صِل المفهوم بمعناه، ثم تحقق.',
 'ابحث عن المصطلحات في الشبكة وحدد أول حرف وآخر حرف في الصف.',
 'كل إجابة صحيحة تضيف طابقًا إلى المنارة. أكمل البناء في الوقت المحدد.',
 'اختر الحكم الموافق للدليل، ثم أدر الأنابيب حتى يمتد مسار متصل.',
 'احفظ التسلسل، ثم استرجعه. بعد ذلك اقلب بطاقات المفاهيم والمعاني وصِل الأزواج.'
 ];
 function select(button){
  if(!button||S.settings.lowEffects||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const rect=button.getBoundingClientRect(),copy=button.cloneNode(true),style=getComputedStyle(button);
  copy.removeAttribute('data-edu');copy.removeAttribute('id');copy.setAttribute('aria-hidden','true');copy.tabIndex=-1;copy.className='edu-selection-flight';
  Object.assign(copy.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',background:style.background,color:style.color,border:style.border,borderRadius:style.borderRadius,font:style.font,pointerEvents:'none',zIndex:'1000'});
  document.body.append(copy);const animation=copy.animate(button.dataset.gate?[{transform:'perspective(500px) rotateY(0)',opacity:1},{transform:'perspective(500px) rotateY(-35deg) scale(1.06)',opacity:0}]:[{transform:'scale(1)',opacity:1},{transform:'scale(1.18)',opacity:0}],{duration:320,easing:'ease-out'});animation.finished.then(()=>copy.remove(),()=>copy.remove());
 }
 function wheel(g){
  const colors=['#288b86','#b25c2e','#7053a3','#a13f62','#3e72b1','#628e35','#bc8a2e','#237eaa'],step=360/g.ids.length;
  const sectors=g.ids.map((_,i)=>`${colors[i%colors.length]} ${i*step}deg ${(i+1)*step}deg`).join(',');
  return `<div class="edu-wheel-wrap"><b class="edu-pointer" aria-hidden="true">▼</b><div class="edu-wheel ${g.spinning?'is-spinning':''}" style="background:conic-gradient(from ${-step/2}deg,${sectors});--wheel-end:${g.angle||0}deg;--wheel-start:${(g.angle||0)-1080}deg;transform:rotate(${g.angle||0}deg)">${g.ids.map((_,i)=>`<span style="--sector:${i*step}deg">${nf(i+1)}</span>`).join('')}</div></div>`;
 }
 function outcome(g){const complete=g.items.length>=g.ids.length&&g.items.every(x=>x.correct);return `<div class="edu-round-outcome ${complete?'is-complete':''}" role="status">${complete?'<span aria-hidden="true">✦ ✧ ✦</span><p>أحسنت! أكملت التحدي بنجاح</p>':'<p>انتهت الجولة — راجع إجاباتك وواصل التعلّم</p>'}</div>`;}
 function view(g,q,body,btn){let scene='';
  if(g.game===0)scene=`<ol class="edu-ladder">${g.ids.map((_,i)=>`<li class="${i===g.index?'active':i<g.index?'complete':''}">${nf(Math.round(1000000*(i+1)/g.ids.length))} ${i<g.index?'✓':''}</li>`).reverse().join('')}</ol>`;
  if(g.game===2)scene=`<div class="edu-room"><div class="edu-room-window">☀</div><div class="edu-room-desk">${btn('🗝 افحص الدرج','inspect')}${btn('📚 افحص الكتاب','hint')}</div><i class="edu-lantern" aria-hidden="true"></i><div class="edu-exit ${g.index===4&&g.feedback?.correct?'unlocked':''}"><span>باب المكتبة</span>${Array.from({length:5},(_,i)=>`<span class="edu-lock ${i<g.index+(g.feedback?.correct?1:0)?'unlocked':''}">${i<g.index+(g.feedback?.correct?1:0)?'🔓':'🔒'}</span>`).join('')}</div><div class="edu-room-note" role="status">${g.inspected?e(q.explanation):'درج مغلق على دليل • افحصه لتقرأ التلميح'}</div></div>`;
  if(g.game===3&&g.open)scene=wheel(g);
  if(g.game===4){scene='<div class="edu-garden" aria-hidden="true"><i></i><i></i><i></i></div>';body=body.replace(/data-edu="answer" data-value="(true|false)"/g,(_,v)=>`data-edu="answer" data-value="${v}" data-gate="${v}"`);}
  if(g.game===6)scene='<div class="edu-library-sign">📖 مكتبة الأدلة • ابحث واقرأ واستنتج</div>';
  if(g.game===10)scene=`<div class="edu-sky" aria-label="منارة من ${g.floors} طوابق"><div class="edu-beacon" style="--light:${Math.min(1,.2+g.floors/8)}">✦</div>${Array.from({length:g.floors},(_,i)=>`<div class="edu-floor" style="--floor:${i}"><i></i><span>${nf(i+1)}</span><i></i></div>`).reverse().join('')}<div class="edu-foundation">قاعدة العلم</div></div>`;
  if(g.game===11&&g.unlocked)body=body.replace('<div class="edu-pipes" dir="ltr">',`<div class="edu-flow ${g.rotations.every(r=>r%2===0)?'connected':''}" dir="ltr"><span class="edu-source">●</span><div class="edu-pipes" dir="ltr">`).replace('</div>'+btn('اختبر اتصال المسار','connect'),'</div><span class="edu-sink">◉</span></div>'+btn('اختبر اتصال المسار','connect'));
  if(g.game===7)body=body.replace(/<p class="edu-spelling"[^>]*>.*?<\/p>/,`<div class="edu-spelling" aria-label="المصطلح المركب" aria-live="polite">${g.picks.map(id=>btn(g.letters.find(l=>l.id===id).text,'unletter',id)).join('')}${Array.from({length:g.letters.length-g.picks.length},()=>'<span class="edu-letter-slot">ـ</span>').join('')}</div>`);
  if(g.game===11&&g.unlocked)body=body.replace(/>(│|─)<\/button>/g,'><svg class="edu-pipe-art" viewBox="0 0 80 80" aria-hidden="true"><path class="edu-pipe-shell" d="M0 40H80"/><path class="edu-water" d="M0 40H80"/><path class="edu-collars" d="M8 24V56M72 24V56"/></svg></button>');
  return `<details class="edu-instructions" open><summary>طريقة اللعب</summary><p>${instructions[g.game]}</p></details>${scene}<div class="edu-task ${g.feedback?(g.feedback.correct?'scene-correct':'scene-wrong'):''}">${g.feedback?.correct?'<div class="edu-sparks" aria-hidden="true">'+Array.from({length:12},(_,i)=>`<i style="--i:${i}"></i>`).join('')+'</div>':''}${body}</div>`;
 }
 return {view,wheel,outcome,select};
})();
