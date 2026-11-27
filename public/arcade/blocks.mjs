// The well includes two hidden spawn rows. Simulation uses seconds and grid units.
const COLUMNS = 10;
const HIDDEN = 2;
const ROWS = 20 + HIDDEN;
const COLORS = { I:'#53dcf1', J:'#7c9fff', L:'#ffad73', O:'#ffe777', S:'#77e0ae', T:'#cfa4ff', Z:'#ff869d', G:'#a1acc2' };
const PIECES = {
  I:['....','IIII','....','....'], J:['J..','JJJ','...'], L:['..L','LLL','...'],
  O:['OO','OO'], S:['.SS','SS.','...'], T:['.T.','TTT','...'], Z:['ZZ.','.ZZ','...']
};
const PERFORMANCE = {easy:.86,medium:.59,hard:.39};
const ACTIONS = [
  {action:'left',label:'يسار',key:'ArrowLeft'},
  {action:'right',label:'يمين',key:'ArrowRight'},
  {action:'rotate',label:'تدوير',key:'ArrowUp'},
  {action:'down',label:'نزول',key:'ArrowDown'},
  {action:'drop',label:'إسقاط',key:'Space'},
  {action:'hold',label:'احتفاظ',key:'KeyC'}
];
const emptyRow = () => Array(COLUMNS).fill(null);

