/** Scene decoration never changes the canonical educational content or RPC contract. */
const EducationalScenes=(()=>{
 const instructions=[
 'اصعد سلم المليون بإجابات صحيحة. استخدم التلميح أو حذف خيارين عند الحاجة.',
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
 function view(g,q,body,btn){let scene='';
  if(g.game===0)scene=`<ol class="edu-ladder">${g.ids.map((_,i)=>`<li class="${i===g.index?'active':i<g.index?'complete':''}">${nf(Math.round(1000000*(i+1)/g.ids.length))} ${i<g.index?'✓':''}</li>`).reverse().join('')}</ol>`;
  if(g.game===2)scene=`<div class="edu-room"><div class="edu-room-window">☀</div><div class="edu-room-desk">${btn('🗝 افحص الدرج','inspect')}</div><div class="edu-exit ${g.index===4&&g.feedback?.correct?'unlocked':''}"><span>باب المكتبة</span>${Array.from({length:5},(_,i)=>`<span class="edu-lock ${i<g.index?'unlocked':''}">${i<g.index?'🔓':'🔒'}</span>`).join('')}</div><div class="edu-room-note" role="status">${g.inspected?e(q.explanation):'درج مغلق على دليل • افحصه لتقرأ التلميح'}</div></div>`;
  if(g.game===4)scene='<div class="edu-verdict" aria-hidden="true"><span>✓</span><span>✕</span></div>';
  if(g.game===6)scene='<div class="edu-library-sign">📖 مكتبة الأدلة • ابحث واقرأ واستنتج</div>';
  if(g.game===10)scene=`<div class="edu-sky" aria-label="منارة من ${g.floors} طوابق"><div class="edu-beacon">✦</div>${Array.from({length:g.floors},(_,i)=>`<div class="edu-floor" style="--floor:${i}"><i></i><span>${nf(i+1)}</span><i></i></div>`).reverse().join('')}<div class="edu-foundation">قاعدة العلم</div></div>`;
  if(g.game===11&&g.unlocked)body=body.replace('<div class="edu-pipes" dir="ltr">','<div class="edu-flow" dir="ltr"><span class="edu-source">●</span><div class="edu-pipes" dir="ltr">').replace('</div>'+btn('اختبر اتصال المسار','connect'),'</div><span class="edu-sink">◉</span></div>'+btn('اختبر اتصال المسار','connect'));
  if(g.game===7)body=body.replace(/<p class="edu-spelling"[^>]*>.*?<\/p>/,`<div class="edu-spelling" aria-label="المصطلح المركب" aria-live="polite">${g.picks.map(id=>btn(g.letters.find(l=>l.id===id).text,'unletter',id)).join('')}${Array.from({length:g.letters.length-g.picks.length},()=>'<span class="edu-letter-slot">ـ</span>').join('')}</div>`);
  if(g.game===11&&g.unlocked)body=body.replace(/>(│|─)<\/button>/g,'><svg class="edu-pipe-art" viewBox="0 0 80 80" aria-hidden="true"><path class="edu-pipe-shell" d="M0 40H80"/><path class="edu-water" d="M0 40H80"/><path class="edu-collars" d="M8 24V56M72 24V56"/></svg></button>');
  return `<details class="edu-instructions" open><summary>طريقة اللعب</summary><p>${instructions[g.game]}</p></details>${scene}<div class="edu-task">${body}</div>`;
 }
 return {view};
})();
