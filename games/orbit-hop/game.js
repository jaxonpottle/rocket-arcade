// Orbit Hop — a forgiving, faster orbital toy with multiple planets + camera follow.
// Hold (mouse/touch/space) to thrust forward. Release to coast.
// Land gently to "visit" planets. Collect stars.

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
const modeLabel = document.getElementById('modeLabel');
const seedLabel = document.getElementById('seedLabel');

const soundToggle = document.getElementById('soundToggle');
const dailyToggle = document.getElementById('dailyToggle');

let W=0,H=0,DPR=1;

function resize(){
  const rect = canvas.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = Math.max(320, Math.floor(rect.width));
  H = Math.max(200, Math.floor(rect.height));
  canvas.width = Math.floor(W*DPR);
  canvas.height= Math.floor(H*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  makeStarfield();
}
window.addEventListener('resize', resize);

function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
function len2(x,y){ return x*x+y*y; }
function len(x,y){ return Math.sqrt(x*x+y*y); }
function norm(x,y){
  const l = Math.sqrt(x*x+y*y) || 1;
  return [x/l, y/l];
}
function now(){ return performance.now(); }

function mulberry32(seed){
  let t = seed >>> 0;
  return function(){
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function dailySeed(){
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth()+1;
  const day = d.getUTCDate();
  // yyyymmdd
  return (y*10000 + m*100 + day) >>> 0;
}

const STORAGE_KEY = 'rocketArcade.orbit.best.v2';
let bestScore = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0;
bestEl.textContent = String(bestScore);

// ----- Audio (tiny whoosh + beeps) -----
let audio = null;
function ensureAudio(){
  if (!soundToggle?.checked) return;
  if (audio && audio.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;

  const actx = new AC();
  const master = actx.createGain();
  master.gain.value = 0.55;
  master.connect(actx.destination);

  // simple wind/engine noise
  const dur = 1.4;
  const buf = actx.createBuffer(1, Math.floor(actx.sampleRate*dur), actx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i=0;i<data.length;i++){
    data[i] = (Math.random()*2-1) * 0.5;
  }
  const src = actx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const hp = actx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 80;

  const bp = actx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 220; bp.Q.value = 0.7;

  const g = actx.createGain();
  g.gain.value = 0;

  src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(master);
  src.start();

  audio = { ctx: actx, master, g, bp };
}

function setEngine(p){
  if (!audio || !soundToggle?.checked) return;
  const t = audio.ctx.currentTime;
  const x = clamp(p,0,1);
  audio.g.gain.setTargetAtTime(0.12*x, t, 0.04);
  audio.bp.frequency.setTargetAtTime(200 + 640*x, t, 0.05);
}

function beep(freq=640, dur=0.14, amp=0.12){
  if (!audio || !soundToggle?.checked) return;
  const t = audio.ctx.currentTime;
  const o = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(amp, t+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  o.connect(g); g.connect(audio.master);
  o.start(t); o.stop(t+dur+0.02);
}

// ----- World -----

const world = {
  seed: 0,
  rnd: mulberry32(1),

  t: 0,
  running: false,
  score: 0,
  visited: new Set(),
  stars: [],
  parts: [],

  ship: { x:0, y:0, vx:0, vy:0, heading: 0, fuel: 1, landed: false, landPlanet: null },

  cam: { x:0, y:0, z:1, vx:0, vy:0 },

  planets: [],
  bgStars: [],
};

const TUNE = {
  G: 6000000,          // gravity constant (scaled)
  soft: 180,         // softening
  thrust: 520,       // accel per sec^2
  maxSpeed: 1400,
  drag: 0.0025,       // space "stabilizer" (tiny)
  atmoDrag: 0.22,    // inside atmosphere ring
  fuelBurn: 0.10,
  fuelRegen: 0.06,
  starRadius: 18,
  landSpeed: 280,    // must be slower than this to "visit"
  landPad: 10,       // distance from surface
  outRescue: 6800,   // pull you back if too far
  zoomMin: 0.45,
  zoomMax: 1.05,
};

function makeStarfield(){
  const rnd = mulberry32(9001 + W*3 + H*5);
  world.bgStars.length = 0;
  const n = Math.floor((W*H)/4200);
  for (let i=0;i<n;i++){
    world.bgStars.push({
      x: rnd()*W, y: rnd()*H,
      z: 0.2 + rnd()*0.8,
      s: 0.6 + rnd()*1.8,
      tw: rnd()*Math.PI*2,
    });
  }
}

function resetWorld(hard=false){
  world.t = 0;
  world.score = 0;
  world.visited = new Set();
  world.stars.length = 0;
  world.parts.length = 0;

  // Seed
  world.seed = dailyToggle?.checked ? dailySeed() : (Math.random()*1e9)>>>0;
  world.rnd = mulberry32(world.seed);

  modeLabel.textContent = dailyToggle?.checked ? 'daily' : 'free';
  seedLabel.textContent = String(world.seed);

  // Planets (positions in world coords)
  const rnd = world.rnd;
  world.planets = [
    { id:'A', x:0, y:0, r: 220, mass: 8.0, c:'#1f3b5f', ring:'#2b6cb0' },
    { id:'B', x: 1400 + rnd()*600, y: -900 + rnd()*600, r: 140, mass: 4.5, c:'#224f3f', ring:'#34d399' },
    { id:'C', x: -1600 - rnd()*700, y: 1100 + rnd()*700, r: 160, mass: 5.2, c:'#4a2b52', ring:'#a855f7' },
  ];

  // Ship starts in a stable-ish orbit around planet A
  const a = rnd()*Math.PI*2;
  const p0 = world.planets[0];
  const R = p0.r + 360;
  const mu = TUNE.G * p0.mass;
  const v = Math.sqrt(mu / R) * (0.98 + rnd()*0.06);
  world.ship.x = p0.x + Math.cos(a)*R;
  world.ship.y = p0.y + Math.sin(a)*R;
  world.ship.vx = -Math.sin(a)*v;
  world.ship.vy =  Math.cos(a)*v;
  world.ship.heading = Math.atan2(world.ship.vy, world.ship.vx);

  world.ship.fuel = 1;
  world.ship.landed = false;
  world.ship.landPlanet = null;

  // Stars sprinkled around planets
  const starN = 14;
  for (let i=0;i<starN;i++){
    const p = world.planets[i % world.planets.length];
    const ang = rnd()*Math.PI*2;
    const rad = p.r*2.2 + rnd()*560;
    world.stars.push({
      x: p.x + Math.cos(ang)*rad,
      y: p.y + Math.sin(ang)*rad,
      alive: true,
      spin: rnd()*Math.PI*2,
    });
  }

  // Camera
  world.cam.x = world.ship.x;
  world.cam.y = world.ship.y;
  world.cam.vx = 0; world.cam.vy = 0;
  world.cam.z = 0.9;

  if (hard){
    bestScore = 0;
    localStorage.setItem(STORAGE_KEY, '0');
    bestEl.textContent = '0';
  }
}

function showOverlay(kind){
  overlay.style.display = 'flex';
  if (kind === 'start'){
    overlayTitle.textContent = 'Orbit Hop';
    overlayText.textContent = 'Hold to thrust. Steer with A/D or ←/→. Brake with S or ↓. Land gently to visit planets and grab stars.';
    startBtn.textContent = 'Start';
  } else if (kind === 'gameover'){
    overlayTitle.textContent = 'Lost in space 😵‍💫';
    overlayText.textContent = 'You drifted too far. Short bursts + gravity turns are the move. Try again.';
    startBtn.textContent = 'Try again';
  } else if (kind === 'pause'){
    overlayTitle.textContent = 'Paused';
    overlayText.textContent = 'Press Start to resume.';
    startBtn.textContent = 'Resume';
  }
}

function hideOverlay(){ overlay.style.display = 'none'; }

function gameOver(){
  world.running = false;
  lastEl.textContent = String(Math.floor(world.score));
  if (Math.floor(world.score) > bestScore){
    bestScore = Math.floor(world.score);
    localStorage.setItem(STORAGE_KEY, String(bestScore));
    bestEl.textContent = String(bestScore);
  }
  beep(180, 0.22, 0.16);
  showOverlay('gameover');
}

function startGame(){
  ensureAudio();
  resetWorld(false);
  world.running = true;
  hideOverlay();
  lastFrame = now();
  requestAnimationFrame(frame);
}

// ----- Input -----
let thrusting = false;
let turnL = false;
let turnR = false;
let brake = false;

function setThrust(on){
  thrusting = on;
  if (on) ensureAudio();
}

canvas.addEventListener('pointerdown', (e)=>{ e.preventDefault(); setThrust(true); });
window.addEventListener('pointerup', (e)=>{ setThrust(false); });

window.addEventListener('keydown', (e)=>{
  if (e.code === 'Space'){ if (!world.running) startGame(); setThrust(true); }
  if (e.code === 'KeyA' || e.code === 'ArrowLeft'){ turnL = true; e.preventDefault(); }
  if (e.code === 'KeyD' || e.code === 'ArrowRight'){ turnR = true; e.preventDefault(); }
  if (e.code === 'KeyS' || e.code === 'ArrowDown'){ brake = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e)=>{
  if (e.code === 'Space') setThrust(false);
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') turnL = false;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') turnR = false;
  if (e.code === 'KeyS' || e.code === 'ArrowDown') brake = false;
});

// Buttons
startBtn.addEventListener('click', ()=>{
  if (!world.running) startGame();
  else { world.running = false; showOverlay('pause'); }
});
resetBtn.addEventListener('click', ()=>{
  resetWorld(true);
  showOverlay('start');
});
shareBtn.addEventListener('click', async ()=>{
  const url = location.href;
  const text = `🪐 Orbit Hop\nBest score: ${bestEl.textContent}\n${url}`;
  try{
    if (navigator.share) await navigator.share({ title:'Orbit Hop', text, url });
    else {
      await navigator.clipboard.writeText(text);
      shareBtn.textContent = 'Copied!';
      setTimeout(()=> shareBtn.textContent='Share', 900);
    }
  }catch{}
});

dailyToggle?.addEventListener('change', ()=>{
  // reflect in overlay labels
  modeLabel.textContent = dailyToggle.checked ? 'daily' : 'free';
});

// ----- Physics helpers -----
function nearestPlanet(x,y){
  let best = null;
  let bestD = Infinity;
  for (const p of world.planets){
    const d = len(x-p.x, y-p.y) - p.r;
    if (d < bestD){ bestD = d; best = p; }
  }
  return { p: best, d: bestD };
}

function gravAccel(x,y){
  let ax=0, ay=0;
  for (const p of world.planets){
    const dx = p.x - x;
    const dy = p.y - y;
    const r2 = dx*dx + dy*dy + TUNE.soft*TUNE.soft;
    const r = Math.sqrt(r2);
    const a = (TUNE.G * p.mass) / r2;
    ax += a * (dx / r);
    ay += a * (dy / r);
  }
  return [ax, ay];
}

function spawnTrail(){
  const s = world.ship;
  world.parts.push({
    x: s.x, y: s.y,
    vx: -s.vx*0.08, vy: -s.vy*0.08,
    life: 0.45 + world.rnd()*0.35,
    r: 2 + world.rnd()*3,
  });
}

function stepParticles(dt){
  for (let i=world.parts.length-1;i>=0;i--){
    const p = world.parts[i];
    p.life -= dt;
    p.x += p.vx*dt;
    p.y += p.vy*dt;
    p.vx *= 0.98; p.vy *= 0.98;
    if (p.life <= 0) world.parts.splice(i,1);
  }
}

// ----- Render -----
function drawBackground(t){
  const g = ctx.createLinearGradient(0,0,W,H);
  g.addColorStop(0,'#05070d');
  g.addColorStop(0.5,'#090f1f');
  g.addColorStop(1,'#05070f');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,H);

  // nebulas (screen space)
  const neb = [
    {x: W*0.25, y: H*0.20, r: Math.min(W,H)*0.55, c:'rgba(96,165,250,.10)'},
    {x: W*0.80, y: H*0.30, r: Math.min(W,H)*0.62, c:'rgba(52,211,153,.08)'},
    {x: W*0.65, y: H*0.80, r: Math.min(W,H)*0.75, c:'rgba(168,85,247,.08)'},
  ];
  for (const n of neb){
    const x = n.x + Math.sin(t*0.12)*18;
    const y = n.y + Math.cos(t*0.10)*14;
    const gr = ctx.createRadialGradient(x,y,0,x,y,n.r);
    gr.addColorStop(0, n.c);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0,0,W,H);
  }

  // stars with parallax based on camera
  const px = world.cam.x*0.002;
  const py = world.cam.y*0.002;
  for (const s of world.bgStars){
    const tw = 0.6 + 0.4*Math.sin(s.tw + t*0.9);
    const x = (s.x - px*s.z*W + t*10*s.z) % W;
    const y = (s.y - py*s.z*H + t*3*s.z) % H;
    ctx.fillStyle = `rgba(255,255,255,${0.55*tw})`;
    ctx.fillRect((x+W)%W, (y+H)%H, s.s, s.s);
  }
}

function drawPlanet(p){
  // planet body
  ctx.fillStyle = p.c;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
  ctx.fill();

  // subtle terminator
  const gr = ctx.createRadialGradient(p.x - p.r*0.3, p.y - p.r*0.3, p.r*0.3, p.x, p.y, p.r);
  gr.addColorStop(0,'rgba(255,255,255,.10)');
  gr.addColorStop(0.6,'rgba(0,0,0,0)');
  gr.addColorStop(1,'rgba(0,0,0,.25)');
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
  ctx.fill();

  // atmosphere ring
  ctx.strokeStyle = 'rgba(251,113,133,.20)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r*1.45, 0, Math.PI*2);
  ctx.stroke();

  // orbit hint ring
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r*2.4, 0, Math.PI*2);
  ctx.stroke();

  // marker
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.font = '12px ui-monospace, Menlo, monospace';
  ctx.fillText(p.id, p.x - 4, p.y + 4);
}

function drawStar(st){
  st.spin += 0.02;
  const r = 10;
  const a = st.spin;
  ctx.save();
  ctx.translate(st.x, st.y);
  ctx.rotate(a);
  ctx.fillStyle = 'rgba(52,211,153,.85)';
  ctx.beginPath();
  for (let i=0;i<5;i++){
    const ang = i*2*Math.PI/5;
    const ox = Math.cos(ang)*r;
    const oy = Math.sin(ang)*r;
    ctx.lineTo(ox, oy);
    const ang2 = ang + Math.PI/5;
    ctx.lineTo(Math.cos(ang2)*r*0.45, Math.sin(ang2)*r*0.45);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawShip(){
  const s = world.ship;
  const ang = s.heading;

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(ang);

  // shadow glow
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#60a5fa';
  ctx.beginPath();
  ctx.arc(0,0, 18, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // body
  const body = ctx.createLinearGradient(-18,-6,18,6);
  body.addColorStop(0,'rgba(255,255,255,.92)');
  body.addColorStop(1,'rgba(210,220,240,.86)');
  ctx.fillStyle = body;
  roundRect(-14, -6, 28, 12, 6);
  ctx.fill();

  // nose
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(8, -7);
  ctx.lineTo(8, 7);
  ctx.closePath();
  ctx.fill();

  // fin
  ctx.fillStyle = 'rgba(251,113,133,.85)';
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.lineTo(-20, -9);
  ctx.lineTo(-16, 0);
  ctx.closePath();
  ctx.fill();

  // window
  ctx.fillStyle = 'rgba(96,165,250,.35)';
  ctx.beginPath(); ctx.arc(2,0,3.4,0,Math.PI*2); ctx.fill();

  // flame if thrusting
  if (thrusting && s.fuel > 0.01 && !s.landed){
    const f = ctx.createRadialGradient(-18,0,0,-18,0,18);
    f.addColorStop(0,'rgba(255,255,255,.90)');
    f.addColorStop(0.4,'rgba(96,165,250,.70)');
    f.addColorStop(1,'rgba(96,165,250,0)');
    ctx.fillStyle = f;
    ctx.beginPath();
    ctx.moveTo(-14,-4);
    ctx.quadraticCurveTo(-30,0,-14,4);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function roundRect(x,y,w,h,r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
}

function drawHUD(){
  const s = world.ship;
  const aliveStars = world.stars.filter(st=>st.alive).length;
  const visited = world.visited.size;

  ctx.save();
  ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillText(`score ${Math.floor(world.score)}   visited ${visited}/3   stars ${14-aliveStars}/14`, 16, 22);

  // fuel bar
  const x=16,y=34,w=220,h=10;
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  roundRect(x,y,w,h,6); ctx.fill();
  ctx.fillStyle = 'rgba(96,165,250,.55)';
  roundRect(x,y,w*s.fuel,h,6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.fillText('fuel', x+w+10, y+9);

  // tip line
  const np = nearestPlanet(s.x,s.y);
  ctx.fillStyle = 'rgba(255,255,255,.60)';
  const d = Math.max(0, Math.floor(np.d));
  ctx.fillText(`nearest ${np.p.id}   dist ${d}   ${s.landed ? 'LANDED (hold to launch)' : ''}`, 16, 54);

  ctx.restore();
}

// ----- Loop -----
let lastFrame = now();

function update(dt){
  world.t += dt;
  const s = world.ship;

  // steering + thrust + fuel
  let eng = 0;

  // steering (rotate heading). If you're not steering, we gently align to velocity.
  if (!s.landed){
    const turn = (turnR ? 1 : 0) - (turnL ? 1 : 0);
    const turnRate = 2.6; // rad/s
    s.heading += turn * turnRate * dt;

    if (turn === 0){
      const sp = len(s.vx, s.vy);
      if (sp > 18){
        const va = Math.atan2(s.vy, s.vx);
        s.heading = angleLerp(s.heading, va, 0.06);
      }
    }
  }

  // thrust (hold click/touch/space). Optional brake (S / ↓) uses retro burn.
  if (!s.landed && thrusting && s.fuel > 0.01){
    let tx = Math.cos(s.heading);
    let ty = Math.sin(s.heading);

    if (brake){
      const sp = len(s.vx, s.vy);
      if (sp > 10){
        [tx, ty] = norm(-s.vx, -s.vy); // true retrograde
      } else {
        tx = -tx; ty = -ty;
      }
    }

    s.vx += tx * TUNE.thrust * dt;
    s.vy += ty * TUNE.thrust * dt;

    s.fuel = clamp(s.fuel - TUNE.fuelBurn * dt, 0, 1);
    eng = 1;
    spawnTrail();
  } else {
    s.fuel = clamp(s.fuel + TUNE.fuelRegen * dt, 0, 1);
  }

  setEngine(eng);

  // gravity
  if (!s.landed){
    const [ax,ay] = gravAccel(s.x,s.y);
    s.vx += ax*dt;
    s.vy += ay*dt;
  }

  // drag (tiny stabilizer, bigger in atmosphere)
  let drag = TUNE.drag;
  for (const p of world.planets){
    const d = len(s.x-p.x, s.y-p.y);
    if (d < p.r*1.45){
      drag = Math.max(drag, TUNE.atmoDrag);
      // hot atmosphere drains fuel a bit (forces decisions)
      s.fuel = clamp(s.fuel - 0.04*dt, 0, 1);
    }
  }
  const sp = len(s.vx,s.vy);
  if (!s.landed){
    s.vx *= Math.exp(-drag*dt);
    s.vy *= Math.exp(-drag*dt);
  }

  // cap speed
  const sp2 = len2(s.vx,s.vy);
  if (sp2 > TUNE.maxSpeed*TUNE.maxSpeed){
    const k = TUNE.maxSpeed / Math.sqrt(sp2);
    s.vx *= k; s.vy *= k;
  }

  // integrate
  if (!s.landed){
    s.x += s.vx*dt;
    s.y += s.vy*dt;
  }

  // landing / visiting
  if (!s.landed){
    for (const p of world.planets){
      const d = len(s.x-p.x, s.y-p.y);
      if (d < p.r + TUNE.landPad){
        const speed = len(s.vx,s.vy);
        if (speed < TUNE.landSpeed){
          // land!
          s.landed = true;
          s.landPlanet = p.id;
          world.visited.add(p.id);
          beep(860, 0.10, 0.12);
          // stick to surface
          const [nx,ny] = norm(s.x-p.x, s.y-p.y);
          s.x = p.x + nx*(p.r + TUNE.landPad);
          s.y = p.y + ny*(p.r + TUNE.landPad);
          s.vx = 0; s.vy = 0;
          // reward
          world.score += 250;
          s.fuel = clamp(s.fuel + 0.35, 0, 1);
          break;
        } else {
          // too fast -> bounce
          const [nx,ny] = norm(s.x-p.x, s.y-p.y);
          const vn = s.vx*nx + s.vy*ny;
          if (vn < 0){
            s.vx -= 1.8*vn*nx;
            s.vy -= 1.8*vn*ny;
            beep(220, 0.08, 0.07);
          }
        }
      }
    }
  } else {
    // landed: allow launch by holding thrust
    if (thrusting && s.fuel > 0.01){
      s.landed = false;
      const p = world.planets.find(pp=>pp.id===s.landPlanet) || world.planets[0];
      const [nx,ny] = norm(s.x - p.x, s.y - p.y);
      s.vx = nx*320;
      s.vy = ny*320;
      s.fuel = clamp(s.fuel - 0.08, 0, 1);
      s.landPlanet = null;
      beep(520, 0.12, 0.10);
    }
  }

  // collect stars
  for (const st of world.stars){
    if (!st.alive) continue;
    const d = len(s.x-st.x, s.y-st.y);
    if (d < TUNE.starRadius){
      st.alive = false;
      world.score += 120;
      beep(880, 0.10, 0.11);
      s.fuel = clamp(s.fuel + 0.12, 0, 1);
    }
  }

  // scoring over time (survival)
  world.score += 22*dt + 0.02*sp*dt;

  // lose condition: drift too far from everything (soft-rescue first)
  const np = nearestPlanet(s.x,s.y);
  if (np.d > TUNE.outRescue){
    const [rx,ry] = norm(np.p.x - s.x, np.p.y - s.y);
    s.vx += rx*260*dt;
    s.vy += ry*260*dt;
    world.score = Math.max(0, world.score - 8*dt);
    if (np.d > TUNE.outRescue*1.35){
      gameOver();
    }
  }

  stepParticles(dt);

  // camera follow with smoothing + dynamic zoom
  const targetX = s.x;
  const targetY = s.y;

  world.cam.vx = lerp(world.cam.vx, (targetX - world.cam.x)*2.6, 0.05);
  world.cam.vy = lerp(world.cam.vy, (targetY - world.cam.y)*2.6, 0.05);
  world.cam.x += world.cam.vx*dt;
  world.cam.y += world.cam.vy*dt;

  const zoomTarget = clamp(0.92 - sp/3600, TUNE.zoomMin, TUNE.zoomMax);
  world.cam.z = lerp(world.cam.z, zoomTarget, 0.06);
}

function lerp(a,b,t){ return a + (b-a)*t; }

function angleWrap(a){
  while (a > Math.PI) a -= Math.PI*2;
  while (a < -Math.PI) a += Math.PI*2;
  return a;
}
function angleLerp(a,b,t){
  return a + angleWrap(b - a) * t;
}

function draw(){
  drawBackground(world.t);

  // world transform
  ctx.save();
  ctx.translate(W/2, H/2);
  ctx.scale(world.cam.z, world.cam.z);
  ctx.translate(-world.cam.x, -world.cam.y);

  // planets
  for (const p of world.planets) drawPlanet(p);

  // stars
  for (const st of world.stars){
    if (st.alive) drawStar(st);
  }

  // particles
  ctx.globalCompositeOperation = 'lighter';
  for (const p of world.parts){
    const a = clamp(p.life/0.8, 0, 1);
    ctx.globalAlpha = 0.75*a;
    ctx.fillStyle = 'rgba(96,165,250,.55)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // ship
  drawShip();

  ctx.restore();

  // HUD in screen space
  drawHUD();
}

function frame(){
  const t = now();
  const dt = clamp((t - lastFrame)/1000, 0, 0.033);
  lastFrame = t;

  if (world.running){
    update(dt);
    draw();
    if (world.running) requestAnimationFrame(frame);
  } else {
    draw();
  }
}

// init
resize();
resetWorld(false);
showOverlay('start');
draw();

soundToggle?.addEventListener('change', ()=>{
  if (!soundToggle.checked){
    if (audio?.master){
      try{ audio.master.gain.value = 0; }catch{}
    }
  } else {
    ensureAudio();
  }
});
