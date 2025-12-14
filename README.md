# Rocket Arcade (static)

A tiny, clean game hub you can host anywhere (including GitHub Pages).

## Run locally
Because this uses `fetch()` for `games/games.json`, you need a local server.

### Option A (quick): Python
1. Open a terminal in the `rocket-arcade/` folder
2. Run:
   - **Windows:** `py -m http.server 8000`
   - **Mac/Linux:** `python3 -m http.server 8000`
3. Open: `http://localhost:8000`

### Option B (best dev experience): Vite
1. Install Node.js
2. In the `rocket-arcade/` folder:
   - `npm create vite@latest` is optional — this repo already works as-is.
   - If you want hot reload, you can wrap it with Vite later.

## Add a new game
1. Copy `games/_template/` → `games/<your-game-id>/`
2. Edit `games/<your-game-id>/index.html` and `game.js`
3. Add an entry to `games/games.json`:

```json
{
  "id": "your-game-id",
  "title": "Your Game Title",
  "description": "One-line hook.",
  "path": "games/your-game-id/index.html",
  "tag": "quick game",
  "time": "30–120s"
}
```

That’s it — it will appear on the homepage.

## Deploy (GitHub Pages)
1. Create a GitHub repo and push this folder
2. In repo settings → Pages → set source to `main` branch and `/root`
3. Your site will be live.

## Notes
- High scores are stored in `localStorage` (per browser).
- Keep games lightweight: single canvas, simple input, instant restart.

Have fun.
