// Original four-lane rhythm game. All notes use elapsed game time, including long notes.
const lanes = [
  { key: 'KeyD', label: 'D', color: '#74f3d4' },
  { key: 'KeyF', label: 'F', color: '#9baeff' },
  { key: 'KeyJ', label: 'J', color: '#ffb3d7' },
  { key: 'KeyK', label: 'K', color: '#ffe187' }
];
const speeds = {
  easy: { beat: .72, travel: 1.85, hits: 8, grace: .18, lives: 5 },
  medium: { beat: .54, travel: 1.6, hits: 12, grace: .145, lives: 4 },
  hard: { beat: .43, travel: 1.4, hits: 16, grace: .12, lives: 3 }
};
const perfectWindow = .065;
const controls = lanes.map((lane, i) => ({ action: 'lane' + i, label: lane.label, key: lane.key }));

export function createGame({ rng = Math.random, level = 'medium', sound = () => {} } = {}) {
  const rules = speeds[level] || speeds.medium;
  const pressed = [false, false, false, false];
  const flashes = [0, 0, 0, 0];
  const counts = { perfect: 0, good: 0, miss: 0 };
  let notes = [], time = 0, segment = 0, points = 0, lives = rules.lives;
  let combo = 0, bestCombo = 0, shield = false, checkpoint = 0, waiting = false;
  let strayBeat = -1;
  let feedback = '', feedbackTime = 0, rewarded = 0;

  function prepare() {
    const beat = Math.max(.29, rules.beat * Math.pow(.965, segment));
    const count = Math.min(24, rules.hits + segment);
    const availableAt = [0, 0, 0, 0];
    let previous = -1;
    notes = [];
    for (let i = 0; i < count; i++) {
      const at = rules.travel + i * beat;
      const free = [0, 1, 2, 3].filter(lane => availableAt[lane] <= at && lane !== previous);
      const takeLane = () => free.splice(Math.floor(rng() * free.length), 1)[0];
      const lane = takeLane();
      const hold = (i + 1) % 5 === 0 ? beat * 1.45 : 0;
      notes.push({ lane, at, hold, state: 'incoming' });
      availableAt[lane] = at + hold + rules.grace;
      previous = lane;
      if ((level === 'hard' || segment >= (level === 'medium' ? 1 : 3)) && i % 6 === 3 && free.length) {
        const second = takeLane();
        notes.push({ lane: second, at, hold: 0, state: 'incoming' });
        availableAt[second] = at + rules.grace;
      }
    }
    time = 0;
    strayBeat = -1;
    waiting = false;
  }

  function mistake(message) {
    counts.miss++;
    combo = 0;
    feedback = shield ? 'حماية' : message;
    feedbackTime = .5;
    if (shield) shield = false;
    else lives = Math.max(0, lives - 1);
    sound('miss');
  }

  function mark(note, grade) {
    note.state = 'done';
    if (grade === 'miss') { mistake('فاتتك البلاطة'); return; }
    counts[grade]++;
    feedbackTime = .5;
    combo++;
    bestCombo = Math.max(bestCombo, combo);
    points += (grade === 'perfect' ? 100 : 65) * (1 + Math.min(3, Math.floor((combo - 1) / 8))) + (note.hold ? 35 : 0);
    feedback = grade === 'perfect' ? 'ممتاز' : 'جيّد';
    flashes[note.lane] = .23;
  }

  function endSegment() {
    if (lives > 0 && !waiting && notes.every(note => note.state === 'done')) {
      segment++;
      checkpoint++;
      waiting = true;
      sound('checkpoint');
    }
  }

  function step(dt) {
    if (!lives || !Number.isFinite(dt) || dt <= 0) return;
    if (waiting) prepare();
    time += dt;
    feedbackTime = Math.max(0, feedbackTime - dt);
    for (let i = 0; i < 4; i++) flashes[i] = Math.max(0, flashes[i] - dt);
    for (const note of notes) {
      if (!lives) break;
      if (note.state === 'incoming' && time > note.at + rules.grace) mark(note, 'miss');
      if (note.state === 'held' && time >= note.at + note.hold) mark(note, note.grade);
    }
    endSegment();
  }

  function input(action, value) {
    const index = controls.findIndex(control => control.action === action);
    if (index < 0 || pressed[index] === Boolean(value)) return;
    pressed[index] = Boolean(value);
    if (!lives || waiting) return;
    if (!value) {
      const hold = notes.find(note => note.lane === index && note.state === 'held');
      if (hold) mark(hold, time >= hold.at + hold.hold - rules.grace / 2 ? hold.grade : 'miss');
    } else {
      const note = notes.find(n => n.lane === index && n.state === 'incoming' && Math.abs(time - n.at) <= rules.grace);
      if (!note) {
        const beat = notes.find(n => Math.abs(time - n.at) <= rules.grace);
        if (beat && beat.at !== strayBeat && !notes.some(n => n.at === beat.at && n.lane === index)) {
          strayBeat = beat.at;
          mistake('مسار آخر');
        }
        return;
      }
      const grade = Math.abs(time - note.at) <= perfectWindow ? 'perfect' : 'good';
      flashes[index] = .23;
      sound('tile' + index);
      if (note.hold) { note.state = 'held'; note.grade = grade; }
      else mark(note, grade);
    }
    endSegment();
  }

  function reward() {
    if (!lives || checkpoint === 0 || rewarded >= checkpoint) return;
    rewarded = checkpoint;
    if (lives < rules.lives) lives++;
    else shield = true;
    sound('reward');
  }

  function draw(ctx, w, h) {
    if (!w || !h) return;
    ctx.save();
    const laneW = w / 4, horizon = h * .12, target = h * .83;
    const speed = (target - horizon) / rules.travel;
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#14182f'); bg.addColorStop(.6, '#1e1939'); bg.addColorStop(1, '#131727');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Four continuous touch lanes use the same geometry as the host pointer mapping.
    for (let i = 0; i < 4; i++) {
      const x = i * laneW;
      ctx.fillStyle = i % 2 ? '#ffffff06' : '#00000013';
      ctx.fillRect(x, horizon, laneW, h - horizon);
      ctx.fillStyle = '#ffffff25';
      ctx.fillRect(x, horizon, 1, h - horizon);
      if (flashes[i] || pressed[i]) {
        const glow = ctx.createLinearGradient(0, target - h * .2, 0, h);
        glow.addColorStop(0, lanes[i].color + '00'); glow.addColorStop(1, lanes[i].color + '50');
        ctx.fillStyle = glow; ctx.fillRect(x, target - h * .2, laneW, h * .4);
      }
    }
    const pitch = (target - horizon) / 5;
    ctx.fillStyle = '#ffffff14';
    for (let y = horizon + (time * speed % pitch); y < target; y += pitch) ctx.fillRect(0, y, w, 1);
    ctx.fillStyle = '#172237';
    ctx.fillRect(0, target, w, h - target);
    ctx.font = 'bold ' + Math.max(13, Math.min(24, laneW * .27)) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = lanes[i].color;
      ctx.fillRect(i * laneW + 2, target - 2, laneW - 4, 4);
      ctx.fillStyle = pressed[i] ? '#ffffff' : lanes[i].color;
      ctx.fillText(lanes[i].label, (i + .5) * laneW, target + (h - target) / 2);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(0, horizon, w, h - horizon); ctx.clip();
    for (const n of notes) {
      if (n.state === 'done') continue;
      const y = n.state === 'held' ? target : target - (n.at - time) * speed;
      const tail = target - (n.at + n.hold - time) * speed;
      if (y < horizon - 10 || tail > h) continue;
      const x = (n.lane + .1) * laneW, size = laneW * .8, height = Math.min(h * .052, 28);
      ctx.fillStyle = lanes[n.lane].color;
      if (n.hold) {
        ctx.globalAlpha = .46;
        ctx.fillRect(x + size * .3, tail, size * .4, Math.max(0, y - tail));
        ctx.globalAlpha = 1;
        ctx.fillRect(x + size * .25, tail, size * .5, 3);
      }
      ctx.beginPath();
      ctx.roundRect(x, y - height / 2, size, height, Math.min(7, height / 3));
      ctx.fill();
      ctx.fillStyle = '#172034';
      ctx.fillRect(x + size * .34, y - 1, size * .32, 2);
      if (n.hold) ctx.fillRect(x + size * .34, y + 3, size * .32, 2);
    }
    ctx.restore();
    ctx.fillStyle = '#171a33';ctx.fillRect(0, 0, w, horizon);
    ctx.fillStyle = '#eef1ff';
    ctx.font = 'bold ' + Math.min(17, Math.max(12, w / 27)) + 'px sans-serif';
    ctx.fillText('المقطع ' + (waiting ? segment : segment + 1), w * .8, horizon * .5);
    ctx.fillText('♥ ' + lives + (shield ? ' ◈' : ''), w * .18, horizon * .5);
    ctx.fillStyle = '#a6ffe2';
    ctx.fillText(combo > 1 ? '× ' + combo : '', w / 2, horizon * .5);
    if (feedbackTime > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(feedback, w / 2, target - h * .1);
    }
    ctx.restore();
  }

  prepare();
  return {
    controls, step, input, draw, reward,
    get score() { return points; },
    get over() { return lives <= 0; },
    get checkpoint() { return checkpoint; },
    get stats() { return { ...counts, bestCombo, combo, lives, shield }; }
  };
}
