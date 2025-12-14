const c=document.getElementById('c');
const ctx=c.getContext('2d',{alpha:false});
const wrap=document.getElementById('wrap');
const overlay=document.getElementById('overlay');

const bestSEl=document.getElementById('bestS');
const bestTEl=document.getElementById('bestT');
const lastEl=document.getElementById('last');
const lastSEl=document.getElementById('lastS');

const startBtn=document.getElementById('start');
const shareBtn=document.getElementById('share');
const resetBtn=document.getElementById('reset');
const soundToggle=document.getElementById('sound');
const dailyToggle=document.getElementById('daily');

const STORE={bs:'ra.orbit.bestStars', bt:'ra.orbit.bestTime', snd:'ra.orbit.snd', day:'ra.orbit.day'};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const len=(x,y)=>Math.hypot(x,y);
const fmt=t=>`${t.toFixed(1)}s`;

let dpr=1,W=0,H=0;
function resize(){
  dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
  const r=c.getBoundingClientRect();
  W=Math.floor(r.width); H=Math.floor(r.height);
  c.width=Math.floor(W*dpr); c.height=Math.floor(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize',resize);

// sound
let ac=null;
function ensureAudio(){ if(ac) return ac; const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return null; ac=new AC(); return ac; }
function beep(f,d=0.06,g=0.03){
  if(!soundToggle.checked) return;
  const a=ensureAudio(); if(!a) return;
  const o=a.createOscillator(), gg=a.createGain();
  o.type='sine'; o.frequency.value=f; gg.gain.value=g;
  o.connect(gg); gg.connect(a.destination);
  o.start(); o.stop(a.currentTime+d);
}

// seeded rng for daily mode
function xmur3(str){let h=1779033703^str.length;for(let i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=(h<<13)|(h>>>19);}return()=>{h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);return (h^=h>>>16)>>>0;};}
function sfc32(a,b,c,d){return()=>{a>>>=0;b>>>=0;c>>>=0;d>>>=0;let t=(a+b)|0;a=b^(b>>>9);b=(c+(c<<3))|0;c=(c<<21)|(c>>>11);d=(d+1)|0;t=(t+d)|0;c=(c+t)|0;return (t>>>0)/4294967296;};}
function makeRng(){
  if(!dailyToggle.checked) return Math.random;
  const now=new Date();
  const seedStr=`${now.getUTCFullYear()}-${now.getUTCMonth()+1}-${now.getUTCDate()}`;
  const seed=xmur3(seedStr);
  return sfc32(seed(),seed(),seed(),seed());
}

// persistence
let bestStars=Number(localStorage.getItem(STORE.bs)||'0')||0;
let bestTime =Number(localStorage.getItem(STORE.bt)||'0')||0;
bestSEl.textContent=bestStars;
bestTEl.textContent=fmt(bestTime);

soundToggle.checked=(localStorage.getItem(STORE.snd)||'0')==='1';
dailyToggle.checked=(localStorage.getItem(STORE.day)||'0')==='1';
soundToggle.addEventListener('change',()=>localStorage.setItem(STORE.snd, soundToggle.checked?'1':'0'));
dailyToggle.addEventListener('change',()=>localStorage.setItem(STORE.day, dailyToggle.checked?'1':'0'));

let lastTime=null,lastStars=null,lastHit='—';

let running=false, hold=false, tStart=0, tNow=0, tLast=0;
const s={
  rng:Math.random,
  cx:0, cy:0, planetR:110, atmR:160,
  x:0,y:0,vx:0,vy:0,
  mu:35000, boost:220, drag:0.0022,
  stars:[], debris:[], parts:[],
  goal:10, got:0, flash:0
};

function showOverlay(mode){
  overlay.style.display='flex';
  if(mode==='start'){
    document.getElementById('title').textContent='Orbit Hop';
    document.getElementById('desc').innerHTML=`Collect <b>${s.goal} stars</b>. Hold to thrust outward.`;
    startBtn.textContent='Start';
    lastEl.textContent = lastTime==null ? '—' : `${lastHit} • ${fmt(lastTime)}`;
    lastSEl.textContent = lastStars==null ? '—' : `${lastStars}`;
  }else if(mode==='gameover'){
    document.getElementById('title').textContent='Crashed 💥';
    document.getElementById('desc').innerHTML=`You hit <b>${lastHit}</b>. Try boosting near periapsis instead of spamming.`;
    startBtn.textContent='Try again';
    lastEl.textContent=`${lastHit} • ${fmt(lastTime??0)}`;
    lastSEl.textContent=`${lastStars??0}`;
  }else if(mode==='win'){
    document.getElementById('title').textContent='Objective complete ✅';
    document.getElementById('desc').innerHTML=`You collected <b>${s.goal} stars</b>! Keep going for a higher score.`;
    startBtn.textContent='Keep going';
  }
  bestSEl.textContent=bestStars;
  bestTEl.textContent=fmt(bestTime);
}
function hideOverlay(){ overlay.style.display='none'; }

function reset(){
  s.rng = makeRng();
  s.cx=W/2; s.cy=H/2+10;
  const scale=Math.min(W,H);
  s.planetR=Math.max(90, scale*0.18);
  s.atmR=s.planetR+Math.max(45, scale*0.08);

  const r0=s.atmR+Math.max(60, scale*0.10);
  s.x=s.cx+r0; s.y=s.cy;
  const v=Math.sqrt(s.mu/r0);
  s.vx=0; s.vy=-v;

  s.stars.length=0; s.debris.length=0; s.parts.length=0;
  s.got=0; s.flash=0;
  for(let i=0;i<6;i++) spawnStar();
}

function spawnStar(){
  const scale=Math.min(W,H);
  const r=s.atmR + scale*0.10 + s.rng()*(scale*0.18);
  const a=s.rng()*Math.PI*2;
  s.stars.push({x:s.cx+Math.cos(a)*r, y:s.cy+Math.sin(a)*r, r:7+s.rng()*5, p:s.rng()*10});
}
function spawnDebris(){
  const scale=Math.min(W,H);
  const r=s.atmR + scale*0.12 + s.rng()*(scale*0.26);
  const a=s.rng()*Math.PI*2;
  const x=s.cx+Math.cos(a)*r, y=s.cy+Math.sin(a)*r;
  const speed=120+s.rng()*160;
  const tx=-Math.sin(a), ty=Math.cos(a);
  const dir=s.rng()<0.5?-1:1;
  s.debris.push({x,y,vx:tx*speed*dir,vy:ty*speed*dir,r:9+s.rng()*10,life:8+s.rng()*6});
}
function addParts(x,y,n=18){
  for(let i=0;i<n;i++){
    const a=s.rng()*Math.PI*2, sp=80+s.rng()*220;
    s.parts.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:0.35+s.rng()*0.25,r:2+s.rng()*3});
  }
}

