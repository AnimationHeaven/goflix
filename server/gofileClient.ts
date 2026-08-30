import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  FolderResponse,
  GofileApiResponse,
  GofileRawChild,
  MediaType,
  NormalizedItem,
} from './types.js';
import { GofileApiError } from './types.js';

const API_BASE = 'https://api.gofile.io';
const USER_AGENT =
  process.env.GOFILE_USER_AGENT ??
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LANG = 'en-US';
const WT_SALT = process.env.GOFILE_WT_SALT ?? '9844d94d963d30';
const CACHE_TTL_MS = 2 * 60 * 1000;
const TOKEN_FILE = join(process.cwd(), '.gofile-token');
const CACHE_DIR = join(process.cwd(), '.goflix-cache');
const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mkv',
  'webm',
  'mov',
  'avi',
  'm4v',
  'mpg',
  'mpeg',
  'wmv',
  'flv',
]);
const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'bmp',
  'avif',
  'svg',
  'heic',
  'heif',
  'tif',
  'tiff',
]);
const GIF_EXTENSION = 'gif';

// Recursive "flatten subfolders" fetch is bounded so a deep/huge tree can't
// hammer Gofile's guest rate limiter or balloon memory.
const FLATTEN_MAX_FOLDERS = 60;
const FLATTEN_MAX_FILES = 4000;
const FLATTEN_CONCURRENCY = 4;

interface CacheEntry {
  expires: number;
  data: FolderResponse;
}

