import { useEffect, useState } from 'react';

interface MyLibrary {
  rootFolderId: string;
  email?: string;
  tier?: string;
}

interface State {
  library: MyLibrary | null;
  loading: boolean;
  error: string | null;
}

const INITIAL: State = { library: null, loading: false, error: null };

/** Resolves the signed-in Gofile account's root folder so the landing page
 * can offer a one-click "Your Library" card instead of requiring the user
 * to paste their own folder link. */
export function useMyLibrary(token: string): State {
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    if (!token) {
      setState(INITIAL);
      return;
    }

    let cancelled = false;
    setState({ library: null, loading: true, error: null });

    fetch('/api/account/root', { headers: { 'X-Gofile-Token': token } })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as
          | { rootFolderId?: string; email?: string; tier?: string; message?: string }
          | null;
        if (!res.ok || !body?.rootFolderId) {
          throw new Error(body?.message ?? 'Could not load your library.');
        }
        return { rootFolderId: body.rootFolderId, email: body.email, tier: body.tier };
      })
      .then((library) => {
        if (!cancelled) setState({ library, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            library: null,
            loading: false,
            error: err instanceof Error ? err.message : 'Could not load your library.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return state;
}
