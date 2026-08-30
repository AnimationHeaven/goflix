import { createReadStream, statSync } from 'node:fs';
import { Router } from 'express';
import { resolveDirectLink } from '../gofileClient.js';
import { checkRemuxable, getJobError, getJobStatus, remuxedFilePath, startRemuxJob } from '../mkvRemux.js';
import { GofileApiError } from '../types.js';

const router = Router();

const UA =
  process.env.GOFILE_USER_AGENT ??
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function readToken(req: {
  headers: Record<string, unknown>;
  query: Record<string, unknown>;
}): string | undefined {
  const header = req.headers['x-gofile-token'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  if (Array.isArray(header) && typeof header[0] === 'string' && header[0].trim()) {
    return header[0].trim();
  }
  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return undefined;
}

async function resolveSource(req: Parameters<typeof readToken>[0] & { params: { fileId: string } }) {
  const { fileId } = req.params;
  const password = typeof req.query.password === 'string' ? req.query.password : undefined;
  const accountToken = readToken(req);
  const { directLink } = await resolveDirectLink(fileId, password, accountToken);
  const headers: Record<string, string> = { 'User-Agent': UA };
  if (accountToken) headers.Cookie = `accountToken=${accountToken}`;
  return { directLink, headers };
}

/** Is this MKV's inner video/audio codecs something ffmpeg can remux
 * into a browser-playable MP4 without re-encoding? */
router.get('/:fileId/check', async (req, res) => {
  try {
    const { directLink, headers } = await resolveSource(req);
    const result = await checkRemuxable(directLink, headers);
    res.json(result);
  } catch (err) {
    if (err instanceof GofileApiError) {
      res.status(err.status).json({ remuxable: false, reason: err.message });
      return;
    }
    console.error('[mkv] check failed', err);
    res.status(500).json({ remuxable: false, reason: 'Could not check this file.' });
  }
});

/** Kicks off a background remux (no-ops if already cached or in progress). */
router.post('/:fileId/prepare', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { directLink, headers } = await resolveSource(req);
    startRemuxJob(fileId, directLink, headers);
    res.json({ status: getJobStatus(fileId) });
  } catch (err) {
    if (err instanceof GofileApiError) {
      res.status(err.status).json({ status: 'error', message: err.message });
      return;
    }
    console.error('[mkv] prepare failed', err);
    res.status(500).json({ status: 'error', message: 'Could not start remux.' });
  }
});

router.get('/:fileId/status', (req, res) => {
  const { fileId } = req.params;
  const status = getJobStatus(fileId);
  res.json({ status, error: status === 'error' ? getJobError(fileId) : undefined });
});

/** Serves the cached remuxed MP4 with manual Range support (seeking) —
 * streamed by hand rather than via res.sendFile, which threw inside the
 * packaged SEA binary for reasons that never surfaced in a log (the
 * packaged exe has no visible console). This is the same pattern already
 * proven in routes/stream.ts. */
router.get('/:fileId/file', (req, res) => {
  const path = remuxedFilePath(req.params.fileId);
  if (!path) {
    res.status(404).json({ error: 'not_ready', message: 'Remux not ready yet.' });
    return;
  }

  let size: number;
  try {
    size = statSync(path).size;
  } catch (err) {
    console.error('[mkv] stat failed', err);
    res.status(500).json({ error: 'unknown', message: 'Could not read the converted file.' });
    return;
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');

  const range = req.headers.range;
  let start = 0;
  let end = size - 1;
  let status = 200;

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      if (match[1]) start = Number(match[1]);
      if (match[2]) end = Number(match[2]);
      if (start > end || end >= size) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
        return;
      }
      status = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    }
  }

  res.status(status);
  res.setHeader('Content-Length', String(end - start + 1));

  const stream = createReadStream(path, { start, end });
  stream.on('error', (err) => {
    console.error('[mkv] stream error', err);
    if (!res.headersSent) res.status(500);
    res.end();
  });
  req.on('close', () => stream.destroy());
  stream.pipe(res);
});

export default router;
