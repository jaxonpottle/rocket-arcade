# Rocket Arcade (static)

## Run locally
The homepage uses `fetch()` for `games/games.json`, so you need a local server (not `file://`).

### Python
- Windows: `py -m http.server 8000`
- Mac/Linux: `python3 -m http.server 8000`

Then open `http://localhost:8000`.

## Deploy (GitHub Pages)
Repo Settings → Pages → Deploy from branch → `main` + `/ (root)`.

## Add a new game
Copy `games/_template/` → `games/<your-game-id>/`, then add it to `games/games.json`.