function rotations(shape) {
  let points = shape.flatMap((row,y)=>[...row].flatMap((s,x)=>s==='.'?[]:[[x,y]]));
  const variants = [];
  for(let i=0;i<4;i++){
    variants.push(points);
    points=points.map(([x,y])=>[shape.length-1-y,x]);
  }
  return variants;
}
const ROTATIONS = Object.fromEntries(Object.entries(PIECES).map(([name,shape])=>[name,rotations(shape)]));
// Clockwise wall kicks, with positive y extending down the well.
const KICKS = [
  [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]]
];
const I_KICKS = [
  [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
  [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  [[0,0],[1,0],[-2,0],[1,2],[-2,-1]]
];

export function createGame({rng=Math.random,level='easy',sound=()=>{}}={}) {
  let board=Array.from({length:ROWS},emptyRow);
  const upcoming=[], pressed=new Set(), particles=[];
  let active, stored=null, canHold=true, over=false, score=0, lines=0, locks=0, combo=-1, bestCombo=0, checkpoint=0;
  let fallClock=0, lockClock=0, repeatClock=0, repeats=false, lockResets=0, slow=0, lastDirection=0;
  let incoming=0, attack=0, garbageSequence=0, effect=null, rewarded=-1;

  function refill(){
    const bag=Object.keys(PIECES);
    for(let i=bag.length-1;i>0;i--){
      const j=Math.floor(rng()*(i+1));
      [bag[i],bag[j]]=[bag[j],bag[i]];
    }
    upcoming.push(...bag);
  }
  function spawn(type){
    if(!type){
      if(upcoming.length<4)refill();
      type=upcoming.shift();
    }
    active={type,rotation:0,x:Math.floor((COLUMNS-PIECES[type].length)/2),y:type==='I'?0:1};
    fallClock=lockClock=lockResets=0;
    if(!fits(active.x,active.y,0))over=true;
  }
  function fits(x,y,rotation){
    return ROTATIONS[active.type][rotation].every(([dx,dy])=>{
      const col=x+dx,row=y+dy;
      return col>=0&&col<COLUMNS&&row>=0&&row<ROWS&&!board[row][col];
    });
  }
  function grounded(){return !fits(active.x,active.y+1,active.rotation);}
  function move(dx,dy){
    if(!fits(active.x+dx,active.y+dy,active.rotation))return false;
    if(dx&&grounded()&&lockResets<12){lockClock=0;lockResets++;}
    active.x+=dx;active.y+=dy;
    return true;
  }
  function rotate(){
    if(active.type==='O')return;
    const r=(active.rotation+1)%4;
    for(const [dx,dy] of (active.type==='I'?I_KICKS:KICKS)[active.rotation]){
      if(!fits(active.x+dx,active.y+dy,r))continue;
      if(grounded()&&lockResets<12){lockClock=0;lockResets++;}
      Object.assign(active,{x:active.x+dx,y:active.y+dy,rotation:r});
      sound('rotate');return;
    }
  }
  function burst(row,color){
    for(let n=0;n<COLUMNS*2;n++){
      const phase=(n*47+row*19+locks*23)%101/100;
      particles.push({x:(n%10)+.5,y:row-HIDDEN+.5,vx:(phase-.5)*5,vy:-2-phase*3,age:0,color});
    }
  }
  function lock(){
    for(const [dx,dy] of ROTATIONS[active.type][active.rotation])board[active.y+dy][active.x+dx]=active.type;
    const retained=[];
    for(const [row,cells] of board.entries()){
      if(cells.every(Boolean))burst(row,COLORS[active.type]);
      else retained.push(cells);
    }
    const count=ROWS-retained.length;
    if(count){
      board=[...Array.from({length:count},emptyRow),...retained];
      combo++;bestCombo=Math.max(bestCombo,combo+1);
      score+=([0,100,300,500,800][count]+combo*50)*(1+Math.floor(lines/10));
      effect={text:combo>0?'سلسلة × '+(combo+1):'صفوف مكتملة +'+count,time:1.2};
      sound('clear');
    } else {combo=-1;sound('lock');}
    const progressBefore=Math.floor(lines/3);
    lines+=count;locks++;
    if(Math.floor(lines/3)>progressBefore||locks%8===0)checkpoint++;
    const strength=Math.max(0,count-1);
    const cancelled=Math.min(incoming,strength);
    incoming-=cancelled;attack+=strength-cancelled;
    if(incoming&&!count){
      // Incoming rows arrive one at a time after a lock and cannot erase occupied cells.
      if(board[0].every(cell=>!cell)){
        board.shift();
        const gap=(garbageSequence++*7+3)%COLUMNS;
        board.push(Array.from({length:COLUMNS},(_,x)=>x===gap?null:'G'));
        incoming--;
      }
    }
    canHold=true;spawn();
  }
  function input(action,value=true){
    const down=value!==false;
    if(!down){
      pressed.delete(action);
      if(action==='left'||action==='right'){lastDirection=pressed.has('left')?-1:pressed.has('right')?1:0;repeatClock=0;repeats=false;}
      return;
    }
    if(over||pressed.has(action))return;
    pressed.add(action);
    if(action==='left'||action==='right'){
      lastDirection=action==='left'?-1:1;
      move(lastDirection,0);repeatClock=0;repeats=false;
    } else if(action==='rotate')rotate();
    else if(action==='down'){if(move(0,1))score++;}
    else if(action==='drop'){
      while(move(0,1))score+=2;
      lock();
    } else if(action==='hold'&&canHold){
      const previous=stored;
      stored=active.type;
      spawn(previous);
      canHold=false;sound('hold');
    }
  }
  function tick(dt){
    if(over)return;
    slow=Math.max(0,slow-dt);
    if(effect){effect.time-=dt;if(effect.time<=0)effect=null;}
    for(let i=particles.length-1;i>=0;i--){
      particles[i].age+=dt;
      if(particles[i].age>=.65)particles.splice(i,1);
    }
    if(lastDirection){
      repeatClock+=dt;
      const interval=repeats?.07:.19;
      if(repeatClock>=interval){repeatClock-=interval;repeats=true;move(lastDirection,0);}
    }
    const gravity=Math.max(.075,(PERFORMANCE[level]||PERFORMANCE.easy)*Math.pow(.86,Math.floor(lines/5)))*(slow>0?1.8:1);
    const interval=pressed.has('down')?Math.min(gravity,.045):gravity;
    fallClock+=dt;
    if(fallClock>=interval){
      fallClock-=interval;
      if(move(0,1)&&pressed.has('down'))score++;
    }
    if(grounded()){
      lockClock+=dt;
      if(lockClock>=.4)lock();
    }else lockClock=0;
  }
  let remainder=0;
  function step(dt){
    if(!Number.isFinite(dt)||dt<=0)return;
    // Fixed time slices keep simulation identical across refresh rates.
    remainder+=dt;
    while(remainder+1e-10>=1/60&&!over){remainder-=1/60;tick(1/60);}
  }
  function reward(questionNumber){
    const key=questionNumber===undefined?checkpoint:questionNumber;
    if(over||key<=0||rewarded===key)return;
    rewarded=key;slow=9;incoming=Math.max(0,incoming-1);attack++;
    effect={text:'إبطاء السقوط',time:1.3};sound('reward');
  }
  function renderTile(c,x,y,size,type){
    const gap=Math.max(1,size*.055),s=size-gap*2;
    c.fillStyle=COLORS[type];c.fillRect(x+gap,y+gap,s,s);
    c.fillStyle='#ffffff65';c.fillRect(x+gap,y+gap,s,Math.max(1,size*.11));
    c.fillStyle='#06132355';c.fillRect(x+gap,y+size-gap-size*.16,s,size*.16);
    c.strokeStyle='#09152b35';c.lineWidth=1;
    c.strokeRect(x+gap+size*.19,y+gap+size*.19,s-size*.38,s-size*.38);
  }
  function draw(c,w,h){
    c.save();
    const bg=c.createLinearGradient(0,0,w,h);
    bg.addColorStop(0,'#101e38');bg.addColorStop(.55,'#071322');bg.addColorStop(1,'#201530');
    c.fillStyle=bg;c.fillRect(0,0,w,h);
    const pad=Math.max(6,Math.min(w,h)*.035);
    const narrow=w/h<.85;
    const sidebar=narrow?0:Math.max(68,Math.min(130,w*.23));
    const header=narrow?Math.min(62,h*.12):0;
    const cell=Math.min((w-sidebar-3*pad)/COLUMNS,(h-header-2*pad)/20);
    const bw=COLUMNS*cell,bh=20*cell;
    const left=(w-sidebar-bw)/2,top=header+(h-header-bh)/2;
    c.fillStyle='#081222';c.fillRect(left,top,bw,bh);
    c.strokeStyle='#273951';c.lineWidth=.6;c.beginPath();
    for(let col=1;col<COLUMNS;col++){c.moveTo(left+col*cell,top);c.lineTo(left+col*cell,top+bh);}
    for(let row=1;row<20;row++){c.moveTo(left,top+row*cell);c.lineTo(left+bw,top+row*cell);}
    c.stroke();
    c.save();c.beginPath();c.rect(left,top,bw,bh);c.clip();
    const tile=(x,y,t)=>renderTile(c,left+x*cell,top+(y-HIDDEN)*cell,cell,t);
    for(let y=HIDDEN;y<ROWS;y++)board[y].forEach((type,x)=>{if(type)tile(x,y,type);});
    if(!over){
      let ghost=active.y;
      while(fits(active.x,ghost+1,active.rotation))ghost++;
      const points=ROTATIONS[active.type][active.rotation];
      c.strokeStyle=COLORS[active.type];c.lineWidth=1;c.setLineDash([3,3]);
      for(const [x,y] of points)c.strokeRect(left+(active.x+x)*cell+2,top+(ghost+y-HIDDEN)*cell+2,cell-4,cell-4);
      c.setLineDash([]);
      for(const [x,y] of points)tile(active.x+x,active.y+y,active.type);
    }
    for(const p of particles){
      c.globalAlpha=Math.max(0,1-p.age/.65);c.fillStyle=p.color;
      c.fillRect(left+(p.x+p.vx*p.age)*cell,top+(p.y+p.vy*p.age+5*p.age*p.age)*cell,cell*.14,cell*.14);
    }
    c.globalAlpha=1;c.restore();
    c.strokeStyle=slow>0?'#82f3c4':'#64839d';c.lineWidth=2;c.strokeRect(left-1,top-1,bw+2,bh+2);
    const railX=left+bw+pad+sidebar*.43,railTop=top+pad;
    const font=s=>'600 '+Math.max(10,s)+'px system-ui, sans-serif';
    function label(text,x,y,size){c.font=font(size);c.fillStyle='#e4edfc';c.textAlign='center';c.fillText(text,x,y);}
    function miniature(type,x,y,s){
      if(!type){label('—',x,y+s,s);return;}
      const points=ROTATIONS[type][0],maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1]));
      for(const [cx,cy] of points)renderTile(c,x+(cx-(maxX+1)/2)*s,y+(cy-minY)*s,s,type);
    }
    if(narrow){
      const s=Math.min(header*.29,w*.045);
      label('احتفاظ',w*.22,pad+7,12);miniature(stored,w*.22,pad+12,s);
      label('التالية',w*.73,pad+7,12);miniature(upcoming[0],w*.73,pad+12,s);
    }else{
      const s=Math.min(cell*.8,sidebar*.165);
      label('التالية',railX,railTop+12,14);
      upcoming.slice(0,3).forEach((type,i)=>miniature(type,railX,railTop+25+i*s*3.1,s));
      const hy=railTop+48+s*9;
      label('احتفاظ',railX,hy,14);miniature(stored,railX,hy+12,s);
      label('الصفوف',railX,hy+3*s+30,13);label(String(lines),railX,hy+3*s+57,22);
    }
    if(effect){
      c.fillStyle='#101f35ee';c.fillRect(left,top+bh*.39,bw,32);
      label(effect.text,left+bw/2,top+bh*.39+22,15);
    }
    c.restore();
  }
  refill();spawn();
  return {
    controls:ACTIONS,step,input,draw,reward,
    get score(){return score;},get over(){return over;},get checkpoint(){return checkpoint;},
    get lines(){return lines;},
    get stats(){return {lines,locks,bestCombo};},
    takeAttack(){const pending=attack;attack=0;return pending;},
    addChallenge(rows){if(Number.isInteger(rows)&&rows>0)incoming=Math.min(3,incoming+rows);},
    getState(){return {board:board.map(r=>r.slice()),active:{...active},next:upcoming.slice(0,3),hold:stored,canHold,lines,locks,combo,slow,incoming};}
  };
}
