export async function contacts(panel,rpc,room,onJoin){
 const query=(action,data={})=>rpc('arcade_social',{p_action:action,p_data:data});
 const el=(name,text)=>{const n=document.createElement(name);n.textContent=text;return n;};
 const act=(name,fn)=>{const b=el('button',name);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch{panel.append(el('p','تعذر تنفيذ الطلب. تحقق من الرمز والاتصال.'));}finally{b.disabled=false;}};return b;};
 async function show(data){
  panel.replaceChildren(el('p','رمز صداقتي · '+data.code));
  const input=el('input','');input.setAttribute('aria-label','رمز الصديق');input.placeholder='رمز الصديق';input.maxLength=12;
  panel.append(input,act('طلب صداقة',async()=>show(await query('request',{code:input.value}))));
  for(const p of data.contacts){const row=el('p',p.name+' · ');panel.append(row);
   if(p.accepted){row.append(el('span','صديق'));if(room)row.append(act('دعوة إلى الغرفة',async()=>{await query('invite',{code:p.code,room});row.append(el('span',' أُرسلت الدعوة'));}));}
   else if(p.incoming)for(const [a,label] of [['accept','قبول'],['decline','رفض']])row.append(act(label,async()=>show(await query(a,{code:p.code}))));
   else row.append(el('span','بانتظار القبول'));
  }
  for(const invite of data.invites){const row=el('p','دعوة من '+invite.name);row.append(act('انضمام',()=>onJoin(invite.code)),act('رفض',async()=>show(await query('dismiss',{room:invite.room}))));panel.append(row);}
  panel.append(act('المسابقات التعليمية',async()=>{const cups=await query('competitions');if(!cups.length)panel.append(el('p','لا توجد مسابقات حاليًا.'));for(const c of cups){panel.append(act(c.title,async()=>{const scores=await query('competition_scores',{id:c.id});panel.append(el('p',scores.map(r=>r.name+' · '+r.points).join(' / ')||'بانتظار النتائج.'));}));}}));
  panel.append(act('ترتيب الأصدقاء',async()=>{const rows=await query('ranking');panel.append(el('p',rows.map((r,i)=>(i+1)+'. '+r.name+' · '+r.points).join(' / ')||'لم تُسجَّل نتائج بعد.'));}));
 }
 await show(await query('list'));
}
