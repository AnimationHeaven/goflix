import { useQuery } from '@tanstack/react-query';
import type { ApiErrorBody, FolderResponse } from '../types';
import { FolderFetchError } from '../types';
import { getGofileToken } from '../lib/storage';

async function fetchFolder(
  id: string,
  passwordHash?: string,
  accountToken?: string,
): Promise<FolderResponse> {
  const params = new URLSearchParams();
  if (passwordHash) params.set('password', passwordHash);
  const qs = params.toString();
  const headers: HeadersInit = {};
  const token = accountToken ?? getGofileToken();
  if (token) headers['X-Gofile-Token'] = token;

  const res = await fetch(
    `/api/folder/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`,
    { headers },
  );

  if (!res.ok) {
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
      body?.retryAfterMs,
    );
  }

  return (await res.json()) as FolderResponse;
}

/** Single-level folder fetch. For subfolder-flattened views, see useFolderStream. */
export function useFolder(id: string | null, passwordHash?: string, accountToken?: string) {
  return useQuery({
    queryKey: ['folder', id, passwordHash ?? '', accountToken ?? ''],
    queryFn: () => fetchFolder(id!, passwordHash, accountToken),
    enabled: Boolean(id),
    staleTime: 90_000,
    // NOTE: TanStack calls retry(failureCount, error) BEFORE incrementing —
    // failureCount is 0 on the very first failure. `failureCount < N` means
    // "retry while fewer than N retries have happened yet", i.e. N retries
    // total (N+1 attempts). Gofile's rate limiter needs longer than a quick
    // network hiccup to clear, so it gets more attempts with a longer backoff.
    retry: (failureCount, error) => {
      if (error instanceof FolderFetchError) {
        if (
          error.code === 'password_required' ||
          error.code === 'wrong_password' ||
          error.code === 'not_found' ||
          error.code === 'expired'
        ) {
          return false;
        }
        if (error.code === 'rate_limited') return failureCount < 2;
      }
      return failureCount < 1;
    },
    retryDelay: (attempt, error) => {
      // Gofile telling us exactly how long to wait beats guessing.
      if (error instanceof FolderFetchError && error.retryAfterMs) {
        return Math.min(error.retryAfterMs, 20_000);
      }
      const base =
        error instanceof FolderFetchError && error.code === 'rate_limited' ? 5000 : 2000;
      return Math.min(base * 2 ** attempt, 20_000);
    },
  });
}
