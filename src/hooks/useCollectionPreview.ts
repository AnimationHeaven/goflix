import { useEffect, useState } from 'react';
import { buildAssetSrc, buildStreamSrc, mediaKind } from '../lib/media';
import { getGofileToken } from '../lib/storage';
import { idbGetAll, idbPut } from '../lib/idbCache';
import type { FolderResponse } from '../types';

interface Preview {
  thumbnailSrc: string | null;
  itemCount: number | null;
  loading: boolean;
}

const INITIAL: Preview = { thumbnailSrc: null, itemCount: null, loading: false };
const cache = new Map<string, Preview>();

// Persisted across reloads/app restarts — without this, revisiting "Your
// Library" (easily 100+ collections) after the server's in-memory cache has
// expired re-fetches every single preview from Gofile again, purely to
// re-render a thumbnail the user has already seen. That's the same kind of
// avoidable quota "leakage" as the duration-probe issue, just triggered by
// time passing instead of a big folder.
void idbGetAll<Preview>('collectionPreviews').then((entries) => {
  for (const [id, preview] of entries) if (!cache.has(id)) cache.set(id, preview);
});

/** Lightweight one-level peek into a collection folder for the list-view
 * Collections row — just enough to show an item count and a representative
 * thumbnail without doing a full recursive flatten. */
export function useCollectionPreview(folderId: string, enabled: boolean): Preview {
  const [state, setState] = useState<Preview>(() => cache.get(folderId) ?? INITIAL);

  useEffect(() => {
    const existing = cache.get(folderId);
    if (existing) {
      setState(existing);
      return;
    }
    if (!enabled) return;

    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    const headers: HeadersInit = {};
    const token = getGofileToken();
    if (token) headers['X-Gofile-Token'] = token;

    fetch(`/api/folder/${encodeURIComponent(folderId)}`, { headers })
      .then((res) => (res.ok ? (res.json() as Promise<FolderResponse>) : null))
      .then((data) => {
        if (cancelled) return;
        let thumbnailSrc: string | null = null;
        if (data) {
          const firstVideo = data.children.find(
            (c) => mediaKind(c) === 'video' && c.thumbnail,
          );
          const firstPicture = data.children.find((c) => {
            const kind = mediaKind(c);
            return kind === 'image' || kind === 'gif';
          });
          if (firstVideo) thumbnailSrc = buildAssetSrc(firstVideo.thumbnail) ?? null;
          else if (firstPicture) thumbnailSrc = buildStreamSrc(firstPicture);
        }
        const result: Preview = {
          thumbnailSrc,
          itemCount: data ? data.children.length : null,
          loading: false,
        };
        cache.set(folderId, result);
        idbPut('collectionPreviews', folderId, result);
        setState(result);
      })
      .catch(() => {
        if (!cancelled) setState({ ...INITIAL });
      });

    return () => {
      cancelled = true;
    };
  }, [folderId, enabled]);

  return state;
}
