// Balance the Rocket – canvas game (no dependencies)
// Add more games by copying games/_template and updating games/games.json

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const startBtn = document.getElementById('startBtn');
const shareBtn = document.getElementById('shareBtn');
const bestEl = document.getElementById('best');
const lastEl = document.getElementById('last');

const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');

const STORAGE_KEY = 'rocket_arcade.balance_rocket.best_seconds';

function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
function lerp(a, b, t){ return a + (b - a) * t; }

function fmt(t){
  return `${t.toFixed(1)}s`;
}

let dpr = 1;
let W = 0, H = 0;

function resize(){
  dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const rect = canvas.getBoundingClientRect();
  W = Math.floor(rect.width);
  H = Math.floor(rect.height);
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);

let inputLeft = false;
let inputRight = false;

function setLeft(v){ inputLeft = v; }
function setRight(v){ inputRight = v; }

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') setLeft(true);
  if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') setRight(true);
  if (e.key === ' ' && !running) start();
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') setLeft(false);
  if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') setRight(false);
});

function bindHold(btn, setter){
  const down = (e) => { e.preventDefault(); setter(true); };
  const up = (e) => { e.preventDefault(); setter(false); };

  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('pointerleave', up);

  // Mobile Safari sometimes benefits from touch events too
  btn.addEventListener('touchstart', down, { passive: false });
  btn.addEventListener('touchend', up, { passive: false });
}
bindHold(leftBtn, setLeft);
bindHold(rightBtn, setRight);

let best = Number(localStorage.getItem(STORAGE_KEY) || '0') || 0;
bestEl.textContent = fmt(best);

let running = false;
let tStart = 0;
let tNow = 0;
let tLastFrame = 0;
let lastScore = null;

const state = {
  // rocket orientation
  angle: 0,       // rad
  angVel: 0,      // rad/s

  // lateral drift (wind also pushes sideways)
  x: 0,           // px from center
  xVel: 0,        // px/s

  // wind drivers
  windT: 0,
  windTarget: 0,  // -1..1
  wind: 0,        // smoothed -1..1
  gust: 0,        // impulsive gust

  // particles
  parts: []
};

function reset(){
  state.angle = (Math.random() * 0.12 - 0.06);
  state.angVel = 0;
  state.x = 0;
  state.xVel = 0;
  state.windT = 0;
  state.windTarget = (Math.random() * 2 - 1) * 0.25;
  state.wind = 0;
  state.gust = 0;
  state.parts.length = 0;
}

function showOverlay(mode){
  overlay.style.display = 'flex';
  if (mode === 'start'){
    overlayTitle.textContent = 'Balance the Rocket';
    overlayText.innerHTML = `Hold <b>A / ←</b> and <b>D / →</b> to fire thrusters. Small taps work better than slamming it.`;
    startBtn.textContent = 'Start';
    lastEl.textContent = lastScore == null ? '—' : fmt(lastScore);
  } else if (mode === 'gameover'){
    overlayTitle.textContent = 'Crashed 😵';
    overlayText.innerHTML = `You lost control. Try shorter corrections and anticipate the wind ramp.`;
    startBtn.textContent = 'Try again';
    lastEl.textContent = fmt(lastScore ?? 0);
  }
  bestEl.textContent = fmt(best);
}

function hideOverlay(){
  overlay.style.display = 'none';
}

function copyShare(){
  const score = lastScore ?? 0;
  const msg = `🚀 Balance the Rocket: ${fmt(score)} (best ${fmt(best)})\nPlay: ${location.href}`;
  navigator.clipboard?.writeText(msg).catch(()=>{});
}

shareBtn.addEventListener('click', copyShare);

startBtn.addEventListener('click', () => {
  if (!running) start();
});

function start(){
  resize();
  reset();
  running = true;
  hideOverlay();
  tStart = performance.now();
  tLastFrame = tStart;
  requestAnimationFrame(frame);
}

function end(){
  running = false;
  lastScore = (tNow - tStart) / 1000;
  if (lastScore > best){
    best = lastScore;
    localStorage.setItem(STORAGE_KEY, String(best));
  }
  showOverlay('gameover');
}

