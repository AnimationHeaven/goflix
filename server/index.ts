import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import folderRouter from './routes/folder.js';
import streamRouter from './routes/stream.js';
import assetRouter from './routes/asset.js';
import accountRouter from './routes/account.js';
import mkvRouter from './routes/mkv.js';
import { ensureGuestToken } from './gofileClient.js';

// esbuild empties out import.meta.url when bundling to CJS (needed for the
// packaged SEA binary), so this only resolves correctly under real ESM
// execution (tsx). In the packaged exe, process.execPath *is* the exe
// itself, so its directory is exactly where dist/ was copied alongside it.
function resolveHereDir(): string {
  try {
    const url = import.meta.url;
    if (url) return dirname(fileURLToPath(url));
  } catch {
    /* import.meta.url unavailable — bundled CJS build, fall through */
  }
  return dirname(process.execPath);
}
const here = resolveHereDir();

// tsx's `--env-file=.env` isn't available to a packaged binary, so load it
// ourselves — explicitly from next to the executable, not from cwd.
// Double-clicking a Windows .exe happens to set cwd to its own folder, but
// that's not guaranteed (a shortcut can override "Start in"), and macOS's
// Finder/LaunchServices usually does NOT set cwd to the .app's own folder
// at all. Loading by explicit path works the same regardless of platform
// or how the process was launched. No-ops quietly if there's no .env yet.
try {
  process.loadEnvFile(join(here, '.env'));
} catch {
  /* no .env present — fine, GOFILE_TOKEN etc. are all optional */
}

const PORT = Number(process.env.PORT ?? 3001);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'goflix' });
});

app.use('/api/folder', folderRouter);
app.use('/api/stream', streamRouter);
app.use('/api/asset', assetRouter);
app.use('/api/account', accountRouter);
app.use('/api/mkv', mkvRouter);

// Lets the UI shut the server down without needing to find/close its
// console window — the closest thing to a "quit" button a plain Express
// process has. Responds first, then closes shortly after so the client
// actually gets the reply before the connection drops.
app.post('/api/shutdown', (_req, res) => {
  res.json({ ok: true });
  console.log('[server] Shutdown requested from the UI.');
  setTimeout(() => {
    httpServer?.close();
    process.exit(0);
  }, 150);
});

// Serves the built frontend when running standalone (packaged exe, or a
// `vite build` sitting next to the server). In normal `npm run dev` no
// dist/ exists yet, so this quietly finds nothing and no-ops — Vite's own
// dev server on :5173 handles the frontend instead.
const staticDir = [join(here, 'dist'), join(here, '..', 'dist')].find((p) =>
  existsSync(join(p, 'index.html')),
);
if (staticDir) {
  app.use(express.static(staticDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(join(staticDir, 'index.html'));
  });
}

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('[server] unhandled', err);
    res.status(500).json({ error: 'unknown', message: 'Internal server error.' });
  },
);

let httpServer: ReturnType<typeof app.listen> | undefined;

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.warn('[server] Could not auto-open browser:', err.message);
  });
}

async function start() {
  try {
    await ensureGuestToken();
  } catch (err) {
    console.warn('[server] Could not pre-acquire guest token (will retry on demand):', err);
  }

  httpServer = app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`[server] GoFlix listening on ${url}${staticDir ? ' (serving built UI)' : ''}`);

    // Only auto-open when running as the packaged standalone binary — not
    // on every `npm run dev`/`npm start`.
    import('node:sea')
      .then((sea) => {
        if (sea.isSea() && staticDir) openBrowser(url);
      })
      .catch(() => {
        /* node:sea unavailable — not running as SEA, nothing to do */
      });
  });
}

start();