function start(){
  resize(); reset();
  if(soundToggle.checked){ const a=ensureAudio(); if(a && a.state==='suspended') a.resume?.(); }
  running=true; hideOverlay();
  tStart=performance.now(); tLast=tStart;
  requestAnimationFrame(frame);
}
function endRun(reason){
  running=false;
  lastTime=(tNow-tStart)/1000;
  lastStars=s.got;
  lastHit=reason;

  if(lastStars>bestStars){ bestStars=lastStars; localStorage.setItem(STORE.bs,String(bestStars)); }
  if(lastTime>bestTime){ bestTime=lastTime; localStorage.setItem(STORE.bt,String(bestTime)); }

  beep(140,0.12,0.04);
  showOverlay('gameover');
}

function update(dt){
  const t=(tNow-tStart)/1000;
  const dx=s.x-s.cx, dy=s.y-s.cy;
  const r=len(dx,dy)+1e-6;
  const ux=dx/r, uy=dy/r;

  // gravity
  const g=s.mu/(r*r);
  s.vx += (-ux*g)*dt;
  s.vy += (-uy*g)*dt;

  // thrust outward
  if(hold){
    s.vx += (ux*s.boost)*dt;
    s.vy += (uy*s.boost)*dt;
    if(Math.random()<dt*25){
      s.parts.push({x:s.x-ux*8,y:s.y-uy*8,vx:-ux*(90+s.rng()*60)+(s.rng()-0.5)*40,vy:-uy*(90+s.rng()*60)+(s.rng()-0.5)*40,life:0.18+s.rng()*0.18,r:1.6+s.rng()*2.2});
    }
  }

  s.vx *= (1-s.drag); s.vy *= (1-s.drag);
  s.x += s.vx*dt; s.y += s.vy*dt;

  if(r < s.atmR){ addParts(s.x,s.y,28); endRun('atmosphere'); return; }

  // spawn pacing
  const debrisRate = 0.18 + Math.min(0.55, t/45)*0.55;
  if(s.debris.length<10 && s.rng()<dt*debrisRate) spawnDebris();
  if(s.stars.length<8 && s.rng()<dt*0.22) spawnStar();

  // debris update/collision
  for(let i=s.debris.length-1;i>=0;i--){
    const d=s.debris[i];
    d.life-=dt; d.x+=d.vx*dt; d.y+=d.vy*dt;
    if(len(d.x-s.x,d.y-s.y) < d.r+10){ addParts(s.x,s.y,34); endRun('debris'); return; }
    if(d.life<=0) s.debris.splice(i,1);
  }

  // stars collect
  for(let i=s.stars.length-1;i>=0;i--){
    const st=s.stars[i];
    st.p += dt*4;
    if(len(st.x-s.x, st.y-s.y) < st.r+10){
      s.stars.splice(i,1);
      s.got++; s.flash=0.18;
      beep(760,0.05,0.03);
      if(s.got===s.goal) showOverlay('win');
    }
  }

  // particles
  for(let i=s.parts.length-1;i>=0;i--){
    const p=s.parts[i];
    p.life-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
    p.vx*=Math.exp(-dt*5.5); p.vy*=Math.exp(-dt*5.5);
    p.r *=Math.exp(-dt*6.2);
    if(p.life<=0||p.r<0.3) s.parts.splice(i,1);
  }
  s.flash *= Math.exp(-dt*5.0);
}

