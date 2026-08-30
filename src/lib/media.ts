import { getGofileToken } from './storage';
import type { MediaType, NormalizedItem } from '../types';

const PLAYABLE_EXT = new Set(['mp4', 'webm', 'm4v', 'mov', 'ogg', 'ogv']);
const IMAGE_EXT = new Set([
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

export function fileExtension(name: string): string {
  const i = name.lastIndexOf('.');
  if (i < 0) return '';
  return name.slice(i + 1).toLowerCase();
}

/** Classifies an item as video / image / gif / other, trusting the server's mediaType when present. */
export function mediaKind(
  item: Pick<NormalizedItem, 'name' | 'mimeType' | 'mediaType' | 'isVideo'>,
): MediaType {
  if (item.mediaType) return item.mediaType;
  if (item.isVideo) return 'video';
  const ext = fileExtension(item.name);
  const mime = item.mimeType?.toLowerCase() ?? '';
  if (ext === 'gif' || mime === 'image/gif') return 'gif';
  if (IMAGE_EXT.has(ext) || mime.startsWith('image/')) return 'image';
  return 'other';
}

/** Formats most Chromium browsers can decode in <video>. */
export function isBrowserPlayable(item: Pick<NormalizedItem, 'name' | 'mimeType'>): boolean {
  const ext = fileExtension(item.name);
  if (PLAYABLE_EXT.has(ext)) return true;
  const mime = item.mimeType?.toLowerCase() ?? '';
  if (mime.startsWith('video/mp4') || mime.startsWith('video/webm') || mime === 'video/quicktime') {
    return true;
  }
  return false;
}

export function isMkv(item: Pick<NormalizedItem, 'name' | 'mimeType'>): boolean {
  const ext = fileExtension(item.name);
  const mime = item.mimeType?.toLowerCase() ?? '';
  return ext === 'mkv' || mime.includes('matroska');
}

/** Authenticated stream URL for <video> / thumbnail capture. */
export function buildStreamSrc(item: Pick<NormalizedItem, 'id' | 'directLink'>): string {
  const link = item.directLink;
  // Public non-Gofile URLs (if any) play directly
  if (link && !/gofile\.io/i.test(link) && !link.startsWith('/')) {
    return link;
  }

  const params = new URLSearchParams();
  const token = getGofileToken();
  if (token) params.set('token', token);
  if (link) params.set('link', link);
  const qs = params.toString();
  return `/api/stream/${encodeURIComponent(item.id)}${qs ? `?${qs}` : ''}`;
}

/** Proxy a Gofile CDN image (poster/thumbnail) with account cookie. */
export function buildAssetSrc(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('data:')) return url;
  const params = new URLSearchParams({ url });
  const token = getGofileToken();
  if (token) params.set('token', token);
  return `/api/asset?${params}`;
}