function spawnThrusterParticles(side, rocketX, rocketY, rocketAngle, strength){
  // side: -1 (left) or +1 (right) thruster, emitted near base
  const count = Math.floor(5 + 10 * strength);
  const baseSpeed = 80 + 140 * strength;

  for (let i = 0; i < count; i++){
    const jitter = (Math.random() - 0.5) * 10;
    const jitter2 = (Math.random() - 0.5) * 10;

    // emit down-ish and slightly outward
    const emitAngle = rocketAngle + Math.PI/2 + side * 0.15 + (Math.random() - 0.5) * 0.35;
    const vx = Math.cos(emitAngle) * (baseSpeed + Math.random() * 60);
    const vy = Math.sin(emitAngle) * (baseSpeed + Math.random() * 60);

    state.parts.push({
      x: rocketX + side * 10 + jitter,
      y: rocketY + 34 + jitter2,
      vx, vy,
      life: 0.25 + Math.random() * 0.25,
      r: 2 + Math.random() * 3
    });
  }
}

function update(dt){
  // Difficulty ramps over time
  const t = (tNow - tStart) / 1000;
  const ramp = 1 + Math.min(2.2, t / 25); // 1 → ~3.2 over ~55s

  // Wind: smooth target changes
  state.windT += dt;
  if (state.windT > 2.2){
    state.windT = 0;
    const next = (Math.random() * 2 - 1);
    state.windTarget = clamp(next, -1, 1) * (0.25 + 0.25 * Math.min(1, t / 35));
  }

  // Exponential smoothing for wind
  const windFollow = 1 - Math.exp(-dt * 1.2);
  state.wind = lerp(state.wind, state.windTarget, windFollow);

  // Occasional gusts
  if (Math.random() < dt * (0.18 + 0.12 * ramp)){
    state.gust += (Math.random() * 2 - 1) * 0.7 * ramp;
  }
  // Decay gust
  state.gust *= Math.exp(-dt * 2.4);

  // Forces/torques
  const thrusterTorque = 6.8 * ramp;     // rad/s^2 equivalent after inertia scaling
  const windTorque = 2.4 * ramp;         // rad/s^2
  const dampAng = 1.6;                   // damping

  let torque = 0;
  let thrustL = 0, thrustR = 0;

  if (inputLeft){ torque += thrusterTorque; thrustL = 1; }
  if (inputRight){ torque -= thrusterTorque; thrustR = 1; }

  torque += (state.wind + 0.55 * state.gust) * windTorque;

  // Angular dynamics (toy model)
  state.angVel += torque * dt;
  state.angVel *= Math.exp(-dt * dampAng);
  state.angle += state.angVel * dt;

  // Lateral drift (wind pushes sideways; angle also couples)
  const windPush = 120 * ramp;           // px/s^2
  const angCouple = 240;                 // px/s^2 per rad (lean makes drift)
  const dampX = 1.1;

  const ax = (state.wind + 0.35 * state.gust) * windPush + state.angle * angCouple;
  state.xVel += ax * dt;
  state.xVel *= Math.exp(-dt * dampX);
  state.x += state.xVel * dt;

  // Particles
  const rocketX = W/2 + state.x;
  const rocketY = H/2 + 30;

  if (thrustL) spawnThrusterParticles(-1, rocketX, rocketY, state.angle, 0.6);
  if (thrustR) spawnThrusterParticles(+1, rocketX, rocketY, state.angle, 0.6);

  for (let i = state.parts.length - 1; i >= 0; i--){
    const p = state.parts[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.exp(-dt * 5.0);
    p.vy *= Math.exp(-dt * 5.0);
    p.r *= Math.exp(-dt * 6.0);
    if (p.life <= 0 || p.r < 0.3) state.parts.splice(i, 1);
  }

  // Fail conditions
  const maxAngle = 0.75; // ~43°
  const maxX = Math.min(220, W * 0.28);

  if (Math.abs(state.angle) > maxAngle || Math.abs(state.x) > maxX){
    end();
  }
}

function draw(){
  // background
  ctx.fillStyle = '#070b12';
  ctx.fillRect(0, 0, W, H);

  // subtle stars
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  for (let i = 0; i < 70; i++){
    const x = (i * 97) % W;
    const y = ((i * 193) % H);
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;

  // ground bar / safe zone marker
  const maxX = Math.min(220, W * 0.28);
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  ctx.fillRect(0, H - 74, W, 74);

  // safe zone boundaries
  ctx.strokeStyle = 'rgba(96,165,250,.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W/2 - maxX, H - 74);
  ctx.lineTo(W/2 - maxX, 0);
  ctx.moveTo(W/2 + maxX, H - 74);
  ctx.lineTo(W/2 + maxX, 0);
  ctx.stroke();

  // wind indicator
  const t = running ? (tNow - tStart) / 1000 : 0;
  const ramp = 1 + Math.min(2.2, t / 25);
  const wind = (state.wind + 0.55 * state.gust);
  const wx = clamp(wind, -1, 1);

  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  if (running){
    const score = (tNow - tStart) / 1000;
    ctx.fillText(`time ${fmt(score)}  wind ${(wx*100).toFixed(0)}%  ramp x${ramp.toFixed(2)}`, 14, 20);
  } else {
    ctx.fillText(`press Space or Start`, 14, 20);
  }

  // wind arrow
  const ax = W - 160;
  const ay = 16;
  const wlen = 90 * wx;
  ctx.strokeStyle = 'rgba(52,211,153,.75)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax + wlen, ay);
  ctx.stroke();
  ctx.fillStyle = 'rgba(52,211,153,.9)';
  ctx.beginPath();
  ctx.arc(ax + wlen, ay, 5, 0, Math.PI*2);
  ctx.fill();

  // particles
  ctx.globalCompositeOperation = 'lighter';
  for (const p of state.parts){
    ctx.globalAlpha = clamp(p.life / 0.5, 0, 1);
    ctx.fillStyle = 'rgba(96,165,250,.55)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // rocket
  const rocketX = W/2 + state.x;
  const rocketY = H/2 + 30;

  ctx.save();
  ctx.translate(rocketX, rocketY);
  ctx.rotate(state.angle);

  // body
  ctx.fillStyle = 'rgba(229,231,235,.92)';
  roundRect(ctx, -14, -48, 28, 84, 10);
  ctx.fill();

  // window
  ctx.fillStyle = 'rgba(96,165,250,.55)';
  ctx.beginPath();
  ctx.arc(0, -16, 7, 0, Math.PI*2);
  ctx.fill();

  // nose
  ctx.fillStyle = 'rgba(229,231,235,.95)';
  ctx.beginPath();
  ctx.moveTo(-14, -48);
  ctx.lineTo(0, -72);
  ctx.lineTo(14, -48);
  ctx.closePath();
  ctx.fill();

  // fins
  ctx.fillStyle = 'rgba(251,113,133,.75)';
  ctx.beginPath();
  ctx.moveTo(-14, 24);
  ctx.lineTo(-32, 44);
  ctx.lineTo(-14, 44);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, 24);
  ctx.lineTo(32, 44);
  ctx.lineTo(14, 44);
  ctx.closePath();
  ctx.fill();

  // thruster flames indicators
  if (inputLeft){
    flame(-10, 44, -1);
  }
  if (inputRight){
    flame(10, 44, +1);
  }

  ctx.restore();

  // tilt warning
  const maxAngle = 0.75;
  const danger = Math.min(1, Math.abs(state.angle) / maxAngle);
  if (running && danger > 0.6){
    ctx.fillStyle = `rgba(251,113,133,${(danger-0.6)/0.4 * 0.8})`;
    ctx.fillRect(0, 0, W, 4);
  }
}

function flame(x, y, side){
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(side * 0.15);
  ctx.fillStyle = 'rgba(52,211,153,.85)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-4, 18);
  ctx.lineTo(4, 18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRect(c, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

function frame(now){
  tNow = now;
  const dt = clamp((now - tLastFrame) / 1000, 0, 0.033); // clamp to avoid huge leaps
  tLastFrame = now;

  if (running){
    update(dt);
  }
  draw();

  if (running){
    requestAnimationFrame(frame);
  }
}

// Initial
resize();
showOverlay('start');
