/* A staggered hex lattice. Inserting a ceiling row flips phase so existing
   bubbles move straight down, including across the narrower alternate rows. */
const W=320, H=480, R=20, ROW=Math.sqrt(3)*R, TOP=24, GUN={x:160,y:444}, DANGER=390;
const colors=[
  ['#d2ffff','#32ead4','#087672','#043d43'],
  ['#fff1d3','#ffb54c','#b04f1c','#591e1b'],
  ['#fff0fa','#ff69a7','#a72161','#4d163f'],
  ['#e5e6ff','#9493ff','#5045ba','#30205d'],
  ['#e7ffcf','#a1e359','#4e842d','#253f26'],
  ['#e5f4ff','#63bafa','#276aa9','#132f5a']
];
const settings={
  easy:{colors:3,rows:4,misses:6,speed:490,aimSpeed:1.55},
  medium:{colors:4,rows:5,misses:5,speed:535,aimSpeed:1.8},
  hard:{colors:5,rows:6,misses:4,speed:595,aimSpeed:2}
};
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const widthOf=(row,phase)=>8-((row+phase)%2);
const center=(row,col,phase)=>({x:R+(2*col+((row+phase)%2))*R,y:TOP+row*ROW});
const cellKey=(r,c)=>r*8+c;

export function neighbors(row,col,phase){
  const offset=(row+phase)%2;
  return [[row,col-1],[row,col+1],[row-1,col+offset-1],[row-1,col+offset],
    [row+1,col+offset-1],[row+1,col+offset]].filter(([r,c])=>r>=0&&c>=0&&c<widthOf(r,phase));
}
function region(board,first,phase,accept){
  const reached=new Set(),queue=[];
  function visit(row,col){
    const key=cellKey(row,col),value=board[row]?.[col];
    if(value==null||reached.has(key)||!accept(value))return;
    reached.add(key);queue.push([row,col]);
  }
  first.forEach(([r,c])=>visit(r,c));
  for(let i=0;i<queue.length;i++){
    const [r,c]=queue[i];
    neighbors(r,c,phase).forEach(([nr,nc])=>visit(nr,nc));
  }
  return reached;
}

export function resolveShot(board,row,col,color,phase,bomb=false){
  board[row]??=Array(widthOf(row,phase)).fill(null);
  board[row][col]=color;
  const matched=bomb?new Set([[row,col],...neighbors(row,col,phase)]
    .filter(([r,c])=>board[r]?.[c]!=null).map(([r,c])=>cellKey(r,c)))
    :region(board,[[row,col]],phase,v=>v===color);
  if(!bomb&&matched.size<3)return {popped:[],dropped:[]};
  const popped=[],dropped=[];
  function remove(r,c,out){
    out.push({...center(r,c,phase),color:board[r][c]});
    board[r][c]=null;
  }
  for(const key of matched)remove(Math.floor(key/8),key%8,popped);
  const roots=(board[0]||[]).map((_,c)=>[0,c]);
  const attached=region(board,roots,phase,()=>true);
  board.forEach((line,r)=>line.forEach((value,c)=>{
    if(value!=null&&!attached.has(cellKey(r,c)))remove(r,c,dropped);
  }));
  while(board.length&&!board.at(-1).some(v=>v!=null))board.pop();
  return {popped,dropped};
}

