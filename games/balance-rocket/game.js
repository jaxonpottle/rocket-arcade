// Balance the Rocket — arcade-y attitude control
// No deps. Works on GitHub Pages.

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText  = document.getElementById('overlayText');

const startBtn = document.getElementById('startBtn');
const shareBtn = document.getElementById('shareBtn');
const resetBtn = document.getElementById('resetBtn');

const bestEl = document.getElementById('best');
const lastEl = document.getElementById('last');
const bestScoreEl = document.getElementById('bestScore');
const lastScoreEl = document.getElementById('lastScore');

const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');

const soundToggle = document.getElementById('soundToggle');
const easyToggle  = document.getElementById('easyToggle');

let W = 0, H = 0, DPR = 1;

function resize(){
  const rect = canvas.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = Math.max(320, Math.floor(rect.width));
  H = Math.max(200, Math.floor(rect.height));
  canvas.width  = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  makeStars();
}
window.addEventListener('resize', resize);

const STORAGE_KEY = 'rocketArcade.balance.best.v2';
const STORAGE_SCORE_KEY = 'rocketArcade.balance.bestScore.v2';

let bestTime = parseFloat(localStorage.getItem(STORAGE_KEY) || '0') || 0;
let bestScore = parseInt(localStorage.getItem(STORAGE_SCORE_KEY) || '0', 10) || 0;

function fmt1(x){ return `${x.toFixed(1)}s`; }
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
function lerp(a,b,t){ return a + (b-a)*t; }
function now(){ return performance.now(); }

bestEl.textContent = bestTime ? fmt1(bestTime) : '0.0s';
bestScoreEl.textContent = String(bestScore);

const state = {
  running:false,
  t:0,
  score:0,
  checksDone:0,
  checksPassed:0,

  wind:0,

  // dynamics
  x:0,
  vx:0,
  ang:0,    // radians, 0 = upright
  w:0,      // ang vel

  // fuel
  fuel:1, // 0..1

  // check window
  checkActive:false,
  checkT:0,
  checkHold:0,

  // inputs
  left:false,
  right:false,

  // particles
  parts:[],

  // background
  stars:[],
  neb:[],
};

const TUNE = {
  maxAng: 0.62,       // ~35deg
  maxX: 0.42,         // fraction of width
  baseWind: 0.35,
  windRamp: 0.08,     // per second
  windGust: 0.65,
  windFreq: 0.12,

  torque: 2.4,
  dampAng: 1.15,
  dampX: 0.55,

  fuelBurn: 0.16,     // per sec at full thrust
  fuelRegen: 0.08,    // per sec when coasting
  fuelBonus: 0.20,

  checkEvery: 10.0,
  checkLen: 2.2,
  checkTightAng: 0.20,
  checkTightX: 0.12,

  scoreTime: 8,       // points per sec
  scoreCheck: 220,
  scoreClean: 35,     // bonus for very stable
};

function isEasy(){
  return !!easyToggle?.checked;
}

function showOverlay(kind){
  overlay.style.display = 'flex';
  if (kind === 'start'){
    overlayTitle.textContent = 'Balance the Rocket';
    overlayText.textContent = 'Survive the wind — and rack up score by completing stability checks. Small early taps beat big swings.';
    startBtn.textContent = 'Start';
  } else if (kind === 'gameover'){
    overlayTitle.textContent = 'Crashed 😵';
    overlayText.textContent = 'Try smaller, earlier taps. Don’t chase the wobble — damp it.';
    startBtn.textContent = 'Try again';
  } else if (kind === 'pause'){
    overlayTitle.textContent = 'Paused';
    overlayText.textContent = 'Press Start to resume.';
    startBtn.textContent = 'Resume';
  }
}

function hideOverlay(){
  overlay.style.display = 'none';
}

