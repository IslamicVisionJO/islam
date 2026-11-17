/** Content adapters preserve canonical text and provenance; no generated religious claims. */
const EducationalContent=(()=>{
 const names=['تحدي المليون','صِل المصطلح بمعناه','اهرب من الغرفة','عجلة الحظ','صح أم خطأ','لوحة بنك الأسئلة','البحث عن الأدلة المخفية','رتّب الحروف','رتّب البلاطات','شبكة المصطلحات','ابنِ منارة العلم','أوصل الدليل بالحكم','اختبر ذاكرتك الإسلامية'];
 const normalize=s=>s.normalize('NFC').replace(/[\u064B-\u065F\u0670\u0640\s]/g,'');
 function pool(bank,unit='all',lesson='all'){return bank.filter(q=>!q.review?.excluded&&(unit==='all'||q.unit_id===unit)&&(lesson==='all'||q.lesson_id===lesson));}
 function terms(bank){const seen=new Set();const curated={'u01_l02_q063':'الفطرة','u01_l06_q004':'الاجتهاد','u03_l03_q001':'العدة'};return [...bank.filter(q=>curated[q.id]).map(q=>({q,term:curated[q.id],definition:q.payload.options.find(o=>o.id===q.answer.option_id).text})),...bank.filter(q=>q.type==='matching').flatMap(q=>q.answer.pairs.map(p=>({q,term:q.payload.left.find(x=>x.id===p.left_id)?.text,definition:q.payload.right.find(x=>x.id===p.right_id)?.text,pair:p})))].filter(t=>{const k=normalize(t.term||'');if(!/^[\u0621-\u064A]{3,12}$/.test(k)||seen.has(k)||/[«»ﷺ﴿﴾]/.test(t.term))return false;seen.add(k);return true;});}
 function eligible(bank,game){if([1,12].includes(game))return bank.filter(q=>q.type==='matching');if(game===4)return bank.filter(q=>q.type==='true_false');if([7,9].includes(game))return terms(bank);if(game===8)return bank.filter(q=>['ordering','matching'].includes(q.type));if(game===11)return bank.filter(q=>q.type==='multiple_choice'&&/(الدليل|دليل|استدل|يدل قوله|يدل قول|قوله تعالى|قوله ﷺ)/.test(q.prompt));return bank.filter(q=>q.type==='multiple_choice'&&q.payload.options.length===4);}
 const icons=['trophy','eduMatch','eduDoor','eduWheel','eduBool','eduBoard','eduSearch','eduLetters','eduTiles','eduGrid','eduTower','eduPipe','eduMemory'];
 return {names,icons,normalize,pool,terms,eligible};
})();
/** Displayed ladder points are never a currency balance. */
const MillionRules=Object.freeze({
 won(g,reason='complete',now=Date.now()){
  return reason==='complete'&&(!g.end||now<g.end)&&Array.isArray(g.ids)&&g.ids.length>0&&new Set(g.ids).size===g.ids.length&&g.items?.length===g.ids.length&&g.ids.every(id=>g.items.filter(x=>x.id===id&&x.correct===true).length===1);
 },
 reward(g,reason='complete',now=Date.now()){return this.won(g,reason,now)?{xp:g.ids.length*10,coins:Math.floor(g.ids.length/2)}:{xp:0,coins:0};},
 audience(options,correct,rng=Math.random){const chosen=rng()<.7?correct:options[Math.floor(rng()*options.length)].id;const major=45+Math.floor(rng()*31),rest=100-major,result={};let remaining=rest;const others=options.filter(o=>o.id!==chosen);result[chosen]=major;others.forEach((o,i)=>{const n=i===others.length-1?remaining:Math.floor(remaining*rng());result[o.id]=n;remaining-=n;});return result;}
});
