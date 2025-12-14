const grid = document.getElementById('gamesGrid');
const count = document.getElementById('gameCount');

async function loadGames(){
  const res = await fetch('./games/games.json', { cache: 'no-store' });
  const games = await res.json();

  count.textContent = `${games.length} game${games.length === 1 ? '' : 's'}`;

  grid.innerHTML = games.map(g => `
    <article class="card">
      <div class="card-top">
        <div class="tag">${g.tag ?? 'arcade'}</div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${g.title}</h3>
        <p class="card-desc">${g.description}</p>
        <div class="card-actions">
          <a class="btn" href="./${g.path}">Play ▶</a>
          <span class="muted" style="font-size:12px;">${g.time ?? '30–120s'}</span>
        </div>
      </div>
    </article>
  `).join('');
}

loadGames().catch(err => {
  console.error(err);
  count.textContent = 'Error';
  grid.innerHTML = `<div class="muted">Could not load games.json. Run via a server (GitHub Pages is fine). If local, don’t use file://.</div>`;
});