function resetRun(hard=false){
  state.running = false;
  state.t = 0;
  state.score = 0;
  state.checksDone = 0;
  state.checksPassed = 0;
  state.x = 0;
  state.vx = 0;
  state.ang = 0;
  state.w = 0;
  state.fuel = 1;
  state.checkActive = false;
  state.checkT = 0;
  state.checkHold = 0;
  state.parts.length = 0;
  state.left = false;
  state.right = false;

  if (hard){
    bestTime = 0;
    bestScore = 0;
    localStorage.setItem(STORAGE_KEY, '0');
    localStorage.setItem(STORAGE_SCORE_KEY, '0');
    bestEl.textContent = '0.0s';
    bestScoreEl.textContent = '0';
  }
}

function crash(){
  state.running = false;
  lastEl.textContent = fmt1(state.t);
  lastScoreEl.textContent = String(Math.floor(state.score));
  if (state.t > bestTime){
    bestTime = state.t;
    localStorage.setItem(STORAGE_KEY, String(bestTime));
    bestEl.textContent = fmt1(bestTime);
  }
  const sc = Math.floor(state.score);
  if (sc > bestScore){
    bestScore = sc;
    localStorage.setItem(STORAGE_SCORE_KEY, String(bestScore));
    bestScoreEl.textContent = String(bestScore);
  }
  audioCrash();
  showOverlay('gameover');
}

function startGame(){
  ensureAudio();
  resetRun(false);
  state.running = true;
  hideOverlay();
  lastFrame = now();
  requestAnimationFrame(frame);
}

startBtn.addEventListener('click', () => {
  if (!state.running){
    startGame();
  } else {
    // running -> pause
    state.running = false;
    showOverlay('pause');
  }
});

resetBtn.addEventListener('click', () => {
  resetRun(true);
  showOverlay('start');
});

shareBtn.addEventListener('click', async () => {
  const url = location.href;
  const text = `🚀 Balance the Rocket\nBest: ${bestEl.textContent}\nBest score: ${bestScoreEl.textContent}\n${url}`;
  try{
    if (navigator.share){
      await navigator.share({ title:'Balance the Rocket', text, url });
    } else {
      await navigator.clipboard.writeText(text);
      shareBtn.textContent = 'Copied!';
      setTimeout(()=> shareBtn.textContent='Share', 900);
    }
  } catch {}
});

function setInput(side, on){
  if (side === 'L') state.left = on;
  if (side === 'R') state.right = on;
  if (on) ensureAudio();
}

function bindHold(btn, side){
  if (!btn) return;
  const down = (e)=>{ e.preventDefault(); setInput(side,true); };
  const up   = (e)=>{ e.preventDefault(); setInput(side,false); };

  btn.addEventListener('pointerdown', down);
  window.addEventListener('pointerup', up);
  btn.addEventListener('pointerleave', up);
}
bindHold(leftBtn,'L');
bindHold(rightBtn,'R');

window.addEventListener('keydown', (e)=>{
  if (e.repeat) return;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft'){ setInput('L', true); }
  if (e.code === 'KeyD' || e.code === 'ArrowRight'){ setInput('R', true); }
  if (e.code === 'Space'){
    if (!state.running) startGame();
  }
});
window.addEventListener('keyup', (e)=>{
  if (e.code === 'KeyA' || e.code === 'ArrowLeft'){ setInput('L', false); }
  if (e.code === 'KeyD' || e.code === 'ArrowRight'){ setInput('R', false); }
});

// Tap left/right half of canvas
canvas.addEventListener('pointerdown', (e)=>{
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  setInput(x < rect.width/2 ? 'L' : 'R', true);
});
canvas.addEventListener('pointerup', ()=>{ setInput('L', false); setInput('R', false); });

// -------------------- Background --------------------

