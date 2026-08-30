import { useCallback, useEffect, useRef, useState } from 'react';
import { getGofileToken } from '../lib/storage';
import type { NormalizedItem } from '../types';

export type RemuxState = 'checking' | 'unavailable' | 'choice' | 'preparing' | 'ready';
type JobStatus = 'working' | 'ready' | 'error';

interface Result {
  state: RemuxState;
  reason?: string;
  src: string;
  /** Call once the member opts in to converting — the check already ran
   * automatically, but the (potentially multi-minute, for a big file)
   * conversion itself only starts on explicit confirmation. */
  start: () => void;
}

function authQuery(): string {
  const params = new URLSearchParams();
  const token = getGofileToken();
  if (token) params.set('token', token);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

const POLL_MS = 1500;

/** Drives the check → (member opts in) → prepare → poll flow for playing
 * an MKV whose inner codecs are already browser-compatible. Falls back to
 * 'unavailable' whenever ffmpeg isn't on the server or the codecs need
 * real transcoding — callers should show the existing download prompt in
 * that state, and a download-or-convert choice in 'choice'. */
export function useMkvRemux(item: NormalizedItem, enabled: boolean): Result {
  const [state, setState] = useState<RemuxState>('checking');
  const [reason, setReason] = useState<string | undefined>(undefined);
  const pollRef = useRef<number | undefined>(undefined);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setState('checking');
      startedRef.current = false;
      return;
    }

    let cancelled = false;
    setState('checking');
    setReason(undefined);
    startedRef.current = false;

    const qs = authQuery();
    const token = getGofileToken();
    const headers: HeadersInit = token ? { 'X-Gofile-Token': token } : {};

    async function checkOnly() {
      try {
        const res = await fetch(`/api/mkv/${encodeURIComponent(item.id)}/check${qs}`, { headers });
        const body = (await res.json()) as { remuxable: boolean; reason: string };
        if (cancelled) return;
        setState(body.remuxable ? 'choice' : 'unavailable');
        if (!body.remuxable) setReason(body.reason);
      } catch {
        if (!cancelled) setState('unavailable');
      }
    }

    void checkOnly();
    return () => {
      cancelled = true;
      window.clearTimeout(pollRef.current);
    };
  }, [item.id, enabled]);

  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setState('preparing');

    const qs = authQuery();
    const token = getGofileToken();
    const headers: HeadersInit = token ? { 'X-Gofile-Token': token } : {};

    const poll = () => {
      pollRef.current = window.setTimeout(async () => {
        try {
          const res = await fetch(`/api/mkv/${encodeURIComponent(item.id)}/status`);
          const body = (await res.json()) as { status: JobStatus; error?: string };
          if (body.status === 'ready') {
            setState('ready');
          } else if (body.status === 'error') {
            setState('unavailable');
            setReason(body.error ?? 'Conversion failed.');
          } else {
            poll();
          }
        } catch {
          setState('unavailable');
        }
      }, POLL_MS);
    };

    void (async () => {
      try {
        const res = await fetch(`/api/mkv/${encodeURIComponent(item.id)}/prepare${qs}`, {
          method: 'POST',
          headers,
        });
        const body = (await res.json()) as { status: JobStatus };
        if (body.status === 'ready') setState('ready');
        else if (body.status === 'error') setState('unavailable');
        else poll();
      } catch {
        setState('unavailable');
      }
    })();
  }, [item.id]);

  return { state, reason, src: `/api/mkv/${encodeURIComponent(item.id)}/file${authQuery()}`, start };
}
