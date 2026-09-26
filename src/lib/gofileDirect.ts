import type { FolderResponse, MediaType, NormalizedItem } from '../types';
import { FolderFetchError } from '../types';

/**
 * Calls Gofile's API directly from the browser instead of proxying through
 * GoFlix's own server. This exists because of a real, confirmed gap: a
 * plain Node.js server-side fetch to api.gofile.io gets rate-limited/
 * unauthorized far more aggressively than the exact same request made by an
 * actual browser tab — Gofile's anti-abuse layer checks things (TLS/JA3
 * fingerprint) that a spoofed User-Agent header can't fake from Node, but a
 * real browser's fetch naturally has. Confirmed side-by-side: a fresh guest
 * session through the server-side proxy got 401 then repeated 429s, while
 * the same folder loaded instantly with zero errors via a direct browser
 * request (and via plain gofile.io browsing). CORS was checked and is not
 * the blocker — api.gofile.io returns a readable status/body to a
 * cross-origin browser fetch from an arbitrary origin.
 *
 * `useFolder`/`useFolderStream` try this path first and only fall back to
 * the server-proxied `/api/folder` route if it throws — keeping the server
 * path alive as a safety net in case Gofile ever tightens CORS.
 */

const API_BASE = 'https://api.gofile.io';
const LANG = 'en-US';
const WT_SALT = '9844d94d963d30';
const GUEST_TOKEN_KEY = 'goflix:guest-token-client';

const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'mpg', 'mpeg', 'wmv', 'flv',
]);
const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'bmp', 'avif', 'svg', 'heic', 'heif', 'tif', 'tiff',
]);
const GIF_EXTENSION = 'gif';

interface GofileRawChild {
  id: string;
  name?: string;
  type?: string;
  mimeType?: string;
  mimetype?: string;
  size?: number;
  createTime?: number;
  modTime?: number;
  directLink?: string;
  link?: string;
  thumbnail?: string;
}

interface GofileRawContent {
  id: string;
  name?: string;
  type?: string;
  children?: Record<string, GofileRawChild>;
}

interface GofileApiResponse {
  status: string;
  data?: GofileRawContent & { token?: string };
}

/** Same HMAC formula Gofile's own frontend uses — built from the real
 * browser's own `navigator.userAgent` (a fetch call can't override the
 * actual User-Agent header anyway, so the token must be computed from the
 * value that will genuinely be sent, not a hardcoded string). */
