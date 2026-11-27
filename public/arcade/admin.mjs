export function mountAdmin(panel,rpc,back){
 panel.innerHTML='<section><h1>إدارة المواجهات التعليمية</h1><p data-status role="status"></p><form><label>اللعبة<select name="game"><option value="blocks">أبراج النور</option><option value="space">حرّاس المدار</option><option value="bubbles">مدار اللآلئ</option><option value="tiles">نبض المسارات</option></select></label><label><input name="enabled" type="checkbox" checked> تفعيل الغرف الجديدة</label><button>حفظ حالة اللعبة</button></form><form><label>معرّف السؤال<input name="question" required></label><label><input name="enabled" type="checkbox" checked> إتاحة السؤال للمواجهات الجديدة</label><button>حفظ حالة السؤال</button></form><button data-back>رجوع</button></section>';
 const status=panel.querySelector('[data-status]');
 async function update(data){try{const info=await rpc('arcade_room',{p_action:'admin',p_data:data});status.textContent='الغرف '+info.rooms+' · اللاعبون '+info.players+' · الألعاب الموقوفة '+(info.disabled.join('، ')||'لا توجد');}catch{status.textContent='تعذر فتح إدارة المواجهات. تحقق من الصلاحية وتفعيل الخدمة.';}}
 const [game,question]=panel.querySelectorAll('form');
 game.onsubmit=e=>{e.preventDefault();update({game:game.elements.game.value,enabled:game.elements.enabled.checked});};
 question.onsubmit=e=>{e.preventDefault();update({question:question.elements.question.value,questionEnabled:question.elements.enabled.checked});};
 panel.querySelector('[data-back]').onclick=back;void update({});
}
