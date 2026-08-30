import { useEffect, useRef, useState } from 'react';
import { getGofileToken } from '../lib/storage';
import { FolderFetchError } from '../types';
import type { ApiErrorBody, ApiErrorCode, NormalizedItem } from '../types';

type StreamMessage =
  | { type: 'batch'; items: NormalizedItem[] }
  | { type: 'done'; id: string; name: string }
  | { type: 'error'; error: ApiErrorCode; message: string };

interface StreamState {
  items: NormalizedItem[];
  name: string | null;
  isLoading: boolean;
  isDone: boolean;
  error: Error | null;
}

const INITIAL_STATE: StreamState = {
  items: [],
  name: null,
  isLoading: false,
  isDone: false,
  error: null,
};

/**
 * Progressive counterpart to useFolder for the "Include subfolders" view —
 * reads the /stream NDJSON endpoint and accumulates items as they arrive,
 * so a folder with many subfolders renders incrementally instead of behind
 * one long blocking spinner.
 */
export function useFolderStream(
  id: string | null,
  passwordHash: string | undefined,
  accountToken: string | undefined,
  enabled: boolean,
  /** Bump to force a fresh full walk, bypassing the server's disk cache (mirrors the shuffleSeed pattern). */
  rescanToken = 0,
) {
  const [state, setState] = useState<StreamState>(INITIAL_STATE);
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled || !id) {
      setState(INITIAL_STATE);
      return;
    }

    const mySeq = ++seq.current;
    setState({ ...INITIAL_STATE, isLoading: true });

    const controller = new AbortController();
    const params = new URLSearchParams();
    if (passwordHash) params.set('password', passwordHash);
    if (rescanToken > 0) params.set('rescan', '1');
    const qs = params.toString();
    const headers: HeadersInit = {};
    const token = accountToken ?? getGofileToken();
    if (token) headers['X-Gofile-Token'] = token;

    async function run() {
      try {
        const res = await fetch(
          `/api/folder/${encodeURIComponent(id!)}/stream${qs ? `?${qs}` : ''}`,
          { headers, signal: controller.signal },
        );

        if (!res.ok || !res.body) {
          let body: ApiErrorBody | null = null;
          try {
            body = (await res.json()) as ApiErrorBody;
          } catch {
            /* ignore */
          }
          throw new FolderFetchError(
            body?.error ?? 'unknown',
            body?.message ?? `Request failed (${res.status})`,
            res.status,
          );
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            const msg = JSON.parse(line) as StreamMessage;
            if (mySeq !== seq.current) return; // superseded by a newer request

            if (msg.type === 'batch') {
              setState((s) => ({ ...s, items: [...s.items, ...msg.items] }));
            } else if (msg.type === 'done') {
              setState((s) => ({ ...s, name: msg.name, isLoading: false, isDone: true }));
            } else {
              throw new FolderFetchError(msg.error, msg.message, 502);
            }
          }
        }
      } catch (err) {
        if (mySeq !== seq.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState((s) => ({
          ...s,
          isLoading: false,
          error: err instanceof Error ? err : new Error('Stream failed'),
        }));
      }
    }

    void run();
    return () => {
      controller.abort();
    };
  }, [id, passwordHash, accountToken, enabled, rescanToken]);

  return state;
}
