import { Router } from 'express';
import { resolveDirectLink } from '../gofileClient.js';
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
  // <video src> cannot set custom headers — allow token as query param
  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return undefined;
}

/**
 * Range-aware stream proxy. Gofile CDN requires Cookie: accountToken=…
 * which a raw <video src="https://store…"> cannot send.
 */
router.get('/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const password = typeof req.query.password === 'string' ? req.query.password : undefined;
  const accountToken = readToken(req);
  const linkOverride =
    typeof req.query.link === 'string' && req.query.link.startsWith('https://')
      ? req.query.link
      : undefined;

  if (!fileId || !/^[a-zA-Z0-9-]+$/.test(fileId)) {
    res.status(400).json({ error: 'invalid_id', message: 'Invalid file ID.' });
    return;
  }

  try {
    let directLink = linkOverride;
    let name = fileId;
    let mimeType: string | undefined;

    if (!directLink) {
      const resolved = await resolveDirectLink(fileId, password, accountToken);
      directLink = resolved.directLink;
      name = resolved.name;
      mimeType = resolved.mimeType;
    }

    const headers: Record<string, string> = {
      'User-Agent': UA,
      Accept: '*/*',
    };
    if (accountToken) {
      headers.Cookie = `accountToken=${accountToken}`;
    }
    if (req.headers.range) {
      headers.Range = String(req.headers.range);
    }

    const upstream = await fetch(directLink, {
      headers,
      redirect: 'manual',
    });

    // Follow one redirect if cookie was missing on first hop
    let response = upstream;
    if (
      (upstream.status === 301 || upstream.status === 302 || upstream.status === 303) &&
      upstream.headers.get('location')
    ) {
      const loc = upstream.headers.get('location')!;
      response = await fetch(loc, {
        headers,
        redirect: 'follow',
      });
    }

    if (
      response.status === 403 ||
      response.status === 404 ||
      response.status === 410 ||
      response.status === 302
    ) {
      res.status(410).json({
        error: 'expired',
        message:
          'This file is no longer available or needs an account token. Set your token and reload.',
      });
      return;
    }

    res.status(response.status);
    const passThrough = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'cache-control',
    ];
    for (const h of passThrough) {
      const v = response.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!res.getHeader('content-type') && mimeType) {
      res.setHeader('Content-Type', mimeType);
    }
    // Prefer inline so <video> can play instead of forcing download
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    );

    if (!response.body) {
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise<void>((resolve) => res.once('drain', resolve));
        }
      }
      res.end();
    };

    req.on('close', () => {
      reader.cancel().catch(() => undefined);
    });

    await pump();
  } catch (err) {
    if (err instanceof GofileApiError) {
      res
        .status(err.status)
        .json({ error: err.code, message: err.message, retryAfterMs: err.retryAfterMs });
      return;
    }
    console.error('[stream] unexpected error', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'unknown',
        message: 'Failed to proxy video stream.',
      });
    }
  }
});

export default router;
