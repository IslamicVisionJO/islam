export const games={
 blocks:{title:'أبراج النور',tip:'حرّك القطعة ودوّرها لتملأ صفًا كاملًا. يمكنك الاحتفاظ بقطعة واحدة لكل دور.'},
 space:{title:'حُرّاس المدار',tip:'تحرّك تحت الأسطول وأطلق نحو السفن. احمِ مركبتك واجمع ترقيات قبل مواجهة الزعيم.'},
 bubbles:{title:'مدار اللآلئ',tip:'وجّه التصويب ثم أطلق. تنفجر ثلاث لآلئ متصلة من اللون نفسه وتسقط اللآلئ المنفصلة عن السقف.'},
 tiles:{title:'نبض المسارات',tip:'المس المسار عند خط الإيقاع. أبقِ إصبعك على النغمات الطويلة واضغط مسارين معًا للبلاطات المزدوجة.'}
};
export const levels={easy:'سهل',medium:'متوسط',hard:'صعب'};
export function random(seed){
 let state=seed>>>0;
 return ()=>{state=(state+0x6D2B79F5)>>>0;let t=Math.imul(state^(state>>>15),1|state);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
}
export function shuffled(items,rng){
 const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;
}
export function deck(bank,ids,level,count,rng){
 const allowed=new Set(ids),seen=new Set();
 const pool=bank.filter(q=>allowed.has(q.lesson)&&q.level===level&&!seen.has(q.id)&&seen.add(q.id));
 if(pool.length<count)return [];
 const positions=shuffled([0,1,2,3],rng);
 return shuffled(pool,rng).slice(0,count).map((q,i)=>{
  const options=shuffled(q.options.map((text,index)=>({text,index})),rng);
  const target=positions[i%4],correct=options.findIndex(o=>o.index===q.correct);
  [options[target],options[correct]]=[options[correct],options[target]];
  return {...q,options:options.map(o=>o.text),correct:target};
 });
}