function mulberry32(seed){
  let t = seed >>> 0;
  return function(){
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeStars(){
  const rnd = mulberry32(1337 + W*7 + H*13);
  state.stars.length = 0;
  const n = Math.floor((W*H) / 5200);
  for (let i=0;i<n;i++){
    state.stars.push({
      x: rnd()*W,
      y: rnd()*H,
      z: 0.2 + rnd()*0.8,
      tw: rnd()*Math.PI*2,
      s: 0.6 + rnd()*1.8,
    });
  }
  // nebulas: a few big soft gradients
  state.neb.length = 0;
  const colors = ['rgba(96,165,250,.10)','rgba(52,211,153,.10)','rgba(251,113,133,.10)','rgba(168,85,247,.08)'];
  for (let i=0;i<4;i++){
    state.neb.push({
      x: rnd()*W,
      y: rnd()*H,
      r: (0.45 + rnd()*0.85)*Math.min(W,H),
      c: colors[i%colors.length],
      dx: (rnd()-0.5)*6,
      dy: (rnd()-0.5)*6,
    });
  }
}

function drawGalaxy(t){
  // base gradient
  const g = ctx.createLinearGradient(0,0,W,H);
  g.addColorStop(0, '#070a10');
  g.addColorStop(0.45, '#0b1020');
  g.addColorStop(1, '#070a12');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,H);

  // drifting nebulas (slow)
  for (const n of state.neb){
    const x = (n.x + n.dx * (t*0.02)) % (W + n.r*0.2) - n.r*0.1;
    const y = (n.y + n.dy * (t*0.02)) % (H + n.r*0.2) - n.r*0.1;
    const gr = ctx.createRadialGradient(x,y, 0, x,y, n.r);
    gr.addColorStop(0, n.c);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0,0,W,H);
  }

  // stars with subtle parallax based on x/angle
  const px = state.x * 0.18;
  const py = state.ang * 18;
  for (const s of state.stars){
    const tw = 0.6 + 0.4*Math.sin(s.tw + t*0.9);
    const x = (s.x + px * s.z + (t*12*s.z)) % W;
    const y = (s.y + py * s.z + (t*3*s.z)) % H;

    const a = 0.55*tw;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(x, y, s.s, s.s);
  }
}

// -------------------- Audio --------------------

let audio = null;

function ensureAudio(){
  if (!soundToggle?.checked) return;
  if (audio && audio.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;

  const actx = new AC();
  const master = actx.createGain();
  master.gain.value = 0.6;
  master.connect(actx.destination);

  // looped noise buffer
  const dur = 2.0;
  const buf = actx.createBuffer(1, Math.floor(actx.sampleRate*dur), actx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i=0;i<data.length;i++){
    data[i] = (Math.random()*2-1) * 0.6;
  }
  const src = actx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  // two filtered, panned branches
  function branch(panVal){
    const bp = actx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 260;
    bp.Q.value = 0.8;

    const hp = actx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 70;

    const pan = actx.createStereoPanner();
    pan.pan.value = panVal;

    const g = actx.createGain();
    g.gain.value = 0.0;

    src.connect(hp);
    hp.connect(bp);
    bp.connect(pan);
    pan.connect(g);
    g.connect(master);

    return {hp,bp,pan,g};
  }

  const L = branch(-0.35);
  const R = branch(0.35);

  src.start();

  audio = { ctx: actx, master, src, L, R, lastPop: 0 };
}

function audioSetThrusters(strL, strR){
  if (!audio || !soundToggle?.checked) return;
  const t = audio.ctx.currentTime;
  const l = clamp(strL, 0, 1);
  const r = clamp(strR, 0, 1);

  audio.L.g.gain.setTargetAtTime(0.12*l, t, 0.03);
  audio.R.g.gain.setTargetAtTime(0.12*r, t, 0.03);

  // brighten with strength
  audio.L.bp.frequency.setTargetAtTime(220 + 520*l, t, 0.04);
  audio.R.bp.frequency.setTargetAtTime(220 + 520*r, t, 0.04);

  // little pop on press
  const pop = (l>0.05 || r>0.05);
  if (pop && (t - audio.lastPop) > 0.08){
    audio.lastPop = t;
    const o = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(120 + 140*(l+r), t);
    o.frequency.exponentialRampToValueAtTime(55, t+0.07);
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.09, t+0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t+0.08);
    o.connect(g); g.connect(audio.master);
    o.start(t); o.stop(t+0.09);
  }
}

