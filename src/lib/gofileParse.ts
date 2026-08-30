/**
 * Parse a Gofile folder URL or raw content ID into a content ID.
 * Accepts: https://gofile.io/d/XXXXX, https://gofile.io/d/XXXXX?..., or raw ID.
 */
export function parseGofileId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Raw ID
  if (/^[a-zA-Z0-9]{5,}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (!url.hostname.includes('gofile.io')) return null;

    // /d/{id} or /download/{id} patterns
    const match = url.pathname.match(/\/(?:d|download)\/([a-zA-Z0-9]+)/i);
    if (match?.[1]) return match[1];

    // Fallback: last path segment if it looks like an ID
    const segments = url.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && /^[a-zA-Z0-9]{5,}$/.test(last)) return last;
  } catch {
    return null;
  }

  return null;
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function formatBytes(bytes?: number): string {
  if (bytes == null || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}
