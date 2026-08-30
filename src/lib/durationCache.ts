import { buildStreamSrc } from './media';
import { idbGetAll, idbPut } from './idbCache';
import type { NormalizedItem } from '../types';

/**
 * Gofile's folder API never returns video duration, so "sort by duration"
 * has to probe each video's metadata client-side (just the header, via
 * preload="metadata" — not the full file). Probes are cached module-wide
 * and throttled so selecting the sort on a big folder doesn't fire hundreds
 * of concurrent requests at once.
 */
interface Resolution {
  width: number;
  height: number;
}

const cache = new Map<string, number>();
const resolutionCache = new Map<string, Resolution>();
const failed = new Set<string>();
const inflight = new Map<string, Promise<number | null>>();
const queued = new Set<string>();
const listeners = new Set<() => void>();

const MAX_CONCURRENT = 4;
const PROBE_TIMEOUT_MS = 12_000;
const queue: Array<() => void> = [];
let active = 0;

function notify(): void {
  for (const l of listeners) l();
}

// Fired once at module load; a revisited folder's durations are ready
// before its videos even finish rendering in the common case.
void idbGetAll<number>('durations').then((entries) => {
  if (entries.length === 0) return;
  for (const [id, duration] of entries) cache.set(id, duration);
  notify();
});

void idbGetAll<Resolution>('resolutions').then((entries) => {
  if (entries.length === 0) return;
  for (const [id, resolution] of entries) resolutionCache.set(id, resolution);
  notify();
});

export function getCachedDuration(id: string): number | undefined {
  return cache.get(id);
}

/** Video resolution — a free byproduct of the same metadata probe as duration. */
export function getCachedResolution(id: string): Resolution | undefined {
  return resolutionCache.get(id);
}

/** Feeds the shared cache from real playback metadata — e.g. VideoPlayer
 * already knows a video's resolution once it starts playing, so the grid
 * card can show it too without a redundant background probe. */
export function setKnownResolution(id: string, width: number, height: number): void {
  if (width <= 0 || height <= 0 || resolutionCache.has(id)) return;
  const resolution: Resolution = { width, height };
  resolutionCache.set(id, resolution);
  idbPut('resolutions', id, resolution);
  notify();
}

/** True once a probe has concluded either way — succeeded or permanently failed. */
export function isDurationSettled(id: string): boolean {
  return cache.has(id) || failed.has(id);
}

export function subscribeDurations(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function runQueued(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()!;
    active += 1;
    job();
  }
}

function probeDuration(id: string, src: string): Promise<number | null> {
  const promise = new Promise<number | null>((resolve) => {
    const video = document.createElement('video');
    if (!src.startsWith('/')) video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
      inflight.delete(id);
    };

    const timeout = window.setTimeout(() => {
      failed.add(id);
      cleanup();
      notify();
      resolve(null);
    }, PROBE_TIMEOUT_MS);

    video.onerror = () => {
      window.clearTimeout(timeout);
      failed.add(id);
      cleanup();
      notify();
      resolve(null);
    };

    video.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      const duration = video.duration;
      const { videoWidth, videoHeight } = video;
      cleanup();
      if (Number.isFinite(duration) && duration > 0) {
        cache.set(id, duration);
        idbPut('durations', id, duration);
      } else {
        failed.add(id);
      }
      if (videoWidth > 0 && videoHeight > 0) {
        const resolution: Resolution = { width: videoWidth, height: videoHeight };
        resolutionCache.set(id, resolution);
        idbPut('resolutions', id, resolution);
      }
      notify();
      resolve(Number.isFinite(duration) && duration > 0 ? duration : null);
    };

    video.src = src;
  });

  inflight.set(id, promise);
  return promise;
}

/** Enqueues a background metadata probe for one video, deduped and rate-limited. */
export function queueDurationProbe(item: NormalizedItem): void {
  const id = item.id;
  if (cache.has(id) || failed.has(id) || inflight.has(id) || queued.has(id)) return;

  queued.add(id);
  queue.push(() => {
    queued.delete(id);
    const src = buildStreamSrc(item);
    probeDuration(id, src).finally(() => {
      active -= 1;
      runQueued();
    });
  });
  runQueued();
}