function drawStar(x,y,r1,r2){
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle='rgba(52,211,153,.85)';
  ctx.beginPath();
  const spikes=5;
  for(let i=0;i<spikes*2;i++){
    const rr=(i%2===0)?r1:r2;
    const a=(i/(spikes*2))*Math.PI*2 - Math.PI/2;
    ctx.lineTo(Math.cos(a)*rr, Math.sin(a)*rr);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawShip(x,y,vx,vy){
  const a=Math.atan2(vy,vx);
  ctx.save(); ctx.translate(x,y); ctx.rotate(a);
  ctx.fillStyle='rgba(229,231,235,.92)';
  ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(-10,-7); ctx.lineTo(-6,0); ctx.lineTo(-10,7); ctx.closePath(); ctx.fill();
  ctx.fillStyle='rgba(96,165,250,.55)'; ctx.beginPath(); ctx.arc(0,0,3.5,0,Math.PI*2); ctx.fill();
  if(hold){
    ctx.fillStyle='rgba(52,211,153,.80)';
    ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(-14,-3); ctx.lineTo(-14,3); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function draw(){
  ctx.fillStyle='#060a12'; ctx.fillRect(0,0,W,H);
  ctx.globalAlpha=0.75; ctx.fillStyle='rgba(255,255,255,.08)';
  for(let i=0;i<90;i++){
    const x=(i*97)%W, y=(i*193)%H, ssz=1+((i*31)%2);
    ctx.fillRect(x,y,ssz,ssz);
  }
  ctx.globalAlpha=1;

  // planet + atmosphere
  ctx.fillStyle='rgba(96,165,250,.10)'; ctx.beginPath(); ctx.arc(s.cx,s.cy,s.atmR,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(96,165,250,.16)'; ctx.beginPath(); ctx.arc(s.cx,s.cy,s.planetR,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(0,0,0,.20)'; ctx.beginPath(); ctx.arc(s.cx+s.planetR*0.25, s.cy+s.planetR*0.18, s.planetR*0.90, 0, Math.PI*2); ctx.fill();

  // debris
  ctx.strokeStyle='rgba(251,113,133,.75)'; ctx.lineWidth=2;
  for(const d of s.debris){ ctx.beginPath(); ctx.arc(d.x,d.y,d.r,0,Math.PI*2); ctx.stroke(); }

  // stars
  for(const st of s.stars){
    const p=0.65+0.35*Math.sin(st.p);
    drawStar(st.x, st.y, st.r*p, st.r*0.55*p);
  }

  // particles
  ctx.globalCompositeOperation='lighter';
  for(const p of s.parts){
    ctx.globalAlpha=clamp(p.life/0.45,0,1);
    ctx.fillStyle='rgba(52,211,153,.55)';
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';

  // ship
  drawShip(s.x,s.y,s.vx,s.vy);

  // flash on collect
  if(s.flash>0.01){ ctx.fillStyle=`rgba(52,211,153,${s.flash*0.45})`; ctx.fillRect(0,0,W,H); }

  // hud
  const t = running ? (tNow-tStart)/1000 : 0;
  ctx.fillStyle='rgba(255,255,255,.90)'; ctx.font='12px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText(`stars ${s.got}/${s.goal}   time ${fmt(t)}   mode ${dailyToggle.checked?'daily':'free'}`, 14, 20);
  ctx.fillStyle='rgba(163,163,163,.95)';
  ctx.fillText(`${hold?'BOOSTING':'coast'} (hold click/touch/space)`, 14, 38);
}

function frame(now){
  tNow=now;
  const dt=clamp((now-tLast)/1000,0,0.033);
  tLast=now;
  if(running) update(dt);
  draw();
  if(running) requestAnimationFrame(frame);
}

// inputs
function setHold(v){ hold=v; }
window.addEventListener('keydown',e=>{ if(e.repeat) return; if(e.key===' '||e.key==='Spacebar') setHold(true); if(e.key==='r'||e.key==='R'){ if(!running) start(); }});
window.addEventListener('keyup',e=>{ if(e.key===' '||e.key==='Spacebar') setHold(false); });
wrap.addEventListener('pointerdown',e=>{ if(overlay.style.display!=='none') return; e.preventDefault(); setHold(true); });
wrap.addEventListener('pointerup',e=>{ e.preventDefault(); setHold(false); });
wrap.addEventListener('pointercancel',()=>setHold(false));
wrap.addEventListener('pointerleave',()=>setHold(false));

// share/reset/start
shareBtn.addEventListener('click',()=>{
  const msg=`🪐 Orbit Hop\nStars: ${lastStars??0}  Time: ${fmt(lastTime??0)}\nMode: ${dailyToggle.checked?'Daily':'Free'}\nPlay: ${location.href}`;
  navigator.clipboard?.writeText(msg).catch(()=>{});
  beep(880,0.07,0.03);
});
resetBtn.addEventListener('click',()=>{
  localStorage.removeItem(STORE.bs); localStorage.removeItem(STORE.bt);
  bestStars=0; bestTime=0;
  bestSEl.textContent=bestStars; bestTEl.textContent=fmt(bestTime);
  beep(240,0.08,0.03);
  showOverlay('start');
});
startBtn.addEventListener('click',()=>{
  if(!running) start(); else hideOverlay();
});

resize();
showOverlay('start');