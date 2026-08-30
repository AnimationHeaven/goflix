import type { RecentFolder, SortKey, WatchProgress } from '../types';

const RECENT_KEY = 'goflix:recent';
const SORT_KEY = 'goflix:sort';
const PROGRESS_KEY = 'goflix:progress';
const TOKEN_KEY = 'goflix:gofile-token';
const FAVORITES_KEY = 'goflix:favorites';
const WATCHED_KEY = 'goflix:watched';
const BLUR_MODE_KEY = 'goflix:blur-mode';
const DENSITY_KEY = 'goflix:density';
const MAX_RECENT = 8;

export type Density = 'comfortable' | 'compact';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getRecentFolders(): RecentFolder[] {
  return readJson<RecentFolder[]>(RECENT_KEY, []);
}

export function pushRecentFolder(folder: { id: string; name: string }): void {
  const list = getRecentFolders().filter((f) => f.id !== folder.id);
  list.unshift({ id: folder.id, name: folder.name, loadedAt: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

/** Scrubs any saved folder history — used on the guest build, where the
 * pasted link is itself the access credential and shouldn't linger on a
 * shared machine for the next person to open. */
export function clearRecentFolders(): void {
  localStorage.removeItem(RECENT_KEY);
}

export function getSortPref(): SortKey {
  return readJson<SortKey>(SORT_KEY, 'name-asc');
}

export function setSortPref(sort: SortKey): void {
  localStorage.setItem(SORT_KEY, JSON.stringify(sort));
}

export function getGofileToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function setGofileToken(token: string): void {
  const t = token.trim();
  if (!t) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, t);
}

export function clearGofileToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getAllProgress(): WatchProgress[] {
  return readJson<WatchProgress[]>(PROGRESS_KEY, []);
}

export function getProgress(fileId: string): WatchProgress | undefined {
  return getAllProgress().find((p) => p.fileId === fileId);
}

export function saveProgress(entry: WatchProgress): void {
  const list = getAllProgress().filter((p) => p.fileId !== entry.fileId);
  // Only keep meaningful progress (>5% and <95%)
  const ratio = entry.duration > 0 ? entry.currentTime / entry.duration : 0;
  if (ratio >= 0.9) {
    markWatched(entry.fileId);
  }
  if (ratio >= 0.05 && ratio < 0.95) {
    list.unshift(entry);
  }
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(list.slice(0, 40)));
}

export function clearProgress(fileId: string): void {
  const list = getAllProgress().filter((p) => p.fileId !== fileId);
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(list));
}

export function getContinueWatching(folderId?: string): WatchProgress[] {
  const all = getAllProgress().sort((a, b) => b.updatedAt - a.updatedAt);
  if (!folderId) return all.slice(0, 12);
  return all.filter((p) => p.folderId === folderId).slice(0, 12);
}

export function getFavorites(): string[] {
  return readJson<string[]>(FAVORITES_KEY, []);
}

export function isFavorite(id: string): boolean {
  return getFavorites().includes(id);
}

export function toggleFavorite(id: string): boolean {
  const current = getFavorites();
  const idx = current.indexOf(id);
  const next = idx >= 0 ? current.filter((f) => f !== id) : [...current, id];
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  return idx < 0;
}

export function getWatched(): string[] {
  return readJson<string[]>(WATCHED_KEY, []);
}

export function isWatched(id: string): boolean {
  return getWatched().includes(id);
}

export function markWatched(id: string): void {
  const current = getWatched();
  if (current.includes(id)) return;
  localStorage.setItem(WATCHED_KEY, JSON.stringify([...current, id]));
}

export function getBlurMode(): boolean {
  return readJson<boolean>(BLUR_MODE_KEY, false);
}

export function setBlurMode(on: boolean): void {
  localStorage.setItem(BLUR_MODE_KEY, JSON.stringify(on));
}

export function getDensity(): Density {
  return readJson<Density>(DENSITY_KEY, 'comfortable');
}

export function setDensity(density: Density): void {
  localStorage.setItem(DENSITY_KEY, JSON.stringify(density));
}
