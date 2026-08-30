import { useEffect, useState } from 'react';
import { buildAssetSrc, buildStreamSrc, isBrowserPlayable, mediaKind } from '../lib/media';
import { idbGetAll, idbPut } from '../lib/idbCache';
import type { NormalizedItem } from '../types';

const cache = new Map<string, string>();
const failed = new Set<string>();
const inflight = new Map<string, Promise<string | null>>();

void idbGetAll<string>('thumbnails').then((entries) => {
  for (const [id, url] of entries) {
    if (url.startsWith('data:')) cache.set(id, url);
  }
});

const MAX_CONCURRENT = 4;
const taskQueue: Array<() => void> = [];
let active = 0;

function runQueued(): void {
  while (active < MAX_CONCURRENT && taskQueue.length > 0) {
    const job = taskQueue.shift()!;
    active += 1;
    job();
  }
}

function enqueue(task: () => Promise<void>): void {
  taskQueue.push(() => {
    task().finally(() => {
      active -= 1;
      runQueued();
    });
  });
  runQueued();
}

function generateGradientDataUrl(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 40 + (Math.abs(hash) % 60)) % 360;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 640, 360);
  grad.addColorStop(0, `hsl(${h1} 55% 22%)`);
  grad.addColorStop(1, `hsl(${h2} 45% 12%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 640, 360);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.fillText(seed.slice(0, 28), 24, 320);
  return canvas.toDataURL('image/jpeg', 0.7);
}

async function loadRemoteImage(url: string, fileId: string): Promise<string | null> {
  if (cache.has(fileId)) return cache.get(fileId)!;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    const objectUrl = URL.createObjectURL(blob);
    cache.set(fileId, objectUrl);
    return objectUrl;
  } catch {
    return null;
  }
}

async function captureFrame(src: string, fileId: string): Promise<string | null> {
  if (cache.has(fileId)) return cache.get(fileId)!;
  if (failed.has(fileId)) return null;
  const existing = inflight.get(fileId);
  if (existing) return existing;

  const promise = new Promise<string | null>((resolve) => {
    const video = document.createElement('video');
    if (!src.startsWith('/')) video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';
    video.playsInline = true;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
      inflight.delete(fileId);
    };

    const timeout = window.setTimeout(() => {
      failed.add(fileId);
      cleanup();
      resolve(null);
    }, 14_000);

    video.onerror = () => {
      window.clearTimeout(timeout);
      failed.add(fileId);
      cleanup();
      resolve(null);
    };

    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        window.clearTimeout(timeout);
        failed.add(fileId);
        cleanup();
        resolve(null);
        return;
      }
      video.currentTime = Math.min(duration * 0.1, Math.max(duration - 0.1, 0));
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no ctx');
        ctx.drawImage(video, 0, 0, 640, 360);
        const url = canvas.toDataURL('image/jpeg', 0.75);
        cache.set(fileId, url);
        idbPut('thumbnails', fileId, url);
        window.clearTimeout(timeout);
        cleanup();
        resolve(url);
      } catch {
        window.clearTimeout(timeout);
        failed.add(fileId);
        cleanup();
        resolve(null);
      }
    };

    video.src = src;
  });

  inflight.set(fileId, promise);
  return promise;
}

/**
 * Unified poster-thumbnail resolver for video/image/gif cards: prefers
 * Gofile's own generated thumbnail (cheap), falls back to a client-side
 * captured video frame for playable videos, falls back to the full image
 * for pictures with no server thumbnail, and finally a deterministic
 * gradient placeholder so cards never show a blank box.
 */
export function useThumbnail(item: NormalizedItem, enabled = true) {
  const [src, setSrc] = useState<string | null>(() => cache.get(item.id) ?? null);
  const [loading, setLoading] = useState(() => !cache.has(item.id));
  const [fallback] = useState(() => generateGradientDataUrl(item.name || item.id));

  useEffect(() => {
    if (cache.has(item.id)) {
      setSrc(cache.get(item.id)!);
      setLoading(false);
      return;
    }
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const run = async () => {
      const proxiedThumb = buildAssetSrc(item.thumbnail);
      if (proxiedThumb) {
        const img = await loadRemoteImage(proxiedThumb, item.id);
        if (cancelled) return;
        if (img) {
          setSrc(img);
          setLoading(false);
          return;
        }
      }

      if (isBrowserPlayable(item) && item.directLink) {
        const streamSrc = buildStreamSrc(item);
        const frame = await captureFrame(streamSrc, item.id);
        if (cancelled) return;
        if (frame) {
          setSrc(frame);
          setLoading(false);
          return;
        }
      }

      if (mediaKind(item) === 'image') {
        if (!cancelled) {
          setSrc(buildStreamSrc(item));
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setSrc(null);
        setLoading(false);
      }
    };

    enqueue(run);
    return () => {
      cancelled = true;
    };
  }, [item, enabled]);

  return {
    poster: src ?? fallback,
    isGenerated: Boolean(src),
    loading: loading && !src,
  };
}
