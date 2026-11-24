/** Local practice mirrors the ranked server rules. Seconds are independent of the frame rate. */
const WallRules=(()=>{
 const speeds={easy:.034,medium:.046,hard:.06};
 function project(round,seconds){
  if(round.phase!=='playing')return {height:round.height,elapsed:round.elapsed};
  const active=Math.max(0,seconds-round.delay);
  const moving=Math.max(0,active-Math.max(0,round.freeze-round.delay));
  const remaining=(1-round.height)/round.speed;
  return {height:Math.min(1,round.height+moving*round.speed),elapsed:round.elapsed+active-Math.max(0,moving-remaining)};
 }
 function start(questions,level,unit,lesson){
  return {questions,level,unit,lesson,index:0,total:questions.length,phase:'playing',height:.1,speed:speeds[level],
   delay:3,freeze:0,elapsed:0,score:0,correct:0,streak:0,best:0,receipts:[]};
 }
 function act(r,seconds,action,question,option){
  if(r.phase==='finished')return r;
  if(r.phase==='playing'){
   Object.assign(r,project(r,seconds));
   r.delay=Math.max(0,r.delay-seconds);r.freeze=Math.max(0,r.freeze-seconds);
   if(r.height>=1){r.phase='finished';r.reason='danger';return r;}
  }
  if(action==='exit'){r.phase='finished';r.reason='abandoned';return r;}
  if(action==='pause'&&r.phase==='playing'){r.phase='paused';r.delay=0;}
  if(action==='resume'&&r.phase==='paused'){r.phase='playing';r.delay=3;if(r.freeze)r.freeze+=3;}
  if(action==='answer'&&r.phase==='playing'&&!r.delay){
   const q=r.questions[r.index];
   if(q.id!==question||!q.payload.options.some(o=>o.id===option))return r;
   const correct=checkAnswer(q,option);
   r.feedback={id:q.id,prompt:q.prompt,choice:option,answer:describeAnswer(q),explanation:q.explanation,
    page:q.source.printed_pages[0],correct};
   r.receipts.push(r.feedback);r.phase='feedback';r.freeze=0;
   if(correct){
    r.correct++;r.streak++;r.best=Math.max(r.best,r.streak);
    r.score+=100+({3:50,5:100}[r.streak]||0);
    r.speed=Math.max(Math.min(.063,.018+r.correct*.0012),r.speed*.85);
    r.height=Math.max(.03,r.height-.085-(r.streak===5?.13:0));
   }else{
    r.streak=0;r.speed=Math.min(.14,r.speed*1.10);r.height=Math.min(.99,r.height+.032);
   }
  }
  if(action==='next'&&r.phase==='feedback'){
   if(r.index+1===r.total){r.phase='finished';r.reason='complete';}
   else{r.index++;r.phase='playing';if(r.streak===10)r.freeze=3;}
  }
  return r;
 }
 const title=score=>score>=3000?'أسطورة التحدي':score>=1800?'بطل المعرفة':score>=900?'المتميز':score>=400?'المتقدم':'المتعلم';
 return {start,act,project,title};
})();
