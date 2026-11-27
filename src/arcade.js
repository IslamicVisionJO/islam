const Arcade = (() => {
 const games = [
  ['blocks','أبراج النور','رتّب القطع وأكمل الصفوف.','فردي ومواجهة'],
  ['space','حُرّاس المدار','احمِ مركبتك واجتز موجات الأسطول.','فردي ومواجهة وتعاون'],
  ['bubbles','مدار اللآلئ','صوّب لتجمع ثلاث لآلئ من اللون نفسه.','فردي ومواجهة'],
  ['tiles','نبض المسارات','اعزف المقطع بدقة وحافظ على الإيقاع.','فردي ومواجهة']
 ];
 let dialog;
 function cards(){
  return '<section class="arcade-shelf"><h2>صالة الألعاب التفاعلية</h2><div>'+games.map(([id,name,desc,modes])=>
   `<article><img loading="lazy" src="arcade/covers/${id}.png" alt="" width="480" height="240"><div><small>${modes}</small><h3>${name}</h3><p>${desc}</p><button class="btn btn-gold" data-arcade-game="${id}">العب ${name}</button></div></article>`).join('')+'</div></section>';
 }
 async function open(id){
  if(dialog||!games.some(g=>g[0]===id))return;
  const scope=db.scopeToken(),identity=Auth.current();
  const modal=document.createElement('dialog');
  dialog=modal;modal.className='arcade-modal';modal.setAttribute('aria-label',games.find(g=>g[0]===id)[1]);document.body.append(modal);
  const root=document.createElement('div');modal.append(root);
  const shadow=root.attachShadow({mode:'open'}),panel=document.createElement('main');
  shadow.append(panel);panel.textContent='جارٍ فتح اللعبة…';modal.showModal();
  let cleanup;
  const close=()=>{if(dialog!==modal)return;dialog=null;cleanup?.();modal.close();modal.remove();window.removeEventListener('platform-auth-change',checkIdentity);};
  const checkIdentity=()=>{if(db.scopeToken()!==scope||Auth.current().user?.id!==identity.user?.id)close();};
  window.addEventListener('platform-auth-change',checkIdentity);
  modal.addEventListener('cancel',ev=>{ev.preventDefault();close();});
  const url=new URL('arcade/app.mjs',location.href);
  try{
   const app=await import(url.href);
   if(!modal.isConnected)return;
   const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('arcade.css',url).href;shadow.prepend(css);
   cleanup=await app.mount(panel,{
    id, close, userId:identity.user?.id, isAdmin:identity.isAdmin===true,
    rpc:(name,args)=>Auth.arcadeRpc(name,args),verify:room=>Auth.arcadeVerify(room),
    history:()=>S.profile.arcade?.history||[], lowQuality:S.settings.lowEffects, muted:S.settings.sound===false,
    record:async result=>{
     if(scope!==db.scopeToken()||S.writerBlocked||S.writerSuspended)throw Error('تعذر حفظ الجولة في هذا الحساب.');
     if(S.profile.arcade?.history?.some(r=>r.id===result.id))return;
     const profile=clone(S.profile);
     profile.arcade={...profile.arcade,history:[result,...(profile.arcade?.history||[])].slice(0,150)};
     profile.xp=(profile.xp||0)+result.xp;profile.level=levelFromXp(profile.xp);
     await db.put('profile',profile,{scopeToken:scope});
     if(scope===db.scopeToken())Object.assign(S.profile,{arcade:profile.arcade,xp:profile.xp,level:profile.level});
    }
   });
   if(!modal.isConnected)cleanup?.();
  }catch{panel.replaceChildren(document.createTextNode('تعذر تحميل ملفات اللعبة. تحقق من الاتصال وأعد المحاولة. '));const back=document.createElement('button');back.textContent='إغلاق';back.onclick=close;panel.append(back);}
 }
 document.addEventListener('click',ev=>{const button=ev.target.closest?.('[data-arcade-game]');if(button)void open(button.dataset.arcadeGame);});
 return {cards,open};
})();
