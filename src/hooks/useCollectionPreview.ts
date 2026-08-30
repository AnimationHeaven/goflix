import { useEffect, useState } from 'react';
import { buildAssetSrc, buildStreamSrc, mediaKind } from '../lib/media';
import { getGofileToken } from '../lib/storage';
import type { FolderResponse } from '../types';

interface Preview {
  thumbnailSrc: string | null;
  itemCount: number | null;
  loading: boolean;
}

const INITIAL: Preview = { thumbnailSrc: null, itemCount: null, loading: false };
const cache = new Map<string, Preview>();

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
