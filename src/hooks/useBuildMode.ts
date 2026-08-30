import { useEffect, useState } from 'react';
import { clearRecentFolders } from '../lib/storage';

export type BuildMode = 'checking' | 'admin' | 'guest';

let cached: BuildMode | null = null;

/**
 * Distinguishes the admin exe (shipped with a baked-in GOFILE_TOKEN) from
 * the guest exe handed out to members, purely from server state — same
 * codebase either way. On the guest build, any pasted folder link is a
 * member's exclusive access credential and must never be persisted, so this
 * also scrubs stale recent-folder history the moment guest mode is confirmed
 * (e.g. a leftover from an older build, or a shared machine).
 */
export function useBuildMode(): BuildMode {
  const [mode, setMode] = useState<BuildMode>(cached ?? 'checking');

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetch('/api/account/default-token')
      .then((res) => (res.ok ? (res.json() as Promise<{ token?: string | null }>) : null))
      .then((body) => {
        const resolved: BuildMode = body?.token ? 'admin' : 'guest';
        cached = resolved;
        if (resolved === 'guest') clearRecentFolders();
        if (!cancelled) setMode(resolved);
      })
      .catch(() => {
        cached = 'guest';
        clearRecentFolders();
        if (!cancelled) setMode('guest');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return mode;
}
