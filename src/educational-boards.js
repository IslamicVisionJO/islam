/** Accessible boards share the original answer payload and server validation. */
const EducationalBoards=(()=>{
 function match(q,g,btn){
  const memory=g.game===12, pairs=g.response||{};
  const cards=(side)=>q.payload[side].map((x,i)=>{
   const selected=side==='left'?g.left===x.id:Object.values(pairs).includes(x.id);
   const linked=side==='left'?!!pairs[x.id]:Object.values(pairs).includes(x.id);
   return `<div class="edu-node ${linked?'linked':''}" data-node="${e(x.id)}" data-side="${side}" data-target="${side==='left'?e(pairs[x.id]||''):''}">${btn(memory?`${selected||linked?x.text:'❖'}`:x.text,side,x.id,`aria-label="${memory&&!selected&&!linked?'بطاقة ذاكرة '+(i+1):e(x.text)}" aria-pressed="${selected}"`)}${memory?btn('اقلب البطاقة','peek',side+':'+x.id):''}</div>`;
  }).join('');
  return `<p>${memory?'اقلب البطاقات لاستكشافها، ثم اختر المفهوم ومعناه.':'اختر مفهومًا ثم معناه لرسم خط بينهما. يمكنك تغيير الوصلة قبل التحقق.'}</p><div class="edu-wiring ${memory?'edu-memory':''}"><svg class="edu-wires" aria-hidden="true"></svg><div class="edu-pairs"><div>${cards('left')}</div><div>${cards('right')}</div></div><span class="edu-connection-count" role="status">${Object.keys(pairs).length} / ${q.payload.left.length} وصلات</span></div>${btn('تحقق من التوصيل','submit')}`;
 }
 function draw(){for(const board of document.querySelectorAll('.edu-wiring')){
  const svg=board.querySelector('svg'),box=board.getBoundingClientRect();svg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);svg.replaceChildren();
  const left=[...board.querySelectorAll('[data-side=left]')];
  for(const node of left){// Link targets come from rendered activity state, including online rooms.
   const target=node.dataset.target;if(!target)continue;
   const end=[...board.querySelectorAll('[data-side=right]')].find(n=>n.dataset.node===target);if(!end)continue;
   const a=node.getBoundingClientRect(),b=end.getBoundingClientRect(),line=document.createElementNS('http://www.w3.org/2000/svg','path');
   const x=a.left-box.left,y=a.top+a.height/2-box.top,xx=b.right-box.left,yy=b.top+b.height/2-box.top;
   line.setAttribute('d',`M${x} ${y} C${(x+xx)/2} ${y},${(x+xx)/2} ${yy},${xx} ${yy}`);svg.append(line);
  }
 }}
 new MutationObserver(records=>{if(records.some(r=>r.target.namespaceURI!=='http://www.w3.org/2000/svg'))requestAnimationFrame(draw);}).observe(document.getElementById('app'),{childList:true,subtree:true});
 window.addEventListener('resize',draw);
 document.addEventListener('click',ev=>{const b=ev.target.closest('[data-edu=peek]');if(!b)return;ev.stopImmediatePropagation();const node=b.closest('.edu-node'),card=node.querySelector('button'),[side,id]=b.dataset.value.split(':');const q=S.byId.get(document.querySelector('.edu-play')?.dataset.question);if(!q)return;card.textContent=card.textContent==='❖'?q.payload[side].find(x=>x.id===id).text:'❖';card.classList.toggle('flipped');});
 return {match};
})();
