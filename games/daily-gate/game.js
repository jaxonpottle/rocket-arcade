// Daily Gate Run — one-button daily challenge (Flappy-ish, but faster + cleaner).
// No deps. Static friendly.

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha:false });

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText  = document.getElementById('overlayText');

const startBtn = document.getElementById('startBtn');
const shareBtn = document.getElementById('shareBtn');
const resetBtn = document.getElementById('resetBtn');

const bestEl = document.getElementById('best');
const lastEl = document.getElementById('last');

const soundToggle = document.getElementById('soundToggle');
const practiceToggle = document.getElementById('practiceToggle');
const dayPill = document.getElementById('dayPill');
const dayLabel = document.getElementById('dayLabel');

let W=900,H=500,DPR=Math.min(2, window.devicePixelRatio||1);

function resize(){
  const rect = canvas.getBoundingClientRect();
  W = Math.max(320, Math.floor(rect.width));
  H = Math.max(240, Math.floor(rect.height));
  canvas.width = Math.floor(W*DPR);
  canvas.height = Math.floor(H*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener('resize', resize);

// ---- RNG + Daily ----
function mulberry32(a){
  return function(){
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function ymd(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function dailySeed(){
  const s = ymd().replaceAll('-','');
  return (parseInt(s,10) ^ 0xA53C9E2B) >>> 0;
}
dayLabel.textContent = ymd();

// ---- Audio (tiny) ----
const audio = {
  ctx:null, master:null,
};
function audioInit(){
  if (audio.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  audio.ctx = new AC();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = 0.55;
  audio.master.connect(audio.ctx.destination);
}
function tone(freq, dur=0.08, gain=0.10){
  if (!soundToggle.checked) return;
  audioInit();
  const t = audio.ctx.currentTime;
  const o = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  o.type='sine'; o.frequency.value=freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  o.connect(g); g.connect(audio.master);
  o.start(t); o.stop(t+dur+0.02);
}
function noiseBurst(dur=0.06, gain=0.08){
  if (!soundToggle.checked) return;
  audioInit();
  const t = audio.ctx.currentTime;
  const b = audio.ctx.createBuffer(1, Math.floor(audio.ctx.sampleRate*dur), audio.ctx.sampleRate);
  const data = b.getChannelData(0);
  for (let i=0;i<data.length;i++){
    data[i] = (Math.random()*2-1) * (1 - i/data.length);
  }
  const src = audio.ctx.createBufferSource();
  const g = audio.ctx.createGain();
  src.buffer=b;
  g.gain.value=gain;
  src.connect(g); g.connect(audio.master);
  src.start(t);
}

// ---- Game state ----
const S = {
  running:false,
  t:0,
  score:0,
  last:0,
  best:0,

  // player
  x:0,
  y:0,
  vy:0,

  // world
  speed: 280,
  gravity: 980,
  boost: -820,
  gateGap: 165,
  gateW: 70,
  gateSpacing: 265,

  gates: [],
  passed: 0,
  seed: 0,
  rnd: mulberry32(1),

  pressed:false,
};

function bestKey(){
  return `daily_gate_best_${ymd()}`;
}
function loadBest(){
  S.best = parseInt(localStorage.getItem(bestKey()) || '0', 10) || 0;
  bestEl.textContent = String(S.best);
}
function saveBest(){
  localStorage.setItem(bestKey(), String(S.best));
}

function showOverlay(kind){
  overlay.style.display = 'flex';
  if (kind==='start'){
    overlayTitle.textContent = '📅 Daily Gate Run';
    overlayText.textContent = 'One-button daily challenge. Same gate layout for everyone today — share your score.';
    startBtn.textContent = 'Start';
  } else if (kind==='dead'){
    overlayTitle.textContent = 'Crashed 😵';
    overlayText.textContent = 'Try smaller taps. Find a rhythm — today’s gates are learnable.';
    startBtn.textContent = 'Try again';
  }
}

function resetRun(){
  S.running = false;
  S.t = 0;
  S.score = 0;
  S.passed = 0;

  S.x = 180;
  S.y = H*0.5;
  S.vy = 0;

  // daily vs practice
  const daily = !practiceToggle.checked;
  S.seed = daily ? dailySeed() : ((Math.random()*1e9)>>>0);
  S.rnd = mulberry32(S.seed);

  dayPill.textContent = daily ? 'daily' : 'practice';

  // gates
  S.gates.length = 0;
  const startX = W + 240;
  let cy = H*0.5;
  for (let i=0;i<42;i++){
    const nx = startX + i*S.gateSpacing;
    // smooth-ish random walk for center line
    const step = (S.rnd()*2-1) * 140;
    cy = clamp(cy + step, 110, H-110);
    S.gates.push({ x:nx, cy, passed:false });
  }
}

function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }

function die(){
  S.running = false;
  S.last = S.passed;
  lastEl.textContent = String(S.last);
  if (S.last > S.best){
    S.best = S.last;
    bestEl.textContent = String(S.best);
    saveBest();
  }
  showOverlay('dead');
  overlay.style.display = 'flex';
  noiseBurst(0.09, 0.10);
  tone(140, 0.12, 0.10);
}

function share(){
  const daily = !practiceToggle.checked;
  const msg =
`Rocket Arcade — ${daily?'Daily':'Practice'} Gate Run (${ymd()})
Score: ${S.best} gates 🚀
Try it: ${location.href}`;
  navigator.clipboard?.writeText(msg);
  shareBtn.textContent='Copied!';
  setTimeout(()=> shareBtn.textContent='Share', 900);
}

startBtn.addEventListener('click', ()=>{
  overlay.style.display='none';
  if (!S.running){
    resetRun();
    S.running=true;
    lastTime = performance.now();
    requestAnimationFrame(frame);
  }
});
shareBtn.addEventListener('click', share);
resetBtn.addEventListener('click', ()=>{
  localStorage.removeItem(bestKey());
  loadBest();
});

// input
function press(on){
  S.pressed = on;
  if (!S.running) return;
  if (on){
    S.vy = Math.max(S.vy, -120);
    S.vy += S.boost;
    tone(520, 0.05, 0.08);
  }
}
window.addEventListener('keydown', (e)=>{
  if (e.code==='Space') { e.preventDefault(); press(true); }
});
window.addEventListener('keyup', (e)=>{
  if (e.code==='Space') { e.preventDefault(); press(false); }
});
canvas.addEventListener('pointerdown', ()=> press(true));
window.addEventListener('pointerup', ()=> press(false));

// --- Render helpers ---
function roundRect(x,y,w,h,r){
  ctx.beginPath();
  const rr = Math.min(r, w/2, h/2);
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
}
function drawBg(){
  // galaxy gradient
  const g = ctx.createRadialGradient(W*0.75, H*0.25, 40, W*0.75, H*0.25, Math.max(W,H));
  g.addColorStop(0,'#0b1b2b');
  g.addColorStop(0.55,'#050914');
  g.addColorStop(1,'#03040a');
  ctx.fillStyle=g;
  ctx.fillRect(0,0,W,H);

  // stars
  ctx.globalAlpha = 0.9;
  for (let i=0;i<120;i++){
    const x = (i*97.3 + (S.seed%997))*0.73 % W;
    const y = (i*53.7 + (S.seed%607))*0.91 % H;
    const r = (i%9===0)?1.6:1.0;
    ctx.fillStyle = 'rgba(255,255,255,'+(0.16 + (i%7)*0.03)+')';
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function draw(){
  drawBg();

  // gates
  for (const g of S.gates){
    const x = g.x;
    const gap = S.gateGap;
    const topH = g.cy - gap/2;
    const botY = g.cy + gap/2;

    // body
    ctx.fillStyle = 'rgba(59,130,246,.12)';
    roundRect(x, 0, S.gateW, topH, 14); ctx.fill();
    roundRect(x, botY, S.gateW, H-botY, 14); ctx.fill();

    // edges
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // glow lip
    ctx.fillStyle = 'rgba(96,165,250,.22)';
    ctx.fillRect(x, topH-5, S.gateW, 5);
    ctx.fillRect(x, botY, S.gateW, 5);
  }

  // ship (simple capsule)
  ctx.save();
  ctx.translate(S.x, S.y);
  const ang = clamp(S.vy/900, -0.65, 0.65);
  ctx.rotate(ang);

  ctx.fillStyle = 'rgba(255,255,255,.92)';
  roundRect(-14, -10, 28, 20, 10); ctx.fill();
  ctx.fillStyle = 'rgba(59,130,246,.22)';
  ctx.beginPath(); ctx.arc(2,0,6.2,0,Math.PI*2); ctx.fill();

  // tiny flame when pressed
  if (S.pressed){
    const f = ctx.createRadialGradient(-15,0,0,-15,0,18);
    f.addColorStop(0,'rgba(255,255,255,.92)');
    f.addColorStop(0.3,'rgba(96,165,250,.68)');
    f.addColorStop(1,'rgba(96,165,250,0)');
    ctx.fillStyle=f;
    ctx.beginPath();
    ctx.moveTo(-16,-6); ctx.quadraticCurveTo(-30,0,-16,6); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // HUD
  ctx.fillStyle = 'rgba(255,255,255,.60)';
  ctx.font = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  ctx.fillText(`gates ${S.passed}   ${dayPill.textContent}`, 16, 26);
}

function collideGate(g){
  const gap = S.gateGap;
  const topH = g.cy - gap/2;
  const botY = g.cy + gap/2;
  const px = S.x, py = S.y;
  const r = 10.5;

  // if within gate x-range
  if (px + r > g.x && px - r < g.x + S.gateW){
    if (py - r < topH || py + r > botY) return true;
  }
  return false;
}

function step(dt){
  S.t += dt;

  // difficulty ramp (gentle)
  S.speed = 290 + Math.min(220, S.passed*6);
  S.gateGap = 170 - Math.min(60, S.passed*1.4);

  // physics
  S.vy += S.gravity*dt;
  S.vy *= Math.exp(-0.10*dt);
  S.y += S.vy*dt;

  // move gates
  for (const g of S.gates){
    g.x -= S.speed*dt;
    if (!g.passed && g.x + S.gateW < S.x){
      g.passed = true;
      S.passed += 1;
      tone(880, 0.05, 0.10);
    }
  }

  // recycle gates forward (keep deterministic stream)
  let first = S.gates[0];
  while (first && first.x + S.gateW < -100){
    S.gates.shift();
    const last = S.gates[S.gates.length-1];
    // continue random-walk
    let cy = last.cy + (S.rnd()*2-1)*140;
    cy = clamp(cy, 110, H-110);
    S.gates.push({ x:last.x + S.gateSpacing, cy, passed:false });
    first = S.gates[0];
  }

  // bounds
  if (S.y < -60 || S.y > H+60) return die();

  // collisions
  for (const g of S.gates){
    if (collideGate(g)) return die();
  }
}

let lastTime = performance.now();
function frame(t){
  const dt = Math.min(0.033, (t-lastTime)/1000);
  lastTime = t;
  if (S.running){
    step(dt);
    draw();
    if (S.running) requestAnimationFrame(frame);
  } else {
    draw();
  }
}

// init
resize();
loadBest();
resetRun();
showOverlay('start');
overlay.style.display='flex';
