# Dead Frontier 1 — Weapon DPS Reference

A browser-based DPS calculator for Dead Frontier 1 weapons. Displays Base DPS and Sustained DPS for all weapons, with filters for weapon type, ammo, and special items, plus stat sliders for Reload, Dexterity, and Critical.

## Updating the weapon data snapshot

The live data source (`fairview.deadfrontier.com/dfdata/get_allstats.php`) blocks browser requests due to CORS, so the app loads `allstats_snapshot.txt` as its primary source. The live feed is only tried if the snapshot fails to load.

**When to update:** whenever the game receives a weapon balance patch or new weapons are added.

**How to update:**

1. Open this URL in your browser:
   ```
   https://fairview.deadfrontier.com/onlinezombiemmo/dfdata/get_allstats.php?printvars=1
   ```
2. Select all (`Ctrl+A`), copy (`Ctrl+C`).
3. Paste into `allstats_snapshot.txt`, replacing the entire file contents.
4. Save and reload the page — the status bar will confirm how many weapons loaded.

## Project structure

| File | Purpose |
|------|---------|
| `index.html` | Page markup |
| `style.css` | All styles |
| `df-data.js` | Constants, data parsing, weapon factory |
| `df-formulas.js` | Pure DPS formula functions |
| `app.js` | UI state, rendering, filters, event wiring |
| `allstats_snapshot.txt` | Local copy of game weapon data |

## Running locally

Any static file server works. With Python:

```
python -m http.server 5500
```

Then open `http://localhost:5500`.

> **Note:** opening `index.html` directly as a `file://` URL will block the snapshot fetch due to browser security restrictions. Always use a local server.
