import { useEffect, useRef, useState } from 'react';
import { parseGofileId } from '../lib/gofileParse';
import { getGofileToken, getRecentFolders } from '../lib/storage';
import { useMyLibrary } from '../hooks/useMyLibrary';
import { useBuildMode } from '../hooks/useBuildMode';
import { TokenSettings } from './TokenSettings';
import { GuideModal } from './GuideModal';

interface Props {
  onLoad: (id: string, name?: string) => void;
  loading?: boolean;
  errorMessage?: string | null;
  onTokenChange?: (token: string) => void;
  onStopServer?: () => void;
}

// Every Gofile folder link shares this exact prefix, so it's pre-filled
// rather than something the user has to type (or re-type after a mobile
// keyboard's autocapitalize mangles the "h" — see the input's own
// autoCapitalize="off" below, which stops that at the source too).
const LINK_PREFIX = 'https://gofile.io/d/';

export function LandingInput({ onLoad, loading, errorMessage, onTokenChange, onStopServer }: Props) {
  const [value, setValue] = useState(LINK_PREFIX);
  const [localError, setLocalError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [tokenTick, setTokenTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (el) el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const token = getGofileToken();
  const library = useMyLibrary(token);
  const buildMode = useBuildMode();
  // Recent-folder history only ever exists on the admin build (see
  // useBuildMode) — on the guest build a pasted link is a member's
  // exclusive access credential and is never persisted, so this stays
  // empty there rather than risk flashing a stale entry pre-resolution.
  const recent = buildMode === 'admin' ? getRecentFolders() : [];

  const submit = () => {
    const id = parseGofileId(value);
    if (!id) {
      setLocalError('Enter a valid Gofile folder link or ID.');
      return;
    }
    setLocalError(null);
    onLoad(id);
  };

  return (
    <div className="app-ambient flex min-h-screen flex-col items-center justify-center px-4">
      <button
        type="button"
        onClick={() => setGuideOpen(true)}
        className="fixed left-4 top-4 rounded-md px-3 py-1.5 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-white"
      >
        ❔ How to use
      </button>

      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        className="fixed right-4 top-4 rounded-md px-3 py-1.5 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-white"
      >
        {token ? 'Account settings' : 'Add account token'}
      </button>

      {onStopServer && (
        <button
          type="button"
          onClick={onStopServer}
          className="fixed right-4 top-14 rounded-md px-3 py-1.5 text-sm text-zinc-500 transition hover:bg-zinc-900 hover:text-accent"
        >
          ⏻ Stop server
        </button>
      )}

      <h1 className="font-display text-6xl tracking-wide text-white sm:text-7xl">
        GO<span className="text-accent">FLIX</span>
      </h1>
      <p className="mt-3 max-w-md text-center text-sm text-zinc-400">
        Paste a Gofile folder link or ID to start browsing.{' '}
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="text-accent underline-offset-2 hover:underline"
        >
          New here? Read the guide.
        </button>
      </p>

      <div className="mt-8 flex w-full max-w-lg gap-2">
        <input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="https://gofile.io/d/XXXXXX"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-accent"
        />
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Browse'}
        </button>
      </div>

      {(localError || errorMessage) && (
        <p className="mt-3 text-sm text-accent">{localError ?? errorMessage}</p>
      )}

      {library.library && (
        <button
          type="button"
          onClick={() => onLoad(library.library!.rootFolderId, 'Your Library')}
          className="mt-6 w-full max-w-lg rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-left text-sm text-white transition hover:bg-accent/20"
        >
          <span className="font-medium">📚 Your Library</span>
          <span className="ml-2 text-zinc-400">
            {library.library.email ?? 'Open your Gofile account root'}
          </span>
        </button>
      )}

      {recent.length > 0 && (
        <div className="mt-8 w-full max-w-lg">
          <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Recent</p>
          <div className="flex flex-col gap-1">
            {recent.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onLoad(r.id, r.name)}
                className="truncate rounded-md px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
              >
                {r.name || r.id}
              </button>
            ))}
          </div>
        </div>
      )}

      <TokenSettings
        key={tokenTick}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={(t) => {
          setTokenTick((n) => n + 1);
          onTokenChange?.(t);
        }}
      />

      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
