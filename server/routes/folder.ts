import { Router } from 'express';
import { getFolder, streamFolderFlat } from '../gofileClient.js';
import { GofileApiError } from '../types.js';

const router = Router();

function clientToken(req: { headers: Record<string, unknown> }): string | undefined {
  const raw = req.headers['x-gofile-token'];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].trim()) {
    return raw[0].trim();
  }
  return undefined;
}

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const password = typeof req.query.password === 'string' ? req.query.password : undefined;
  const accountToken = clientToken(req);

  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
    res.status(400).json({
      error: 'invalid_id',
      message: 'Invalid Gofile content ID.',
    });
    return;
  }

  try {
    const folder = await getFolder(id, password, accountToken);
    console.log(
      `[folder] ${id} → "${folder.name}" (${folder.videoCount} videos, ${folder.imageCount} images, ${folder.gifCount} gifs, ${folder.folderCount} folders, ${folder.otherCount} other)${accountToken ? ' [user token]' : ''}`,
    );
    res.json(folder);
  } catch (err) {
    if (err instanceof GofileApiError) {
      res.status(err.status).json({
        error: err.code,
        message: err.message,
        retryAfterMs: err.retryAfterMs,
      });
      return;
    }
    console.error('[folder] unexpected error', err);
    res.status(500).json({
      error: 'unknown',
      message: 'Internal server error while fetching folder.',
    });
  }
});

/**
 * Progressive subfolder-flatten stream — newline-delimited JSON so the
 * client can render items as they arrive instead of waiting for the whole
 * (potentially many-subfolder) walk to finish. See streamFolderFlat.
 */
router.get('/:id/stream', async (req, res) => {
  const { id } = req.params;
  const password = typeof req.query.password === 'string' ? req.query.password : undefined;
  const accountToken = clientToken(req);
  const forceRescan = req.query.rescan === '1' || req.query.rescan === 'true';

  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
    res.status(400).json({
      error: 'invalid_id',
      message: 'Invalid Gofile content ID.',
    });
    return;
  }

  let clientClosed = false;
  req.on('close', () => {
    clientClosed = true;
  });

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  let sentAny = false;
  let totalFiles = 0;

  try {
    const { id: rootId, name } = await streamFolderFlat(
      id,
      password,
      accountToken,
      (batch) => {
        if (clientClosed) return;
        sentAny = true;
        totalFiles += batch.length;
        res.write(`${JSON.stringify({ type: 'batch', items: batch })}\n`);
      },
      forceRescan,
    );
    if (!clientClosed) {
      res.write(`${JSON.stringify({ type: 'done', id: rootId, name })}\n`);
      console.log(
        `[folder] ${id} → "${name}" [streamed, ${totalFiles} files]${forceRescan ? ' [rescan]' : ''}${accountToken ? ' [user token]' : ''}`,
      );
      res.end();
    }
  } catch (err) {
    if (!sentAny) {
      if (err instanceof GofileApiError) {
        res
          .status(err.status)
          .json({ error: err.code, message: err.message, retryAfterMs: err.retryAfterMs });
        return;
      }
      console.error('[folder/stream] unexpected error', err);
      res.status(500).json({
        error: 'unknown',
        message: 'Internal server error while fetching folder.',
      });
      return;
    }
    // Headers already sent — surface the failure as a final NDJSON line.
    const code = err instanceof GofileApiError ? err.code : 'unknown';
    const message =
      err instanceof GofileApiError ? err.message : 'Failed while streaming folder contents.';
    const retryAfterMs = err instanceof GofileApiError ? err.retryAfterMs : undefined;
    res.write(`${JSON.stringify({ type: 'error', error: code, message, retryAfterMs })}\n`);
    res.end();
  }
});

export default router;
