// New Game Template – minimal canvas starter
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });

let dpr = 1, W = 0, H = 0;

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

function draw(){
  ctx.fillStyle = '#070b12';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.font = '16px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText('Your game goes here', 16, 28);
}

resize();
draw();
