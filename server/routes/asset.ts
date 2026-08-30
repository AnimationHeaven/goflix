import { Router } from 'express';

const router = Router();

const UA =
  process.env.GOFILE_USER_AGENT ??
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Proxy Gofile CDN assets (thumbnails) with accountToken cookie.
 * GET /api/asset?url=https://store…/thumb_…&token=…
 */
router.get('/', async (req, res) => {
  const url = typeof req.query.url === 'string' ? req.query.url : '';
  const token =
    typeof req.query.token === 'string'
      ? req.query.token.trim()
      : typeof req.headers['x-gofile-token'] === 'string'
        ? String(req.headers['x-gofile-token']).trim()
        : '';

  if (!url || !/^https:\/\/([\w.-]+\.)?gofile\.io\//i.test(url)) {
    res.status(400).json({ error: 'invalid_url', message: 'Invalid asset URL.' });
    return;
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent': UA,
      Accept: 'image/*,*/*',
    };
    if (token) headers.Cookie = `accountToken=${token}`;

    const upstream = await fetch(url, { headers, redirect: 'follow' });
    if (!upstream.ok) {
      res.status(upstream.status === 404 ? 404 : 502).json({
        error: 'expired',
        message: 'Could not load thumbnail.',
      });
      return;
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    if (!upstream.body) {
      res.end();
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err) {
    console.error('[asset]', err);
    res.status(502).json({ error: 'unknown', message: 'Failed to proxy asset.' });
  }
});

export default router;