export function createGame({rng=Math.random,level='easy',sound=()=>{},reducedMotion=false,lowQuality=false}={}){
  const cfg=settings[level]||settings.easy,quiet=reducedMotion||lowQuality;
  let board=[],phase=0,stage=1,score=0,over=false,checkpoint=0;
  let missesLeft=cfg.misses,combo=0,hitsToQuiz=0,angle=-Math.PI/2,left=false,right=false;
  let attacks=0,pendingChallenge=false,lastChallenge=-24;
  let current,next,bomb=false,shot=null,particles=[],time=0,glow=0,flash='',rect=null;
  const controls=[
    {action:'left',label:'تصويب يسارًا',key:'ArrowLeft'},
    {action:'right',label:'تصويب يمينًا',key:'ArrowRight'},
    {action:'shoot',label:'إطلاق',key:'Space'}
  ];
  function pick(list){return list[Math.min(list.length-1,Math.floor(rng()*list.length))];}
  function newRow(row){
    const palette=Array.from({length:Math.min(colors.length,cfg.colors+Math.floor((stage-1)/2))},(_,i)=>i);
    const line=[];
    for(let c=0;c<widthOf(row,phase);c++)
      line.push(c>0&&rng()<0.28?line[c-1]:pick(palette));
    return line;
  }
  function available(){return [...new Set(board.flat().filter(v=>v!=null))];}
  function loadStage(){
    phase=0;board=[];
    for(let r=0;r<Math.min(7,cfg.rows+Math.floor((stage-1)/2));r++)board.push(newRow(r));
    missesLeft=cfg.misses;
    const palette=available();current=pick(palette);next=pick(palette);
  }
  loadStage();
  function aim(point){
    let x=point.x*W,y=point.y*H;
    if(rect){x=(point.x*rect.width-rect.x)/rect.scale;y=(point.y*rect.height-rect.y)/rect.scale;}
    if(!Number.isFinite(x)||!Number.isFinite(y)||y>=GUN.y-6)return;
    angle=clamp(Math.atan2(y-GUN.y,x-GUN.x),-Math.PI+.2,-.2);
  }
  function notify(message){flash=message;glow=1.15;}
  function freezeBonus(){
    if(over)return;
    bomb=true;missesLeft=cfg.misses;notify('فقاعة شُعاعية جاهزة');sound('reward');
  }
  function fire(){
    if(shot||over)return;
    shot={...GUN,vx:Math.cos(angle)*cfg.speed,vy:Math.sin(angle)*cfg.speed,color:current,bomb};
    bomb=false;sound('shoot');
  }
  function input(action,value){
    if(action==='left')left=Boolean(value);
    if(action==='right')right=Boolean(value);
    if(over)return;
    if(action==='aim'&&value)aim(value);
    if(action==='shoot'&&value)fire();
  }
  function eachBubble(fn){
    board.forEach((line,r)=>line.forEach((color,c)=>{
      if(color!=null)fn(r,c,color,center(r,c,phase));
    }));
  }
  function impactAt(x,y){
    let nearest=null,best=(2*R-1.1)**2;
    eachBubble((r,c,color,p)=>{
      const distance=(x-p.x)**2+(y-p.y)**2;
      if(distance<best){best=distance;nearest=[r,c];}
    });
    return nearest;
  }
  function snap(projectile,contact){
    const candidates=contact?neighbors(...contact,phase):Array.from({length:widthOf(0,phase)},(_,c)=>[0,c]);
    let best=null,distance=Infinity;
    for(const [r,c] of candidates){
      if(board[r]?.[c]!=null)continue;
      const p=center(r,c,phase),d=(projectile.x-p.x)**2+(projectile.y-p.y)**2;
      if(d<distance){distance=d;best=[r,c];}
    }
    return best;
  }
  function burst(cells,falling){
    if(quiet)return;
    for(const p of cells.slice(0,18))for(let i=0;i<(falling?1:3);i++){
      const theta=(i*2.39996+p.x*.17+p.y*.21);
      particles.push({...p,vx:Math.cos(theta)*(falling?25:74),
        vy:falling?8:-55+Math.sin(theta)*55,life:falling?.68:.42,falling});
    }
    if(particles.length>96)particles.splice(0,particles.length-96);
  }
  function garbage(count=1){
    if(over||!Number.isSafeInteger(count)||count<1||pendingChallenge||time-lastChallenge<8)return false;
    pendingChallenge=true;
    return true;
  }
  function applyChallenge(){
    if(!pendingChallenge)return;
    pendingChallenge=false;lastChallenge=time;
    // Fill shallow vacancies only. A received challenge cannot move the
    // danger line, end the round directly, or consume the shared random stream.
    let added=0;
    for(let r=0;r<4&&added<2;r++)for(let c=0;c<widthOf(r,phase)&&added<2;c++){
      if(board[r]?.[c]!=null)continue;
      if(r>0&&!neighbors(r,c,phase).some(([nr,nc])=>board[nr]?.[nc]!=null))continue;
      board[r]??=Array(widthOf(r,phase)).fill(null);
      board[r][c]=next;
      added++;
    }
    if(!added)missesLeft=Math.max(1,missesLeft-1);
    notify('تحدّي المنافس');
  }
  function settle(contact){
    const p=shot;shot=null;
    const slot=snap(p,contact);
    if(!slot){over=true;return;}
    const result=resolveShot(board,...slot,p.color,phase,p.bomb);
    let ask=false;
    if(result.popped.length){
      combo++;hitsToQuiz++;
      if(combo%2===0||result.dropped.length>=4)attacks++;
      score+=(result.popped.length*10+result.dropped.length*20)*Math.min(5,combo);
      burst(result.popped,false);burst(result.dropped,true);sound('pop');
      if(hitsToQuiz>=3){ask=true;hitsToQuiz=0;}
      if(result.dropped.length)notify('سقوط السلسلة');
    }else{
      combo=0;
      if(--missesLeft===0){phase=1-phase;board.unshift(newRow(0));missesLeft=cfg.misses;notify('صف جديد');}
    }
    if(board.length===0){
      score+=stage*100;stage++;loadStage();ask=true;hitsToQuiz=0;sound('level');notify('مرحلة جديدة');
    }else{
      eachBubble((r,c,color,point)=>{if(point.y+R>=DANGER)over=true;});
      const palette=available();current=palette.includes(next)?next:pick(palette);next=pick(palette);
    }
    if(!over)applyChallenge();
    if(ask&&!over)checkpoint++;
  }
  function step(dt){
    if(over||!Number.isFinite(dt)||dt<=0)return;
    time+=dt;glow=Math.max(0,glow-dt);
    angle=clamp(angle+(Number(right)-Number(left))*cfg.aimSpeed*dt,-Math.PI+.2,-.2);
    for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=220*dt;}
    particles=particles.filter(p=>p.life>0);
    if(!shot)return;
    let remaining=dt;
    while(remaining>0&&shot){
      const tick=Math.min(remaining,1/180);remaining-=tick;
      shot.x+=shot.vx*tick;shot.y+=shot.vy*tick;
      if(shot.x<R){shot.x=2*R-shot.x;shot.vx=Math.abs(shot.vx);}
      if(shot.x>W-R){shot.x=2*(W-R)-shot.x;shot.vx=-Math.abs(shot.vx);}
      const contact=impactAt(shot.x,shot.y);
      if(contact||shot.y<=TOP)settle(contact);
    }
  }
  const patterns=['dot','bar','ring','diamond','cross','two'];
  function orb(ctx,x,y,color,size,charged=false){
    const palette=colors[color]||colors[0];
    const g=ctx.createRadialGradient(x-size*.35,y-size*.4,size*.08,x,y,size);
    g.addColorStop(0,charged?'#ffffff':palette[0]);g.addColorStop(.34,palette[1]);g.addColorStop(.78,palette[2]);g.addColorStop(1,palette[3]);
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,size,0,2*Math.PI);ctx.fill();
    ctx.strokeStyle=charged?'#fff7bd':palette[1];ctx.lineWidth=charged?2.8:1.25;ctx.stroke();
    ctx.save();ctx.translate(x,y);ctx.scale(size/18,size/18);
    ctx.strokeStyle='rgba(255,255,255,.88)';ctx.fillStyle='rgba(255,255,255,.92)';ctx.lineWidth=1.7;ctx.lineCap='round';
    ctx.beginPath();const shape=charged?'cross':patterns[color];
    if(shape==='dot'){ctx.arc(0,2,2.5,0,Math.PI*2);ctx.fill();}
    if(shape==='bar'){ctx.moveTo(-4,3);ctx.lineTo(4,3);}
    if(shape==='ring'){ctx.arc(0,2,3.5,0,Math.PI*2);}
    if(shape==='diamond'){ctx.moveTo(0,-2);ctx.lineTo(4,2);ctx.lineTo(0,6);ctx.lineTo(-4,2);ctx.closePath();}
    if(shape==='cross'){ctx.moveTo(-4,2);ctx.lineTo(4,2);ctx.moveTo(0,-2);ctx.lineTo(0,6);}
    if(shape==='two'){ctx.moveTo(-4,0);ctx.lineTo(4,0);ctx.moveTo(-4,4);ctx.lineTo(4,4);}
    ctx.stroke();ctx.restore();
  }
  function draw(ctx,width,height){
    const scale=Math.min(width/W,height/H);
    if(!(scale>0))return;
    rect={width,height,x:(width-W*scale)/2,y:(height-H*scale)/2,scale};
    ctx.save();ctx.fillStyle='#081c28';ctx.fillRect(0,0,width,height);
    ctx.translate(rect.x,rect.y);ctx.scale(scale,scale);
    ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();
    const gradient=ctx.createLinearGradient(0,0,W,H);
    gradient.addColorStop(0,'#153e50');gradient.addColorStop(.55,'#092932');gradient.addColorStop(1,'#122439');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,W,H);
    for(let i=0;i<38;i++){
      const x=(i*107+13)%W,y=(i*83+17-(quiet?0:time*(2+i%3))%H+H)%H;
      ctx.fillStyle=i%4?'#386171':'#638b91';ctx.fillRect(x,y,1.3,1.3);
    }
    ctx.strokeStyle='#735c62';ctx.setLineDash([4,7]);ctx.beginPath();ctx.moveTo(3,DANGER);ctx.lineTo(W-3,DANGER);ctx.stroke();ctx.setLineDash([]);
    if(!shot&&!over){
      let x=GUN.x,y=GUN.y,dx=Math.cos(angle)*8,dy=Math.sin(angle)*8;
      ctx.fillStyle='#b1e3dd';
      for(let i=0;i<110;i++){
        x+=dx;y+=dy;
        if(x<R){x=2*R-x;dx=-dx;}else if(x>W-R){x=2*(W-R)-x;dx=-dx;}
        if(y<=TOP||impactAt(x,y))break;
        if(i>2&&i%2===0){ctx.beginPath();ctx.arc(x,y,1.45,0,2*Math.PI);ctx.fill();}
      }
    }
    eachBubble((r,c,color,p)=>orb(ctx,p.x,p.y,color,R-1));
    for(const p of particles){
      ctx.globalAlpha=Math.min(1,p.life*3);
      if(p.falling)orb(ctx,p.x,p.y,p.color,R*.72);
      else{ctx.fillStyle=colors[p.color][1];ctx.fillRect(p.x,p.y,3,3);}
    }
    ctx.globalAlpha=1;
    ctx.save();ctx.translate(GUN.x,GUN.y);ctx.rotate(angle);
    ctx.fillStyle='#224c58';ctx.strokeStyle='#89c5ca';ctx.lineWidth=2;
    ctx.fillRect(-10,-9,46,18);ctx.strokeRect(-10,-9,46,18);
    ctx.fillStyle='#83d3d3';ctx.fillRect(28,-11,5,22);ctx.restore();
    if(!shot)orb(ctx,GUN.x,GUN.y,current,18,bomb);
    else orb(ctx,shot.x,shot.y,shot.color,18,shot.bomb);
    orb(ctx,42,443,next,12);
    ctx.textAlign='center';ctx.font='bold 11px sans-serif';ctx.fillStyle='#dfefef';ctx.fillText('التالية',42,469);
    ctx.fillText('مرحلة '+stage,267,431);ctx.fillText('قبل النزول '+missesLeft,267,451);
    if(combo>1){ctx.fillStyle='#f6d69a';ctx.fillText('×'+Math.min(5,combo),GUN.x,475);}
    if(glow>0){ctx.globalAlpha=Math.min(1,glow*3);ctx.fillStyle='#082532';ctx.fillRect(80,391,160,24);ctx.fillStyle='#d6ffeb';ctx.font='bold 13px sans-serif';ctx.fillText(flash,160,408);}
    ctx.restore();
  }
  return {step,input,draw,reward:freezeBonus,garbage,controls,get attacks(){return attacks;},get score(){return score;},get over(){return over;},get checkpoint(){return checkpoint;}};
}
