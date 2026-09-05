import { Router } from 'express';
import { resolveAccountRoot } from '../gofileClient.js';
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

/**
 * Resolves the caller's Gofile account token to their own root folder, so
 * the UI can offer "open my library" instead of requiring a pasted link.
 * Falls back to the server's own configured GOFILE_TOKEN when the client
 * doesn't send one — see resolveAccountRoot.
 */
router.get('/root', async (req, res) => {
  try {
    const { rootFolderId, email, tier } = await resolveAccountRoot(clientToken(req));
    res.json({ rootFolderId, email, tier });
  } catch (err) {
    if (err instanceof GofileApiError) {
      res
        .status(err.status)
        .json({ error: err.code, message: err.message, retryAfterMs: err.retryAfterMs });
      return;
    }
    console.error('[account] unexpected error', err);
    res.status(500).json({ error: 'unknown', message: 'Internal server error.' });
  }
});

/**
 * Tells the client whether this server has its own configured account token
 * (a standalone build shipped with a .env) — never the raw value of a token
 * the client sent, only the server's own local config. Lets a personalized
 * build auto-adopt its owner's token client-side with no manual entry.
 */
router.get('/default-token', (_req, res) => {
  res.json({ token: process.env.GOFILE_TOKEN?.trim() || null });
});

export default router;
