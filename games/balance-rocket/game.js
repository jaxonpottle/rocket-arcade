const c = document.getElementById('c');
const ctx = c.getContext('2d', { alpha:false });

const wrap = document.getElementById('wrap');
const overlay = document.getElementById('overlay');
const titleEl = document.getElementById('title');
const descEl = document.getElementById('desc');

const bestTEl = document.getElementById('bestT');
const bestSEl = document.getElementById('bestS');
const lastTEl = document.getElementById('lastT');
const lastSEl = document.getElementById('lastS');

const startBtn = document.getElementById('start');
const shareBtn = document.getElementById('share');
const resetBtn = document.getElementById('reset');

const soundToggle = document.getElementById('sound');
const easyToggle = document.getElementById('easy');

const Lbtn = document.getElementById('L');
const Rbtn = document.getElementById('R');

const STORE = {
  bt:'ra.balance.bestT', bs:'ra.balance.bestS',
  snd:'ra.balance.snd', ez:'ra.balance.ez'
};

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const fmt=t=>`${t.toFixed(1)}s`;

let dpr=1,W=0,H=0;
function resize(){
  dpr = Math.max(1, Math.min(2, window.devicePixelRatio||1));
  const r = c.getBoundingClientRect();
  W = Math.floor(r.width); H = Math.floor(r.height);
  c.width = Math.floor(W*dpr); c.height = Math.floor(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize', resize);

// ---- Sound (tiny beeps)
let ac=null;
function ensureAudio(){
  if(ac) return ac;
  const AC = window.AudioContext||window.webkitAudioContext;
  if(!AC) return null;
  ac = new AC(); return ac;
}
function beep(f, d=0.06, g=0.03){
  if(!soundToggle.checked) return;
  const a = ensureAudio(); if(!a) return;
  const o=a.createOscillator(), gg=a.createGain();
  o.type='sine'; o.frequency.value=f; gg.gain.value=g;
  o.connect(gg); gg.connect(a.destination);
  o.start(); o.stop(a.currentTime+d);
}

// ---- Persistence
let bestT = Number(localStorage.getItem(STORE.bt)||'0')||0;
let bestS = Number(localStorage.getItem(STORE.bs)||'0')||0;
bestTEl.textContent=fmt(bestT); bestSEl.textContent=Math.floor(bestS);

soundToggle.checked = (localStorage.getItem(STORE.snd)||'0')==='1';
easyToggle.checked  = (localStorage.getItem(STORE.ez )||'0')==='1';
soundToggle.addEventListener('change',()=>localStorage.setItem(STORE.snd, soundToggle.checked?'1':'0'));
easyToggle.addEventListener('change',()=>localStorage.setItem(STORE.ez,  easyToggle.checked?'1':'0'));

let lastT=null,lastS=null,lastChecks=null;

// ---- Input
let L=false,R=false;
function holdBtn(btn,setter){
  const down=e=>{e.preventDefault(); setter(true);};
  const up  =e=>{e.preventDefault(); setter(false);};
  btn.addEventListener('pointerdown',down);
  btn.addEventListener('pointerup',up);
  btn.addEventListener('pointercancel',up);
  btn.addEventListener('pointerleave',up);
}
holdBtn(Lbtn,v=>L=v);
holdBtn(Rbtn,v=>R=v);

window.addEventListener('keydown',e=>{
  if(e.repeat) return;
  if(e.key==='a'||e.key==='A'||e.key==='ArrowLeft') L=true;
  if(e.key==='d'||e.key==='D'||e.key==='ArrowRight') R=true;
  if(e.key===' ' && !running) start();
});
window.addEventListener('keyup',e=>{
  if(e.key==='a'||e.key==='A'||e.key==='ArrowLeft') L=false;
  if(e.key==='d'||e.key==='D'||e.key==='ArrowRight') R=false;
});

wrap.addEventListener('pointerdown',e=>{
  if(overlay.style.display!=='none') return;
  const r=wrap.getBoundingClientRect();
  const x=e.clientX-r.left;
  if(x<r.width/2) L=true; else R=true;
});
wrap.addEventListener('pointerup',()=>{L=false;R=false;});
wrap.addEventListener('pointercancel',()=>{L=false;R=false;});
wrap.addEventListener('pointerleave',()=>{L=false;R=false;});

// ---- Game state
let running=false, tStart=0, tLast=0, tNow=0;
const s={
  ang:0, w:0, x:0, vx:0,
  wind:0, windT:0, windTarget:0, gust:0,
  fuel:100,
  parts:[],
  nextCheck:8, checkOn:false, checkStart:0, checkProg:0,
  wins:0, fails:0
};

function reset(){
  s.ang=(Math.random()*0.12-0.06); s.w=0; s.x=0; s.vx=0;
  s.wind=0; s.windT=0; s.windTarget=(Math.random()*2-1)*0.25; s.gust=0;
  s.fuel=100; s.parts.length=0;
  s.nextCheck=8; s.checkOn=false; s.checkProg=0;
  s.wins=0; s.fails=0;
}

function showOverlay(mode){
  overlay.style.display='flex';
  if(mode==='start'){
    titleEl.textContent='Balance the Rocket';
    descEl.innerHTML=`Every ~10 seconds, a <b>stability check</b> appears. Stay inside the green box to pass and refuel.`;
    startBtn.textContent='Start';
  }else{
    titleEl.textContent='Crashed 😵';
    descEl.innerHTML=`Try smaller, earlier taps. Don’t chase the wobble — damp it.`;
    startBtn.textContent='Try again';
  }
  bestTEl.textContent=fmt(bestT);
  bestSEl.textContent=Math.floor(bestS);
  lastTEl.textContent= lastT==null ? '—' : fmt(lastT);
  lastSEl.textContent= lastS==null ? '—' : Math.floor(lastS);
}
function hideOverlay(){ overlay.style.display='none'; }

function start(){
  resize(); reset();
  if(soundToggle.checked){ const a=ensureAudio(); if(a && a.state==='suspended') a.resume?.(); }
  running=true;
  hideOverlay();
  tStart=performance.now(); tLast=tStart;
  requestAnimationFrame(frame);
}
function end(){
  running=false;
  lastT = (tNow - tStart)/1000;

  const timeScore = lastT*10;
  const objScore  = s.wins*250;
  const styleScore= clamp((s.fuel/100)*120,0,120);
  lastS = timeScore + objScore + styleScore;
  lastChecks = `${s.wins}/${s.wins+s.fails}`;

  if(lastT>bestT){ bestT=lastT; localStorage.setItem(STORE.bt,String(bestT)); }
  if(lastS>bestS){ bestS=lastS; localStorage.setItem(STORE.bs,String(bestS)); }

  beep(140,0.12,0.04);
  showOverlay('gameover');
}

function spawnParticles(side, rx, ry){
  const n=8;
  for(let i=0;i<n;i++){
    const a = s.ang + Math.PI/2 + side*0.2 + (Math.random()-0.5)*0.6;
    const sp=120+Math.random()*120;
    s.parts.push({
      x: rx + side*9 + (Math.random()-0.5)*6,
      y: ry + 34 + (Math.random()-0.5)*6,
      vx: Math.cos(a)*sp, vy: Math.sin(a)*sp,
      life: 0.25+Math.random()*0.25,
      r: 1.5+Math.random()*2.2
    });
  }
}

function update(dt){
  const t = (tNow - tStart)/1000;

  const baseRamp = 1 + Math.min(2.3, t/24);
  const ramp = easyToggle.checked ? (1+(baseRamp-1)*0.72) : baseRamp;

  // wind target wander
  s.windT += dt;
  if(s.windT>2.0){
    s.windT=0;
    s.windTarget = clamp((Math.random()*2-1), -1, 1) * (0.22 + 0.28*Math.min(1,t/35));
  }
  s.wind = lerp(s.wind, s.windTarget, 1-Math.exp(-dt*1.1));
  if(Math.random() < dt*(0.16+0.10*ramp)){
    s.gust += (Math.random()*2-1)*0.65*ramp;
  }
  s.gust *= Math.exp(-dt*2.7);

  // fuel
  const pressing = (L?1:0) + (R?1:0);
  const burn = 34*dt, refill=14*dt;
  if(pressing) s.fuel = clamp(s.fuel - burn*pressing, 0, 100);
  else s.fuel = clamp(s.fuel + refill, 0, 100);
  const fuelFactor = 0.45 + 0.55*(s.fuel/100);

  // angular dynamics
  const thr = 7.0*ramp*fuelFactor;
  const windTorque = 2.5*ramp;
  let torque = 0;
  if(L && s.fuel>0) torque += thr;
  if(R && s.fuel>0) torque -= thr;
  torque += (s.wind + 0.55*s.gust) * windTorque;

  s.w += torque*dt;
  s.w *= Math.exp(-dt*1.7);
  s.ang += s.w*dt;

  // lateral drift
  const ax = (s.wind+0.35*s.gust)* (125*ramp) + s.ang*(250);
  s.vx += ax*dt;
  s.vx *= Math.exp(-dt*1.1);
  s.x  += s.vx*dt;

  // particles
  const rx=W/2+s.x, ry=H/2+36;
  if(L && s.fuel>0) spawnParticles(-1,rx,ry);
  if(R && s.fuel>0) spawnParticles( 1,rx,ry);
  for(let i=s.parts.length-1;i>=0;i--){
    const p=s.parts[i];
    p.life-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
    p.vx*=Math.exp(-dt*5.2); p.vy*=Math.exp(-dt*5.2);
    p.r *=Math.exp(-dt*6.0);
    if(p.life<=0||p.r<0.3) s.parts.splice(i,1);
  }

  // stability checks
  const checkInterval = easyToggle.checked?10.5:9.5;
  const duration = 2.6;
  const need = easyToggle.checked?2.0:2.3;
  const angB = easyToggle.checked?0.20:0.17;
  const xBFrac = easyToggle.checked?0.13:0.11;
  const maxX = Math.min(250, W*0.28);

  if(!s.checkOn && t>=s.nextCheck){
    s.checkOn=true; s.checkStart=t; s.checkProg=0;
    beep(520,0.07,0.03);
  }
  if(s.checkOn){
    const inBox = Math.abs(s.ang)<angB && Math.abs(s.x)<xBFrac*maxX;
    if(inBox) s.checkProg += dt;
    if(t - s.checkStart >= duration){
      const win = s.checkProg>=need;
      s.checkOn=false; s.nextCheck = t + checkInterval;
      if(win){
        s.wins++; s.fuel = clamp(s.fuel+35,0,100); s.gust*=0.65;
        beep(880,0.06,0.03); setTimeout(()=>beep(660,0.07,0.03),60);
      }else{
        s.fails++; beep(220,0.10,0.03);
      }
    }
  }

  // crash
  const maxAng = easyToggle.checked?0.82:0.76;
  if(Math.abs(s.ang)>maxAng || Math.abs(s.x)>maxX) end();
}

function roundRect(x,y,w,h,r){
  const rr=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
}

function draw(){
  // background
  ctx.fillStyle='#060a12'; ctx.fillRect(0,0,W,H);
  ctx.globalAlpha=0.75; ctx.fillStyle='rgba(255,255,255,.09)';
  for(let i=0;i<90;i++){
    const x=(i*97)%W, y=(i*193)%H, ssz=1+((i*31)%2);
    ctx.fillRect(x,y,ssz,ssz);
  }
  ctx.globalAlpha=1;

  // safe rails
  const maxX = Math.min(250, W*0.28);
  ctx.strokeStyle='rgba(96,165,250,.28)'; ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(W/2-maxX,0); ctx.lineTo(W/2-maxX,H);
  ctx.moveTo(W/2+maxX,0); ctx.lineTo(W/2+maxX,H);
  ctx.stroke();

  const t = running ? (tNow - tStart)/1000 : 0;
  const scoreLive = (t*10) + (s.wins*250) + clamp((s.fuel/100)*120,0,120);

  // HUD
  const wind = clamp((s.wind+0.55*s.gust),-1,1);
  ctx.fillStyle='rgba(255,255,255,.90)';
  ctx.font='12px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText(`time ${fmt(t)}   score ${Math.floor(scoreLive)}   checks ${s.wins}/${s.wins+s.fails}`, 14, 20);
  ctx.fillStyle='rgba(163,163,163,.95)';
  ctx.fillText(`wind ${(wind*100).toFixed(0)}%`, 14, 38);

  // fuel bar
  const fx=14, fy=50, fw=220, fh=10;
  ctx.strokeStyle='rgba(255,255,255,.18)'; ctx.strokeRect(fx,fy,fw,fh);
  ctx.fillStyle='rgba(52,211,153,.55)'; ctx.fillRect(fx,fy,fw*(s.fuel/100),fh);
  ctx.fillStyle='rgba(255,255,255,.80)'; ctx.font='11px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText('fuel', fx+fw+10, fy+9);

  // wind indicator
  const ax=W-170, ay=18, wlen=95*wind;
  ctx.strokeStyle='rgba(52,211,153,.70)'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(ax+wlen,ay); ctx.stroke();
  ctx.fillStyle='rgba(52,211,153,.9)'; ctx.beginPath(); ctx.arc(ax+wlen,ay,5,0,Math.PI*2); ctx.fill();

  // stability check box
  if(s.checkOn){
    const angB = easyToggle.checked?0.20:0.17;
    const xBFrac = easyToggle.checked?0.13:0.11;
    const bx=W/2-(xBFrac*maxX), bw=2*(xBFrac*maxX);
    const by=H/2-90, bh=180;

    ctx.strokeStyle='rgba(52,211,153,.55)'; ctx.lineWidth=2;
    roundRect(bx,by,bw,bh,14); ctx.stroke();

    const need = easyToggle.checked?2.0:2.3;
    const p=clamp(s.checkProg/need,0,1);
    ctx.fillStyle='rgba(52,211,153,.20)';
    roundRect(bx+10, by+bh-22, (bw-20)*p, 10, 7); ctx.fill();

    ctx.fillStyle='rgba(255,255,255,.84)'; ctx.font='12px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText('STABILITY CHECK', bx+12, by+20);

    const centerY=by+bh/2;
    const tilt=clamp(s.ang/angB,-1,1);
    ctx.fillStyle='rgba(96,165,250,.75)'; ctx.fillRect(bx+bw+10, centerY-36, 4, 72);
    ctx.fillStyle='rgba(52,211,153,.9)'; ctx.fillRect(bx+bw+6, centerY + tilt*32 - 6, 12, 12);
  }

  // particles
  ctx.globalCompositeOperation='lighter';
  for(const p of s.parts){
    ctx.globalAlpha=clamp(p.life/0.45,0,1);
    ctx.fillStyle='rgba(96,165,250,.55)';
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';

  // rocket
  const rx=W/2+s.x, ry=H/2+36;
  ctx.save();
  ctx.translate(rx,ry); ctx.rotate(s.ang);

  ctx.fillStyle='rgba(229,231,235,.94)';
  roundRect(-14,-50,28,88,10); ctx.fill();
  ctx.fillStyle='rgba(96,165,250,.55)';
  ctx.beginPath(); ctx.arc(0,-18,7,0,Math.PI*2); ctx.fill();

  ctx.fillStyle='rgba(229,231,235,.96)';
  ctx.beginPath(); ctx.moveTo(-14,-50); ctx.lineTo(0,-76); ctx.lineTo(14,-50); ctx.closePath(); ctx.fill();

  ctx.fillStyle='rgba(251,113,133,.78)';
  ctx.beginPath(); ctx.moveTo(-14,26); ctx.lineTo(-34,48); ctx.lineTo(-14,48); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(14,26); ctx.lineTo(34,48); ctx.lineTo(14,48); ctx.closePath(); ctx.fill();

  // flames
  if(L && s.fuel>0) flame(-10,48,-1);
  if(R && s.fuel>0) flame( 10,48, 1);

  ctx.restore();

  // danger bar
  const maxAng=easyToggle.checked?0.82:0.76;
  const danger=Math.min(1, Math.abs(s.ang)/maxAng);
  if(running && danger>0.62){
    ctx.fillStyle=`rgba(251,113,133,${(danger-0.62)/0.38*0.85})`;
    ctx.fillRect(0,0,W,4);
  }
}

function flame(x,y,side){
  ctx.save(); ctx.translate(x,y); ctx.rotate(side*0.16);
  ctx.fillStyle='rgba(52,211,153,.82)';
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-4,18); ctx.lineTo(4,18); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function frame(now){
  tNow=now;
  const dt = clamp((now - tLast)/1000, 0, 0.033);
  tLast=now;
  if(running) update(dt);
  draw();
  if(running) requestAnimationFrame(frame);
}

// Share + reset
function buildShare(){
  const msg =
`🚀 Balance the Rocket
Time: ${fmt(lastT ?? 0)}  Score: ${Math.floor(lastS ?? 0)}
Checks: ${lastChecks ?? '—'}
Play: ${location.href}`;
  return msg;
}
shareBtn.addEventListener('click',()=>{
  navigator.clipboard?.writeText(buildShare()).catch(()=>{});
  beep(880,0.07,0.03);
});
resetBtn.addEventListener('click',()=>{
  localStorage.removeItem(STORE.bt);
  localStorage.removeItem(STORE.bs);
  bestT=0; bestS=0;
  bestTEl.textContent=fmt(bestT); bestSEl.textContent=Math.floor(bestS);
  beep(240,0.08,0.03);
});
startBtn.addEventListener('click',()=>{ if(!running) start(); });

resize();
showOverlay('start');