function loadPersistedToken(): string | null {
  if (process.env.GOFILE_TOKEN) return process.env.GOFILE_TOKEN;
  try {
    if (existsSync(TOKEN_FILE)) {
      const t = readFileSync(TOKEN_FILE, 'utf8').trim();
      if (t) return t;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function persistToken(token: string): void {
  try {
    writeFileSync(TOKEN_FILE, token, 'utf8');
  } catch (err) {
    console.warn('[gofile] Could not persist token to disk:', err);
  }
}

interface PersistedFlatten {
  version: 1;
  rootName: string;
  files: NormalizedItem[];
  /** Subfolder IDs already fully walked — trusted as-is, never re-scanned. */
  scannedFolderIds: string[];
  updatedAt: number;
}

function flattenCachePath(contentId: string): string {
  // contentId is validated as [a-zA-Z0-9-]+ by the route before it ever
  // reaches here, so it's safe to use directly in a filename.
  return join(CACHE_DIR, `flatten-${contentId}.json`);
}

/** Survives process restarts — the whole point being repeat launches of a
 * many-subfolder library (e.g. 165 collections) don't re-walk from scratch. */
function loadFlattenCache(contentId: string): PersistedFlatten | null {
  try {
    const raw = readFileSync(flattenCachePath(contentId), 'utf8');
    const parsed = JSON.parse(raw) as PersistedFlatten;
    if (parsed.version !== 1 || !Array.isArray(parsed.files)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveFlattenCache(contentId: string, data: PersistedFlatten): void {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(flattenCachePath(contentId), JSON.stringify(data), 'utf8');
  } catch (err) {
    console.warn('[gofile] Could not persist flatten cache to disk:', err);
  }
}

// Deliberately NOT `loadPersistedToken()` called eagerly here: ES module
// imports are fully evaluated before the importing file's own top-level
// code runs, so if this ran at import time it could read process.env
// *before* index.ts's process.loadEnvFile() populates it from .env. Checked
// lazily on first real use instead, by which point startup has finished.
let guestToken: string | null = null;
let checkedPersistedToken = false;
const folderCache = new Map<string, CacheEntry>();

function generateWebsiteToken(accountToken: string): string {
  const timeSlot = Math.floor(Date.now() / 1000 / 14400);
  const raw = `${USER_AGENT}::${LANG}::${accountToken}::${timeSlot}::${WT_SALT}`;
  return createHash('sha256').update(raw).digest('hex');
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

function mapStatusToError(status: string): GofileApiError {
  switch (status) {
    case 'error-notFound':
    case 'error-notFoundContent':
      return new GofileApiError(
        'not_found',
        'Folder not found. The link may be invalid or removed.',
        404,
      );
    case 'error-passwordRequired':
      return new GofileApiError(
        'password_required',
        'This folder is password-protected.',
        401,
      );
    case 'error-passwordWrong':
      return new GofileApiError('wrong_password', 'Incorrect password.', 401);
    case 'error-rateLimit':
    case 'error-tooManyRequests':
      return new GofileApiError(
        'rate_limited',
        'Gofile is rate-limiting requests. Hang tight and try again shortly.',
        429,
      );
    case 'error-expired':
    case 'error-notAvailable':
      return new GofileApiError(
        'expired',
        'This folder or file is no longer available.',
        410,
      );
    case 'error-wrongToken':
    case 'error-notPremium':
    case 'error-notAuthorized':
      return new GofileApiError(
        'unauthorized',
        'Unable to authenticate with Gofile. Try again in a moment.',
        401,
      );
    default:
      return new GofileApiError(
        'unknown',
        `Gofile returned an error: ${status}`,
        502,
      );
  }
}

async function apiFetch<T = GofileApiResponse>(
  path: string,
  options: RequestInit = {},
  accountToken = '',
): Promise<T> {
  const wt = generateWebsiteToken(accountToken);
  const headers = new Headers(options.headers);
  headers.set('User-Agent', USER_AGENT);
  headers.set('X-Website-Token', wt);
  headers.set('X-BL', LANG);
  headers.set('Accept', 'application/json');
  if (accountToken) {
    headers.set('Authorization', `Bearer ${accountToken}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[gofile] network error', msg);
    throw new GofileApiError(
      'unknown',
      'Could not reach Gofile (network timeout or blocked). Check your connection and try again.',
      503,
    );
  }

  if (res.status === 429) {
    throw new GofileApiError(
      'rate_limited',
      'Gofile is rate-limiting requests. Hang tight and try again shortly.',
      429,
    );
  }

  let body: T;
  try {
    body = (await res.json()) as T;
  } catch {
    throw new GofileApiError(
      'unknown',
      `Unexpected response from Gofile (${res.status}).`,
      502,
    );
  }

  return body;
}

export async function ensureGuestToken(): Promise<string> {
  if (!checkedPersistedToken) {
    checkedPersistedToken = true;
    guestToken = loadPersistedToken();
  }
  if (guestToken) return guestToken;

  // Fail fast on rate-limit instead of blocking this request for tens of
  // seconds — the client already has its own backoff/retry loop, so
  // stacking a second, blocking retry here just makes every caller hang
  // (and still hammers /accounts once the client retries anyway).
  const body = await apiFetch('/accounts', { method: 'POST' }, '');
  if (body.status !== 'ok' || !body.data?.token) {
    throw mapStatusToError(body.status || 'unknown');
  }
  guestToken = body.data.token;
  persistToken(guestToken);
  console.log('[gofile] Guest account token acquired and persisted');
  return guestToken;
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

function normalizeFolder(data: NonNullable<GofileApiResponse['data']>): FolderResponse {
  const children = Object.values(data.children ?? {}).map(normalizeChild);
  children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return buildFolderResponse(data.id, data.name || data.id, children);
}

function buildFolderResponse(
  id: string,
  name: string,
  children: NormalizedItem[],
): FolderResponse {
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

function cacheKey(id: string, passwordHash?: string, accountToken?: string): string {
  const tok = accountToken ? accountToken.slice(-8) : 'default';
  return `${id}::${passwordHash ?? ''}::${tok}`;
}

/** Prefer per-request token from the frontend, then env/disk, then guest. */
async function resolveToken(override?: string): Promise<string> {
  const fromClient = override?.trim();
  if (fromClient) return fromClient;
  return ensureGuestToken();
}

/** Fetches one folder's raw contents page, retrying once with a fresh guest token on auth errors. */
async function fetchFolderRaw(
  contentId: string,
  passwordHash: string | undefined,
  accountToken: string | undefined,
): Promise<NonNullable<GofileApiResponse['data']>> {
  const token = await resolveToken(accountToken);
  const params = new URLSearchParams({
    contentFilter: '',
    page: '1',
    pageSize: '1000',
    sortField: 'name',
    sortDirection: '1',
  });
  if (passwordHash) {
    params.set('password', passwordHash);
  }

  const body = await apiFetch(
    `/contents/${encodeURIComponent(contentId)}?${params}`,
    { method: 'GET' },
    token,
  );

  if (body.status !== 'ok' || !body.data) {
    // Token may have gone stale — clear and retry once on auth errors (guest only)
    if (
      (body.status === 'error-wrongToken' || body.status === 'error-notPremium') &&
      !accountToken &&
      !process.env.GOFILE_TOKEN
    ) {
      guestToken = null;
      try {
        if (existsSync(TOKEN_FILE)) writeFileSync(TOKEN_FILE, '', 'utf8');
      } catch {
        /* ignore */
      }
      const freshToken = await ensureGuestToken();
      const retry = await apiFetch(
        `/contents/${encodeURIComponent(contentId)}?${params}`,
        { method: 'GET' },
        freshToken,
      );
      if (retry.status !== 'ok' || !retry.data) {
        throw mapStatusToError(retry.status || 'unknown');
      }
      return retry.data;
    }
    throw mapStatusToError(body.status || 'unknown');
  }

  return body.data;
}

export async function getFolder(
  contentId: string,
  passwordHash?: string,
  accountToken?: string,
): Promise<FolderResponse> {
  const key = cacheKey(contentId, passwordHash, accountToken);
  const cached = folderCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const data = await fetchFolderRaw(contentId, passwordHash, accountToken);

  if (data.type !== 'folder') {
    // Single file shared as content — wrap as a synthetic folder
    const file = normalizeChild(data as unknown as GofileRawChild);
    const wrapped = buildFolderResponse(file.id, file.name, [file]);
    folderCache.set(key, { expires: Date.now() + CACHE_TTL_MS, data: wrapped });
    return wrapped;
  }

  const normalized = normalizeFolder(data);
  folderCache.set(key, { expires: Date.now() + CACHE_TTL_MS, data: normalized });
  return normalized;
}

/**
 * Walks every subfolder under contentId and merges all files into one flat
 * listing — e.g. so an "animations" folder full of nested subfolders shows
 * as a single browsable list instead of requiring manual navigation.
 * Bounded by FLATTEN_MAX_FOLDERS/FLATTEN_MAX_FILES to protect Gofile's rate limits.
 *
 * Streams results via onBatch as each subfolder resolves, rather than making
 * the caller wait for the entire tree. Backed by a disk cache keyed on
 * contentId (survives process restarts): a repeat walk emits everything
 * already known instantly, then only visits subfolders it's never scanned
 * before — an existing collection's contents are trusted as-is and never
 * re-fetched, so a library with hundreds of collections doesn't re-walk the
 * whole tree every single launch. Pass forceRescan to bypass this and treat
 * every subfolder as unseen (e.g. a user-triggered "rescan").
 */
export async function streamFolderFlat(
  contentId: string,
  passwordHash: string | undefined,
  accountToken: string | undefined,
  onBatch: (files: NormalizedItem[]) => void,
  forceRescan = false,
): Promise<{ id: string; name: string }> {
  const key = `flat::${cacheKey(contentId, passwordHash, accountToken)}`;
  const memCached = !forceRescan ? folderCache.get(key) : undefined;
  if (memCached && memCached.expires > Date.now()) {
    if (memCached.data.children.length > 0) onBatch(memCached.data.children);
    return { id: memCached.data.id, name: memCached.data.name };
  }

  const persisted = forceRescan ? null : loadFlattenCache(contentId);
  const rootData = await fetchFolderRaw(contentId, passwordHash, accountToken);

  if (rootData.type !== 'folder') {
    const file = normalizeChild(rootData as unknown as GofileRawChild);
    onBatch([file]);
    const normalized = buildFolderResponse(file.id, file.name, [file]);
    folderCache.set(key, { expires: Date.now() + CACHE_TTL_MS, data: normalized });
    return { id: file.id, name: file.name };
  }

  const rootName = rootData.name || contentId;
  const scannedFolderIds = new Set(persisted?.scannedFolderIds ?? []);
  const knownFileIds = new Set((persisted?.files ?? []).map((f) => f.id));
  const allFiles: NormalizedItem[] = persisted ? [...persisted.files] : [];

  // Repeat launch: hand back everything already known immediately, before
  // any network round-trip even starts.
  if (allFiles.length > 0) onBatch(allFiles);

  const queue: string[] = [];
  let visitedFolders = 0;

  const consume = (data: NonNullable<GofileApiResponse['data']>, isRoot: boolean) => {
    const batch: NormalizedItem[] = [];
    for (const child of Object.values(data.children ?? {})) {
      if (child.type === 'folder') {
        if (isRoot && scannedFolderIds.has(child.id)) continue; // already scanned — trust the cache
        if (queue.length + visitedFolders < FLATTEN_MAX_FOLDERS) {
          queue.push(child.id);
        }
      } else if (!knownFileIds.has(child.id) && allFiles.length + batch.length < FLATTEN_MAX_FILES) {
        knownFileIds.add(child.id);
        batch.push(normalizeChild(child));
      }
    }
    if (batch.length > 0) {
      allFiles.push(...batch);
      onBatch(batch);
    }
  };

  consume(rootData, true);
  visitedFolders = 1;

  while (
    queue.length > 0 &&
    visitedFolders < FLATTEN_MAX_FOLDERS &&
    allFiles.length < FLATTEN_MAX_FILES
  ) {
    const batch = queue.splice(0, FLATTEN_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((id) => fetchFolderRaw(id, passwordHash, accountToken)),
    );
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const folderId = batch[i]!;
      visitedFolders += 1;
      if (result.status === 'fulfilled' && result.value.type === 'folder') {
        consume(result.value, false);
        scannedFolderIds.add(folderId);
      }
    }
  }

  // Cached copy is sorted for a clean instant replay; live stream order
  // (arrival order) doesn't matter since the client re-sorts before display.
  const sorted = [...allFiles].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  const normalized = buildFolderResponse(contentId, rootName, sorted);
  folderCache.set(key, { expires: Date.now() + CACHE_TTL_MS, data: normalized });
  saveFlattenCache(contentId, {
    version: 1,
    rootName,
    files: sorted,
    scannedFolderIds: [...scannedFolderIds],
    updatedAt: Date.now(),
  });
  return { id: contentId, name: rootName };
}

export async function resolveDirectLink(
  fileId: string,
  passwordHash?: string,
  accountToken?: string,
): Promise<{ directLink: string; name: string; mimeType?: string }> {
  const token = await resolveToken(accountToken);
  const params = new URLSearchParams();
  if (passwordHash) params.set('password', passwordHash);

  const qs = params.toString();
  const body = await apiFetch(
    `/contents/${encodeURIComponent(fileId)}${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
    token,
  );

  if (body.status !== 'ok' || !body.data) {
    throw mapStatusToError(body.status || 'unknown');
  }

  const data = body.data as unknown as GofileRawChild;
  const link = data.directLink || data.link;
  if (!link) {
    throw new GofileApiError('expired', 'No direct download link available for this file.', 410);
  }

  return {
    directLink: link,
    name: data.name || fileId,
    mimeType: data.mimeType,
  };
}

interface GofileAccountIdResponse {
  status: string;
  data?: { id: string };
}

interface GofileAccountResponse {
  status: string;
  data?: { id: string; email?: string; rootFolder?: string; tier?: string };
}

/**
 * Resolves an account token to its root folder — the account's own "My
 * Files" folder, which already contains every collection the account owns
 * as subfolders. Lets the admin browse everything they've uploaded without
 * needing to know/paste an individual folder link.
 *
 * Falls back to the server's own configured GOFILE_TOKEN (not the generic
 * ensureGuestToken — a throwaway guest account has no meaningful library) so
 * a standalone build shipped with a .env auto-resolves its owner's library
 * with no client-side token required.
 */
export async function resolveAccountRoot(
  clientAccountToken?: string,
): Promise<{ rootFolderId: string; email?: string }> {
  const accountToken = clientAccountToken?.trim() || process.env.GOFILE_TOKEN?.trim();
  if (!accountToken) {
    throw new GofileApiError('unauthorized', 'No Gofile account token configured.', 400);
  }

  const idBody = await apiFetch<GofileAccountIdResponse>(
    '/accounts/getid',
    { method: 'GET' },
    accountToken,
  );
  if (idBody.status !== 'ok' || !idBody.data?.id) {
    throw mapStatusToError(idBody.status || 'unknown');
  }

  const accountBody = await apiFetch<GofileAccountResponse>(
    `/accounts/${encodeURIComponent(idBody.data.id)}`,
    { method: 'GET' },
    accountToken,
  );
  if (accountBody.status !== 'ok' || !accountBody.data?.rootFolder) {
    throw mapStatusToError(accountBody.status || 'unknown');
  }

  return { rootFolderId: accountBody.data.rootFolder, email: accountBody.data.email };
}

export function clearFolderCache(): void {
  folderCache.clear();
}