async function generateWebsiteToken(accountToken: string): Promise<string> {
  const timeSlot = Math.floor(Date.now() / 1000 / 14400);
  const raw = `${navigator.userAgent}::${LANG}::${accountToken}::${timeSlot}::${WT_SALT}`;
  const encoded = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function mapStatusToFetchError(status: string): FolderFetchError {
  switch (status) {
    case 'error-notFound':
    case 'error-notFoundContent':
      return new FolderFetchError('not_found', 'Folder not found. The link may be invalid or removed.', 404);
    case 'error-passwordRequired':
      return new FolderFetchError('password_required', 'This folder is password-protected.', 401);
    case 'error-passwordWrong':
      return new FolderFetchError('wrong_password', 'Incorrect password.', 401);
    case 'error-rateLimit':
    case 'error-tooManyRequests':
      return new FolderFetchError('rate_limited', 'Gofile is rate-limiting requests. Hang tight and try again shortly.', 429);
    case 'error-expired':
    case 'error-notAvailable':
      return new FolderFetchError('expired', 'This folder or file is no longer available.', 410);
    case 'error-wrongToken':
    case 'error-notPremium':
    case 'error-notAuthorized':
      return new FolderFetchError('unauthorized', 'Unable to authenticate with Gofile. Try again in a moment.', 401);
    default:
      return new FolderFetchError('unknown', `Gofile returned an error: ${status}`, 502);
  }
}

async function apiFetchDirect(path: string, accountToken: string): Promise<GofileApiResponse> {
  const wt = await generateWebsiteToken(accountToken);
  const headers: HeadersInit = {
    Accept: 'application/json',
    'X-Website-Token': wt,
    'X-BL': LANG,
  };
  if (accountToken) headers['Authorization'] = `Bearer ${accountToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: path === '/accounts' ? 'POST' : 'GET',
      headers,
    });
  } catch (err) {
    throw new FolderFetchError(
      'unknown',
      'Could not reach Gofile directly from the browser.',
      503,
    );
  }

  if (res.status === 429) {
    const header = res.headers.get('retry-after');
    const seconds = header ? Number(header) : NaN;
    const retryAfterMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
    throw new FolderFetchError(
      'rate_limited',
      'Gofile is rate-limiting requests. Hang tight and try again shortly.',
      429,
      retryAfterMs,
    );
  }

  let body: GofileApiResponse;
  try {
    body = (await res.json()) as GofileApiResponse;
  } catch {
    throw new FolderFetchError('unknown', `Unexpected response from Gofile (${res.status}).`, 502);
  }
  return body;
}

function loadGuestToken(): string | null {
  try {
    return localStorage.getItem(GUEST_TOKEN_KEY);
  } catch {
    return null;
  }
}

function persistGuestToken(token: string): void {
  try {
    localStorage.setItem(GUEST_TOKEN_KEY, token);
  } catch {
    /* localStorage unavailable — token just won't persist across reloads */
  }
}

function clearGuestToken(): void {
  try {
    localStorage.removeItem(GUEST_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

let inFlightGuestToken: Promise<string> | null = null;

async function ensureGuestTokenDirect(): Promise<string> {
  const existing = loadGuestToken();
  if (existing) return existing;
  if (inFlightGuestToken) return inFlightGuestToken;

  inFlightGuestToken = (async () => {
    const body = await apiFetchDirect('/accounts', '');
    if (body.status !== 'ok' || !body.data?.token) {
      throw mapStatusToFetchError(body.status || 'unknown');
    }
    persistGuestToken(body.data.token);
    return body.data.token;
  })();

  try {
    return await inFlightGuestToken;
  } finally {
    inFlightGuestToken = null;
  }
}

function isVideoFile(name: string, mimeType?: string): boolean {
  if (mimeType?.startsWith('video/')) return true;
  const ext = name.split('.').pop()?.toLowerCase();
  return ext ? VIDEO_EXTENSIONS.has(ext) : false;
}

function isGifFile(name: string, mimeType?: string): boolean {
  if (mimeType?.toLowerCase() === 'image/gif') return true;
  const ext = name.split('.').pop()?.toLowerCase();
  return ext === GIF_EXTENSION;
}

function isImageFile(name: string, mimeType?: string): boolean {
  if (mimeType?.startsWith('image/')) return true;
  const ext = name.split('.').pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
}

function getMediaType(name: string, mimeType?: string): MediaType {
  if (isGifFile(name, mimeType)) return 'gif';
  if (isVideoFile(name, mimeType)) return 'video';
  if (isImageFile(name, mimeType)) return 'image';
  return 'other';
}

function normalizeChild(child: GofileRawChild): NormalizedItem {
  const type = child.type === 'folder' ? 'folder' : 'file';
  const mimeType = child.mimeType || child.mimetype;
  const item: NormalizedItem = {
    id: child.id,
    name: child.name || child.id,
    type,
    mimeType,
    size: child.size,
    createdAt: child.createTime ?? child.modTime,
  };
  if (type === 'file') {
    item.directLink = child.directLink || child.link;
    item.thumbnail = child.thumbnail;
    item.mediaType = getMediaType(item.name, mimeType);
    item.isVideo = item.mediaType === 'video';
  }
  return item;
}

function buildFolderResponse(id: string, name: string, children: NormalizedItem[]): FolderResponse {
  return {
    id,
    name,
    type: 'folder',
    children,
    videoCount: children.filter((c) => c.mediaType === 'video').length,
    imageCount: children.filter((c) => c.mediaType === 'image').length,
    gifCount: children.filter((c) => c.mediaType === 'gif').length,
    folderCount: children.filter((c) => c.type === 'folder').length,
    otherCount: children.filter((c) => c.type === 'file' && c.mediaType === 'other').length,
  };
}

function normalizeFolder(data: GofileRawContent): FolderResponse {
  const children = Object.values(data.children ?? {}).map(normalizeChild);
  children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return buildFolderResponse(data.id, data.name || data.id, children);
}

/** Direct-from-browser equivalent of the server's fetchFolderRaw+getFolder.
 * Retries once with a fresh guest token on an auth error, same as the
 * server does — a guest token can go stale between page loads. */
export async function fetchFolderDirect(
  contentId: string,
  passwordHash?: string,
  accountToken?: string,
): Promise<FolderResponse> {
  const token = accountToken?.trim() || (await ensureGuestTokenDirect());
  const params = new URLSearchParams({
    contentFilter: '',
    page: '1',
    pageSize: '1000',
    sortField: 'name',
    sortDirection: '1',
  });
  if (passwordHash) params.set('password', passwordHash);

  const body = await apiFetchDirect(`/contents/${encodeURIComponent(contentId)}?${params}`, token);

  if (body.status !== 'ok' || !body.data) {
    if (
      (body.status === 'error-wrongToken' || body.status === 'error-notPremium') &&
      !accountToken
    ) {
      clearGuestToken();
      const freshToken = await ensureGuestTokenDirect();
      const retryBody = await apiFetchDirect(`/contents/${encodeURIComponent(contentId)}?${params}`, freshToken);
      if (retryBody.status !== 'ok' || !retryBody.data) {
        throw mapStatusToFetchError(retryBody.status || 'unknown');
      }
      return normalizeFolder(retryBody.data);
    }
    throw mapStatusToFetchError(body.status || 'unknown');
  }

  return normalizeFolder(body.data);
}