function audioCrash(){
  if (!audio || !soundToggle?.checked) return;
  const t = audio.ctx.currentTime;
  const o = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(60, t+0.25);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t+0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t+0.26);
  o.connect(g); g.connect(audio.master);
  o.start(t); o.stop(t+0.28);
}

function audioSuccess(){
  if (!audio || !soundToggle?.checked) return;
  const t = audio.ctx.currentTime;
  const o = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(520, t);
  o.frequency.exponentialRampToValueAtTime(880, t+0.10);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.14, t+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t+0.18);
  o.connect(g); g.connect(audio.master);
  o.start(t); o.stop(t+0.2);
}

// -------------------- Particles --------------------

function spawnThruster(side, rocketX, rocketY, ang, strength){
  const count = Math.floor(6 + 14*strength);
  const base = 120 + 190*strength;
  for (let i=0;i<count;i++){
    const a = ang + Math.PI/2 + side*0.18 + (Math.random()-0.5)*0.35;
    const sp = base + Math.random()*70;
    state.parts.push({
      x: rocketX + side*12 + (Math.random()-0.5)*6,
      y: rocketY + 30 + (Math.random()-0.5)*4,
      vx: Math.cos(a)*sp,
      vy: Math.sin(a)*sp,
      life: 0.20 + Math.random()*0.25,
      r: 1.5 + Math.random()*2.8
    });
  }
}

function stepParticles(dt){
  for (let i=state.parts.length-1;i>=0;i--){
    const p = state.parts[i];
    p.life -= dt;
    p.x += p.vx*dt;
    p.y += p.vy*dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
    if (p.life <= 0) state.parts.splice(i,1);
  }
}

// -------------------- Game Loop --------------------

let lastFrame = now();

function update(dt){
  state.t += dt;

  // wind: mean ~0 with gust + slow drift (ramps over time)
  const amp  = TUNE.baseWind + TUNE.windRamp*state.t;
  const gust = Math.sin(state.t*TUNE.windFreq*2*Math.PI) * TUNE.windGust;
  const noise = (Math.sin(state.t*1.7) + Math.sin(state.t*0.91 + 2.1))*0.30;
  const drift = 0.35*Math.sin(state.t*0.23 + 1.1) + 0.25*Math.sin(state.t*0.07 + 2.7);
  let wind = amp * Math.tanh(gust + noise + drift);

  if (isEasy()){
    wind *= 0.75;
  }
  state.wind = wind;

  // stability check scheduling
  if (!state.checkActive){
    const nextT = (state.checksDone+1) * TUNE.checkEvery;
    if (state.t >= nextT){
      state.checkActive = true;
      state.checkT = 0;
      state.checkHold = 0;
    }
  } else {
    state.checkT += dt;
    const okA = Math.abs(state.ang) < TUNE.checkTightAng;
    const okX = Math.abs(state.x) < TUNE.checkTightX * W;
    if (okA && okX){
      state.checkHold += dt;
    } else {
      state.checkHold = Math.max(0, state.checkHold - dt*0.8);
    }

    if (state.checkT >= TUNE.checkLen){
      state.checksDone += 1;
      if (state.checkHold >= 1.2){
        state.checksPassed += 1;
        state.score += TUNE.scoreCheck;
        state.fuel = clamp(state.fuel + TUNE.fuelBonus, 0, 1);
        audioSuccess();
      } else {
        // small penalty to make it feel like an event
        state.score = Math.max(0, state.score - 80);
      }
      state.checkActive = false;
      state.checkT = 0;
      state.checkHold = 0;
    }
  }

  // inputs -> torque and particles
  let thrL = state.left ? 1 : 0;
  let thrR = state.right ? 1 : 0;

  // fuel limits thrust
  const burn = (thrL + thrR) * TUNE.fuelBurn * dt;
  state.fuel = clamp(state.fuel - burn, 0, 1);

  if (state.fuel <= 0.001){
    thrL = 0; thrR = 0;
    state.left = false; state.right = false;
  }

  // regen when coasting
  if (thrL + thrR === 0){
    state.fuel = clamp(state.fuel + TUNE.fuelRegen*dt, 0, 1);
  }

  // apply dynamics (simple)
  // wind pushes angle + lateral position
  const torqueWind = wind * 1.25;
  const forceWind = wind * 260;

  const torqueCtrl = (thrR - thrL) * TUNE.torque * (isEasy()?0.9:1.0);
  const forceCtrl  = (thrR - thrL) * 95;

  state.w += (torqueWind + torqueCtrl) * dt;
  state.w *= Math.exp(-TUNE.dampAng*dt);

  state.ang += state.w * dt;

  state.vx += (forceWind + forceCtrl) * dt;
  state.vx *= Math.exp(-TUNE.dampX*dt);
  state.x += state.vx * dt;

  // scoring
  state.score += TUNE.scoreTime * dt;
  if (Math.abs(state.ang) < 0.09 && Math.abs(state.x) < 0.05*W){
    state.score += TUNE.scoreClean * dt;
  }

  // particles + audio
  const rocketX = W/2 + state.x;
  const rocketY = H/2 + 34;

  if (thrL) spawnThruster(-1, rocketX, rocketY, state.ang, 0.85);
  if (thrR) spawnThruster(+1, rocketX, rocketY, state.ang, 0.85);

  audioSetThrusters(thrL, thrR);

  stepParticles(dt);

  // crash conditions
  const maxAng = (isEasy()?0.72: TUNE.maxAng);
  const maxX = (isEasy()?0.52: TUNE.maxX) * W;

  if (Math.abs(state.ang) > maxAng || Math.abs(state.x) > maxX){
    crash();
  }
}

function roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}

function drawHUD(){
  // top-left HUD
  ctx.save();
  ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillText(`time ${state.t.toFixed(1)}s    score ${Math.floor(state.score)}    checks ${state.checksPassed}/${state.checksDone}`, 16, 22);

  // wind indicator
  const ampNow = TUNE.baseWind + TUNE.windRamp*state.t;
  const windPct = Math.round(clamp(state.wind / (ampNow || 1e-6), -1, 1) * 100);
  ctx.fillStyle = 'rgba(255,255,255,.60)';
  ctx.fillText(`wind ${windPct}%`, 16, 42);

  // fuel bar
  const x = 16, y = 54, w = 220, h = 10;
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  roundRect(ctx, x, y, w, h, 6); ctx.fill();
  ctx.fillStyle = 'rgba(52,211,153,.55)';
  roundRect(ctx, x, y, w*state.fuel, h, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.fillText('fuel', x+w+10, y+9);

  // stability check banner
  if (state.checkActive){
    const p = clamp(state.checkT / TUNE.checkLen, 0, 1);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    roundRect(ctx, W/2 - 110, 70, 220, 28, 12); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.textAlign = 'center';
    ctx.fillText('STABILITY CHECK', W/2, 89);
    ctx.textAlign = 'left';
    // progress bar under
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    roundRect(ctx, W/2-80, 98, 160, 6, 4); ctx.fill();
    ctx.fillStyle = 'rgba(96,165,250,.65)';
    roundRect(ctx, W/2-80, 98, 160*p, 6, 4); ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawRocket(rocketX, rocketY){
  const ang = state.ang;
  const thrL = state.left && state.fuel > 0.01;
  const thrR = state.right && state.fuel > 0.01;

  ctx.save();
  ctx.translate(rocketX, rocketY);
  ctx.rotate(ang);

  // shadow
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(4, 48, 18, 6, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // body gradient
  const bodyG = ctx.createLinearGradient(-16, -50, 16, 50);
  bodyG.addColorStop(0, 'rgba(255,255,255,.92)');
  bodyG.addColorStop(0.55, 'rgba(215,225,240,.92)');
  bodyG.addColorStop(1, 'rgba(255,255,255,.84)');

  // main capsule
  ctx.fillStyle = bodyG;
  roundRect(ctx, -16, -52, 32, 92, 14); ctx.fill();

  // nose cone (smooth)
  ctx.fillStyle = 'rgba(255,255,255,.94)';
  ctx.beginPath();
  ctx.moveTo(-14, -52);
  ctx.quadraticCurveTo(0, -78, 14, -52);
  ctx.closePath();
  ctx.fill();

  // subtle tip highlight
  ctx.strokeStyle = 'rgba(255,255,255,.20)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -74);
  ctx.lineTo(0, -62);
  ctx.stroke();

  // small highlight strip
  ctx.fillStyle = 'rgba(96,165,250,.18)';
  roundRect(ctx, -10, -38, 7, 56, 6); ctx.fill();

  // window
  ctx.fillStyle = 'rgba(59,130,246,.35)';
  ctx.beginPath();
  ctx.arc(0, -14, 8.2, 0, Math.PI*2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // fins
  ctx.fillStyle = 'rgba(251,113,133,.85)';
  ctx.beginPath(); // left fin
  ctx.moveTo(-16, 22);
  ctx.lineTo(-30, 34);
  ctx.lineTo(-16, 38);
  ctx.closePath(); ctx.fill();

  ctx.beginPath(); // right fin
  ctx.moveTo(16, 22);
  ctx.lineTo(30, 34);
  ctx.lineTo(16, 38);
  ctx.closePath(); ctx.fill();

  // engine block
  ctx.fillStyle = 'rgba(148,163,184,.85)';
  roundRect(ctx, -12, 34, 24, 10, 6); ctx.fill();

  // nozzles
  ctx.fillStyle = 'rgba(15,23,42,.75)';
  roundRect(ctx, -16, 40, 10, 10, 5); ctx.fill();
  roundRect(ctx, 6, 40, 10, 10, 5); ctx.fill();

  // flames (per thruster)
  function flame(x){
    const f = ctx.createRadialGradient(x, 55, 0, x, 55, 18);
    f.addColorStop(0,'rgba(255,255,255,.95)');
    f.addColorStop(0.35,'rgba(96,165,250,.70)');
    f.addColorStop(1,'rgba(96,165,250,0)');
    ctx.fillStyle = f;
    ctx.beginPath();
    ctx.moveTo(x-6, 46);
    ctx.quadraticCurveTo(x, 68, x+6, 46);
    ctx.closePath();
    ctx.fill();
  }
  if (thrL) flame(-11);
  if (thrR) flame(11);

  ctx.restore();
}

function draw(){
  drawGalaxy(state.t);

  // faint guide rails
  ctx.strokeStyle = 'rgba(96,165,250,.10)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W*0.33, 0); ctx.lineTo(W*0.33, H);
  ctx.moveTo(W*0.66, 0); ctx.lineTo(W*0.66, H);
  ctx.stroke();

  drawHUD();

  // particles (in screen space)
  ctx.globalCompositeOperation = 'lighter';
  for (const p of state.parts){
    const a = clamp(p.life / 0.45, 0, 1);
    ctx.globalAlpha = 0.85*a;
    ctx.fillStyle = 'rgba(96,165,250,.65)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // rocket
  const rocketX = W/2 + state.x;
  const rocketY = H/2 + 34;
  drawRocket(rocketX, rocketY);

  // safe bounds overlay (only when checking)
  if (state.checkActive){
    ctx.save();
    ctx.strokeStyle = 'rgba(52,211,153,.18)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8,6]);
    const bx = W/2 - TUNE.checkTightX*W;
    const bw = 2*TUNE.checkTightX*W;
    ctx.strokeRect(bx, 0, bw, H);
    ctx.restore();
  }
}

function frame(){
  const t = now();
  const dt = clamp((t - lastFrame)/1000, 0, 0.033);
  lastFrame = t;

  if (state.running){
    update(dt);
    draw();
    if (state.running) requestAnimationFrame(frame);
  } else {
    draw(); // keep background alive behind overlay
  }
}

// init
resize();
resetRun(false);
showOverlay('start');
draw();

// stop sound cleanly if user toggles off
soundToggle?.addEventListener('change', ()=>{
  if (!soundToggle.checked){
    if (audio?.master){
      try{ audio.master.gain.value = 0; }catch{}
    }
  } else {
    ensureAudio();
  }
});