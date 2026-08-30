# GoFlix

Netflix-style streaming front-end for [Gofile.io](https://gofile.io) folders. Paste a folder link, browse videos/pictures/gifs, and stream from Gofile's CDN — nothing is re-hosted.

## Start (Windows)

**Double-click `Start GoFlix.vbs`** — starts the app in the background (no console) and opens http://localhost:5173/

**Double-click `Stop GoFlix.vbs`** — stops it.

First run needs Node.js installed and will run `npm install` if needed.

## Dev (terminal)

```bash
npm install
npm run dev
```

- Web UI: http://localhost:5173
- API: http://localhost:3001

## Account token

In the app: **Set account token** (from [gofile.io/myProfile](https://gofile.io/myProfile)). Stored in your browser only. If your token is your own account's, the landing page also offers a one-click **"Open My Library"** shortcut straight into your account's root folder.

Optional server env (`.env`):

| Variable | Purpose |
|----------|---------|
| `GOFILE_TOKEN` | Default account token for the API — also lets a packaged build auto-sign-in on launch |
| `GOFILE_WT_SALT` | Website-token salt if Gofile rotates it (default: `9844d94d963d30`) |
| `PORT` | API port (default `3001`) |

## Features

- Paste full `https://gofile.io/d/...` URLs or raw content IDs
- Password-protected folders
- Dark Netflix-style library with masonry picture/gif grids and virtualized video grids
- Videos, pictures, and gifs all supported, with proper thumbnails (not full downloads) in the grid
- "Include subfolders" — flattens an entire folder tree into one browsable list, with a persistent disk cache so repeat launches don't re-walk collections you've already scanned (Rescan button to force a fresh walk)
- Favorites, watched checkmarks, blur/reveal mode, shuffle, grid density toggle
- Sort by name/date/size/duration (duration and resolution are probed client-side and cached)
- Continue Watching with resumable playback position
- Custom video player + lightweight image/gif viewer, both with resolution display
- Authenticated stream proxy (Range seeking)

## Packaging a standalone .exe

```bash
npm run package:exe
```

Produces `release/GoFlix.exe` — a self-contained Windows executable (bundled Node runtime, no install required on the target machine) plus its `dist/` folder and hidden-window launcher scripts. Drop a `.env` with `GOFILE_TOKEN=...` next to the exe for a build that auto-signs in to that account.
