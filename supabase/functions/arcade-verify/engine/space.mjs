// All simulation positions use the same logical arena on phones and desktops.
const WIDTH = 360;
const HEIGHT = 440;
const SHIP_Y = 399;
const TICK = 1 / 60;
const difficulties = {
  easy: {speed: 16, interval: 1.9, health: 4, projectile: 88},
  medium: {speed: 23, interval: 1.45, health: 3, projectile: 108},
  hard: {speed: 31, interval: 1.05, health: 3, projectile: 124}
};

export const controls = [
  {action: 'left', label: 'يسار', key: 'ArrowLeft'},
  {action: 'fire', label: 'إطلاق', key: 'Space'},
  {action: 'right', label: 'يمين', key: 'ArrowRight'}
];
const palette = ['#66f7ef', '#ac9eff', '#ffba77'];
const shipColors = ['#66f7ef', '#f7adfa'];

function intersects(a, b) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
}

function path(ctx, coords) {
  ctx.beginPath();
  ctx.moveTo(coords[0], coords[1]);
  for (let i = 2; i < coords.length; i += 2) ctx.lineTo(coords[i], coords[i + 1]);
  ctx.closePath();
}

function drawShip(ctx, ship, time, pilot) {
  if (!ship.lives) return;
  ctx.save();
  ctx.translate(ship.x, SHIP_Y);
  if (ship.guard > 0 || ship.safe > 0) {
    ctx.strokeStyle = shipColors[pilot];
    ctx.globalAlpha = .55;
    ctx.beginPath();
    ctx.ellipse(0, -1, 19, 22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#ffbc71';
  path(ctx, [-3, 8, 0, 13 + Math.sin(time * 27) * 2, 3, 8]); ctx.fill();
  ctx.fillStyle = '#142b51';
  ctx.strokeStyle = shipColors[pilot];
  ctx.lineWidth = 1.5;
  path(ctx, [0, -15, 5, -4, 13, 6, 13, 10, 4, 7, 0, 10, -4, 7, -13, 10, -13, 6, -5, -4]); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f0fcff';
  path(ctx, [0, -10, 2, -3, 0, 1, -2, -3]); ctx.fill();
  ctx.restore();
}

function drawDrone(ctx, enemy, time) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  const pulse = Math.sin(time * 4 + enemy.col) * 1.4;
  const boss = enemy.kind === 'boss';
  const color = boss ? '#ff9fd7' : palette[enemy.type];
  ctx.strokeStyle = color;
  ctx.lineWidth = boss ? 1.8 : 1.35;
  ctx.fillStyle = boss ? '#432644' : ['#14364a', '#292b50', '#42324a'][enemy.type];
  if (boss) {
    path(ctx, [-42, -5, -26, -14, -14, -9, 0, -17, 14, -9, 26, -14, 42, -5, 30, 10, 14, 8, 0, 16, -14, 8, -30, 10]);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fce2b2';
    for (const x of [-26, 26]) ctx.fillRect(x - 2, 5, 4, 9);
    ctx.fillStyle = '#ffd2e8';
    ctx.fillRect(-26, -25, 52 * (enemy.hp / enemy.maxHp), 2);
  } else {
    const outline = enemy.type === 0 ? [-10, -4, -4, -7, 0, -4, 4, -7, 10, -4, 7, 4 + pulse, 2, 3, 0, 7, -2, 3, -7, 4 + pulse] :
      enemy.type === 1 ? [-10, -5, -3, -2, 0, -7, 3, -2, 10, -5, 7, 5, 0, 7 + pulse, -7, 5] :
      [-11, -2, -7, -7, 7, -7, 11, -2, 7, 5, 3, 7 + pulse, -3, 7 + pulse, -7, 5];
    path(ctx, outline); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, boss ? 5 : 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function makeBarriers() {
  const blocks = [];
  for (const center of [62, 180, 298]) {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 7; x++) {
      if ((!y && (x === 0 || x === 6)) || (y === 2 && x >= 2 && x <= 4)) continue;
      blocks.push({x: center + (x - 3) * 5, y: 332 + y * 5, w: 5, h: 5, hp: 2});
    }
  }
  return blocks;
}

function makePilot(x, health) {
  return {x, y: SHIP_Y, w: 19, h: 19, health, lives: 2, guard: 0, safe: 1, cooldown: 0,
    weapon: 1, score: 0, kills: 0, shots: 0, hits: 0, input: {left:false, right:false, fire:false}};
}

export function createGame({rng = Math.random, level = 'easy', sound = () => {}, players = 1, reducedMotion = false} = {}) {
  const config = difficulties[level] || difficulties.easy;
  const pilots = players === 2 ? [makePilot(129, config.health), makePilot(231, config.health)] : [makePilot(180, config.health)];
  let wave = 0, checkpoint = 0, waveTotal = 0, over = false, direction = 1, shotClock = 0;
  let elapsed = 0, elapsedWave = 0, remainder = 0, event = 0, bossPattern = 0, slow = 0;
  let enemies = [], bolts = [], barriers = [], particles = [];

  function burst(x, y, color, size) {
    if (reducedMotion) return;
    event++;
    for (let i = 0; i < size; i++) {
      const angle = 2 * Math.PI * ((i + .25 * Math.sin(event + i)) / size);
      const v = 20 + (i * 11 + event) % 38;
      particles.push({x,y,vx:Math.cos(angle)*v,vy:Math.sin(angle)*v,life:.35 + (i % 3) * .08,color});
    }
    if (particles.length > 90) particles.splice(0, particles.length - 90);
  }

  function beginWave() {
    wave++; elapsedWave = 0; shotClock = 1; direction = 1; bossPattern = 0;
    bolts = []; barriers = makeBarriers(); enemies = [];
    if (wave % 3 === 0) {
      const hp = (18 + wave * 2) * pilots.length;
      enemies.push({x:180,y:69,w:78,h:28,kind:'boss',type:2,col:0,hp,maxHp:hp});
    } else {
      const rows = Math.min(4, 2 + Math.floor(wave / 2));
      for (let row = 0; row < rows; row++) for (let col = 0; col < 7; col++) {
        const type = (rows - row - 1 + wave - 1) % 3;
        const hp = type === 2 ? 2 : 1;
        enemies.push({x:52+col*36,y:61+row*26,w:20,h:15,kind:'drone',type,col,hp,maxHp:hp});
      }
    }
    waveTotal = enemies.length;
  }
  beginWave();

  function shoot(pilot, id) {
    const count = pilot.weapon;
    const offsets = count === 1 ? [0] : count === 2 ? [-5,5] : [-8,0,8];
    for (const offset of offsets) bolts.push({x:pilot.x+offset,y:SHIP_Y-14,w:3,h:9,vx:count===3?offset*2:0,vy:-295,owner:id});
    pilot.shots += count;
    pilot.cooldown = .25 - (count - 1) * .022;
    sound('shoot');
  }

  function shootEnemy() {
    // Only the lowest ship in each column can fire through its formation.
    const front = new Map();
    for (const e of enemies) if (!front.has(e.col) || front.get(e.col).y < e.y) front.set(e.col,e);
    const options = [...front.values()];
    if (!options.length) return;
    const e = options[Math.floor(rng() * options.length)];
    const boss = e.kind === 'boss';
    const targets = pilots.filter(p=>p.lives);
    const target = targets[bossPattern % targets.length];
    const aim = Math.max(-45, Math.min(45, (target.x - e.x) * .27));
    const spread = boss && bossPattern % 2 === 0 ? [-42,0,42] : [0];
    bossPattern++;
    for (const dx of spread) bolts.push({x:e.x,y:e.y+8,w:4,h:8,vx:boss?aim+dx:0,vy:config.projectile + Math.min(36,wave*3),owner:-1});
  }

  function hitPilot(pilot) {
    if (!pilot.lives || pilot.safe > 0 || pilot.guard > 0) return;
    burst(pilot.x,SHIP_Y,'#ffca9c',10);
    pilot.safe = 1.05;
    if (--pilot.health === 0) {
      pilot.lives--;
      if (pilot.lives) {pilot.health=config.health;pilot.safe=2;pilot.weapon=1;}
    }
    sound('hit');
    over = pilots.every(p=>!p.lives);
  }

  function advanceBolts(dt) {
    for (const bolt of bolts) {
      bolt.x += bolt.vx * dt; bolt.y += bolt.vy * dt;
      if (bolt.y < -12 || bolt.y > HEIGHT || bolt.x < -8 || bolt.x > WIDTH+8) {bolt.gone=true;continue;}
      const block = barriers.find(b=>b.hp>0 && intersects(b,bolt));
      if (block) {block.hp--;bolt.gone=true;continue;}
      if (bolt.owner < 0) {
        const p = pilots.find(p=>p.lives && intersects(p,bolt));
        if (p) {hitPilot(p);bolt.gone=true;}
      } else {
        const enemy = enemies.find(e=>e.hp>0 && intersects(e,bolt));
        if (!enemy) continue;
        const pilot = pilots[bolt.owner];
        bolt.gone=true;pilot.hits++;enemy.hp--;
        if (enemy.hp === 0) {
          pilot.kills++;
          pilot.score += enemy.kind==='boss' ? 600 : 30+10*enemy.type;
          burst(enemy.x,enemy.y,enemy.kind==='boss'?'#ffafd7':palette[enemy.type],enemy.kind==='boss'?23:8);
          sound('explode');
        } else {pilot.score+=2;burst(bolt.x,bolt.y,'#ddf6ff',3);}
      }
    }
    bolts=bolts.filter(b=>!b.gone);
    enemies=enemies.filter(e=>e.hp>0);
  }

  function tick() {
    elapsed+=TICK; elapsedWave+=TICK;
    const slowed = slow > 0 ? .65 : 1;
    slow=Math.max(0,slow-TICK);
    pilots.forEach((p,id)=>{
      if (!p.lives) return;
      p.x=Math.max(14, Math.min(WIDTH-14,p.x+(Number(p.input.right)-Number(p.input.left))*202*TICK));
      p.cooldown=Math.max(0,p.cooldown-TICK);p.safe=Math.max(0,p.safe-TICK);p.guard=Math.max(0,p.guard-TICK);
      if (p.input.fire && p.cooldown===0) shoot(p,id);
    });
    const boss = enemies[0]?.kind==='boss';
    const speed = (config.speed + Math.min(32,wave*2) + 22*(1-enemies.length/waveTotal)) * slowed;
    if (enemies.some(e=>direction>0?e.x+e.w/2+speed*TICK>=WIDTH-5:e.x-e.w/2-speed*TICK<=5)) {
      direction *= -1;
      if (!boss) for(const e of enemies)e.y+=10;
    }
    for(const e of enemies){
      e.x+=direction*speed*TICK;
      if(boss)e.y=68+Math.sin(elapsedWave*.8)*12;
    }
    if(enemies.some(e=>e.y+e.h/2>=SHIP_Y-11)){over=true;return;}
    shotClock-=TICK*slowed;
    if(shotClock<=0){
      shootEnemy();
      shotClock=Math.max(.43,config.interval-(wave-1)*.065)*(boss?.65:1)*(.86+rng()*.28);
    }
    advanceBolts(TICK);
    for(const p of particles){p.life-=TICK;p.x+=p.vx*TICK;p.y+=p.vy*TICK;}
    particles=particles.filter(p=>p.life>0);
    if(!over && !enemies.length){
      checkpoint++;
      beginWave();
      sound(wave%3===0?'boss':'level');
    }
  }

  function draw(ctx, width, height) {
    ctx.save();
    ctx.fillStyle='#090e22';ctx.fillRect(0,0,width,height);
    const scale=Math.min(width/WIDTH,height/HEIGHT);
    ctx.translate((width-WIDTH*scale)/2,(height-HEIGHT*scale)/2);ctx.scale(scale,scale);
    ctx.beginPath();ctx.rect(0,0,WIDTH,HEIGHT);ctx.clip();
    const sky=ctx.createLinearGradient(0,0,WIDTH,HEIGHT);
    sky.addColorStop(0,'#111831');sky.addColorStop(.52,'#181830');sky.addColorStop(1,'#081b2c');
    ctx.fillStyle=sky;ctx.fillRect(0,0,WIDTH,HEIGHT);
    if(!reducedMotion){
      const nebula=ctx.createRadialGradient(305,134,5,305,134,170);
      nebula.addColorStop(0,'rgba(108,66,165,.23)');nebula.addColorStop(1,'rgba(63,41,96,0)');
      ctx.fillStyle=nebula;ctx.fillRect(125,0,235,320);
    }
    for(let i=0;i<(reducedMotion?32:76);i++){
      const x=(i*97)%WIDTH,y=(i*137+(reducedMotion?0:elapsed*(3+i%6)))%HEIGHT;
      ctx.fillStyle=i%5?'#526782':'#bddbfa';ctx.fillRect(x,y,i%9===0?2:1,1);
    }
    ctx.strokeStyle='#28465c';ctx.setLineDash([3,6]);ctx.beginPath();ctx.moveTo(4,358);ctx.lineTo(WIDTH-4,358);ctx.stroke();ctx.setLineDash([]);
    for(const b of barriers)if(b.hp){ctx.fillStyle=b.hp===2?'#4cbea9':'#38796f';ctx.fillRect(b.x-2,b.y-2,4.6,4.6);}
    for(const e of enemies)drawDrone(ctx,e,reducedMotion?0:elapsed);
    pilots.forEach((p,i)=>drawShip(ctx,p,reducedMotion?0:elapsed,i));
    for(const b of bolts){
      ctx.fillStyle=b.owner<0?'#fdb4bd':shipColors[b.owner];ctx.fillRect(b.x-b.w/2,b.y-b.h/2,b.w,b.h);
    }
    for(const p of particles){ctx.globalAlpha=Math.min(1,p.life*3);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3);}
    ctx.globalAlpha=1;
    ctx.textAlign='right';ctx.direction='rtl';ctx.font='bold 12px sans-serif';ctx.fillStyle='#ecf3ff';
    ctx.fillText((wave%3===0?'القائد · ':'')+'الموجة '+wave,WIDTH-10,19);
    pilots.forEach((p,id)=>{
      const x=9+id*69;
      ctx.fillStyle='#233447';ctx.fillRect(x,10,42,5);ctx.fillStyle=shipColors[id];ctx.fillRect(x,10,42*p.health/config.health,5);
      for(let i=0;i<p.lives;i++)ctx.fillRect(x+i*7,19,4,2);
    });
    ctx.restore();
  }

  return {
    controls, draw,
    step(dt) {
      if(over||!Number.isFinite(dt)||dt<=0)return;
      remainder+=Math.min(dt,.25);
      const start=checkpoint;
      while(remainder+1e-10>=TICK&&!over&&checkpoint===start){remainder-=TICK;tick();}
      if(checkpoint!==start)remainder=0;
    },
    input(action, pressed, pilot=0) {
      const ship=pilots[pilot];
      if(over||!ship?.lives||!Object.hasOwn(ship.input,action))return;
      // A short touch may begin and end between two animation frames.
      if(action==='fire'&&pressed&&!ship.input.fire&&ship.cooldown===0)shoot(ship,pilot);
      ship.input[action]=Boolean(pressed);
    },
    reward(pilot=0) {
      if(over||!pilots[pilot]?.lives)return;
      for(const p of pilots)if(p.lives){p.health=Math.min(config.health,p.health+1);p.guard=4;p.weapon=Math.min(3,p.weapon+1);}
      slow=5;sound('power');
    },
    get score(){return pilots.reduce((sum,p)=>sum+p.score,0);},
    get over(){return over;},
    get checkpoint(){return checkpoint;},
    get state(){return {wave,checkpoint,over,boss:enemies[0]?.kind==='boss',pilots:pilots.map(({input,...p})=>({...p})),
      enemies:enemies.map(e=>({...e})),bolts:bolts.map(b=>({...b})),barriers:barriers.filter(b=>b.hp).map(b=>({...b}))};}
  };
}
