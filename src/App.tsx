import { useEffect, useMemo, useState } from 'react';
import { useFolder } from './hooks/useFolder';
import { useFolderStream } from './hooks/useFolderStream';
import { useContinueWatching } from './hooks/useWatchProgress';
import { useFavorites } from './hooks/useFavorites';
import { useBuildMode } from './hooks/useBuildMode';
import {
  getBlurMode,
  getDensity,
  getGofileToken,
  getSortPref,
  pushRecentFolder,
  setBlurMode as persistBlurMode,
  setDensity as persistDensity,
  setSortPref,
} from './lib/storage';
import type { Density } from './lib/storage';
import { sha256Hex } from './lib/gofileParse';
import { mediaKind } from './lib/media';
import { FolderFetchError } from './types';
import type { BreadcrumbEntry, FolderResponse, NormalizedItem, SortKey, WatchProgress } from './types';
import { LandingInput } from './components/LandingInput';
import { Breadcrumbs } from './components/Breadcrumbs';
import { SortFilterBar } from './components/SortFilterBar';
import type { MediaFilters } from './components/SortFilterBar';
import { LibraryGrid } from './components/LibraryGrid';
import { Player } from './components/Player';
import { PasswordPrompt } from './components/PasswordPrompt';
import { TokenSettings } from './components/TokenSettings';
import { GuideModal } from './components/GuideModal';

const DEFAULT_FILTERS: MediaFilters = { video: true, image: true, gif: true, other: false };
const EMPTY_CHILDREN: NormalizedItem[] = [];

export default function App() {
  const [rootId, setRootId] = useState<string | null>(null);
  const [trail, setTrail] = useState<BreadcrumbEntry[]>([]);
  const [passwordHash, setPasswordHash] = useState<string | undefined>(undefined);
  const [needPassword, setNeedPassword] = useState(false);
  const [wrongPassword, setWrongPassword] = useState(false);
  const [sort, setSort] = useState<SortKey>(() => getSortPref());
  const [search, setSearch] = useState('');
  const [mediaFilters, setMediaFilters] = useState<MediaFilters>(DEFAULT_FILTERS);
  const [flatten, setFlatten] = useState(false);
  const [rescanToken, setRescanToken] = useState(0);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [groupByType, setGroupByType] = useState(true);
  const [blurMode, setBlurModeState] = useState(() => getBlurMode());
  const [density, setDensityState] = useState<Density>(() => getDensity());
  const [playing, setPlaying] = useState<NormalizedItem | null>(null);
  const [accountToken, setAccountToken] = useState(() => getGofileToken());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [serverStopped, setServerStopped] = useState(false);
  const buildMode = useBuildMode();

  const activeId = trail.length > 0 ? trail[trail.length - 1].id : rootId;

  const folderQueryRQ = useFolder(activeId, passwordHash, accountToken || undefined);
  const streamQuery = useFolderStream(
    activeId,
    passwordHash,
    accountToken || undefined,
    flatten,
    rescanToken,
  );

  const folderData = useMemo<FolderResponse | undefined>(() => {
    if (flatten) {
      if (!activeId) return undefined;
      return {
        id: activeId,
        name: streamQuery.name ?? '',
        type: 'folder',
        children: streamQuery.items,
        videoCount: streamQuery.items.filter((i) => mediaKind(i) === 'video').length,
        imageCount: streamQuery.items.filter((i) => mediaKind(i) === 'image').length,
        gifCount: streamQuery.items.filter((i) => mediaKind(i) === 'gif').length,
        folderCount: 0,
        otherCount: streamQuery.items.filter((i) => mediaKind(i) === 'other').length,
      };
    }
    return folderQueryRQ.data;
  }, [flatten, folderQueryRQ.data, streamQuery.items, streamQuery.name, activeId]);

  const queryError = flatten ? streamQuery.error : folderQueryRQ.error;
  const isLoading = flatten ? streamQuery.isLoading : folderQueryRQ.isLoading;
  const isFetching = flatten ? streamQuery.isLoading : folderQueryRQ.isFetching;
  const isError = flatten ? Boolean(streamQuery.error) : folderQueryRQ.isError;

  useEffect(() => {
    if (queryError instanceof FolderFetchError) {
      if (queryError.code === 'password_required') {
        setNeedPassword(true);
        setWrongPassword(false);
      } else if (queryError.code === 'wrong_password') {
        setNeedPassword(true);
        setWrongPassword(true);
      }
    }
  }, [queryError]);

  useEffect(() => {
    if (needPassword && folderData && !isError) {
      setNeedPassword(false);
      setWrongPassword(false);
    }
  }, [needPassword, folderData, isError]);

  const resetBrowsingState = () => {
    setFlatten(false);
    setRescanToken(0);
    setFavoritesOnly(false);
    setShuffle(false);
    setShuffleSeed(0);
    setSearch('');
    setNeedPassword(false);
    setWrongPassword(false);
    setPasswordHash(undefined);
  };

  // Wired into the browser History API (below) so the Android app's
  // hardware/gesture back button — which only ever calls webView.goBack(),
  // see MainActivity.kt — has actual in-app navigation to step through
  // instead of immediately exiting the whole app from inside any folder.
  interface NavState {
    rootId: string | null;
    trail: BreadcrumbEntry[];
  }

  const handleLoad = (id: string, name?: string) => {
    resetBrowsingState();
    setRootId(id);
    setTrail([]);
    history.pushState({ rootId: id, trail: [] } satisfies NavState, '');
    if (name && buildMode === 'admin') pushRecentFolder({ id, name });
  };

  const handlePassword = async (password: string) => {
    const hash = await sha256Hex(password);
    setPasswordHash(hash);
  };

  const handleSort = (s: SortKey) => {
    setSort(s);
    setSortPref(s);
  };

  const goHome = () => {
    setRootId(null);
    setTrail([]);
    resetBrowsingState();
    history.pushState({ rootId: null, trail: [] } satisfies NavState, '');
  };

  const openFolder = (id: string, name: string) => {
    const nextTrail = [...trail, { id, name }];
    setTrail(nextTrail);
    setFlatten(false);
    setRescanToken(0);
    setFavoritesOnly(false);
    setShuffle(false);
    setSearch('');
    history.pushState({ rootId, trail: nextTrail } satisfies NavState, '');
  };

  const navigateBreadcrumb = (_id: string, index: number) => {
    const nextTrail = trail.slice(0, index + 1);
    setTrail(nextTrail);
    setFlatten(false);
    setRescanToken(0);
    setFavoritesOnly(false);
    setShuffle(false);
    setSearch('');
    history.pushState({ rootId, trail: nextTrail } satisfies NavState, '');
  };

  // Restores state on browser/Android back-navigation — this is what makes
  // the pushState calls above actually do something, rather than just
  // silently padding the history stack.
  useEffect(() => {
    history.replaceState({ rootId: null, trail: [] } satisfies NavState, '');
    const onPopState = (e: PopStateEvent) => {
      const state = e.state as NavState | null;
      setRootId(state?.rootId ?? null);
      setTrail(state?.trail ?? []);
      setFlatten(false);
      setRescanToken(0);
      setFavoritesOnly(false);
      setShuffle(false);
      setSearch('');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleRescan = () => setRescanToken((t) => t + 1);

  const toggleMediaFilter = (key: keyof MediaFilters) => {
    setMediaFilters((f) => ({ ...f, [key]: !f[key] }));
  };

  const handleBlurModeChange = (on: boolean) => {
    setBlurModeState(on);
    persistBlurMode(on);
  };

  const handleDensityChange = (d: Density) => {
    setDensityState(d);
    persistDensity(d);
  };

  const handleShuffleChange = (on: boolean) => {
    setShuffle(on);
    if (on) setShuffleSeed((s) => (s === 0 ? Date.now() : s));
  };

  const handleReshuffle = () => setShuffleSeed(Date.now());

  const handleStopServer = () => {
    if (!window.confirm('Stop the GoFlix server? You will need to relaunch it to use the app again.')) {
      return;
    }
    void fetch('/api/shutdown', { method: 'POST' }).catch(() => undefined);
    setServerStopped(true);
  };

  const children = folderData?.children ?? EMPTY_CHILDREN;
  const videos = useMemo(() => children.filter((c) => mediaKind(c) === 'video'), [children]);
  const images = useMemo(() => children.filter((c) => mediaKind(c) === 'image'), [children]);
  const gifs = useMemo(() => children.filter((c) => mediaKind(c) === 'gif'), [children]);
  const folders = useMemo(() => children.filter((c) => c.type === 'folder'), [children]);
  const others = useMemo(
    () => children.filter((c) => c.type === 'file' && mediaKind(c) === 'other'),
    [children],
  );

  const continueWatching = useContinueWatching(rootId ?? undefined);

  const playContinue = (p: WatchProgress) => {
    setPlaying({
      id: p.fileId,
      name: p.name,
      type: 'file',
      directLink: p.directLink,
      mediaType: 'video',
    });
  };

  const { count: favoritesCount } = useFavorites();
  const counts = {
    video: videos.length,
    image: images.length,
    gif: gifs.length,
    other: others.length,
    favorites: favoritesCount,
  };

  const isRateLimited = queryError instanceof FolderFetchError && queryError.code === 'rate_limited';
  const errorBanner =
    queryError && !needPassword
      ? queryError instanceof FolderFetchError
        ? queryError.message
        : 'Something went wrong loading this folder.'
      : null;

  const retryLoad = () => {
    if (flatten) setRescanToken((t) => t + 1);
    else void folderQueryRQ.refetch();
  };

  const playerQueue = useMemo(() => {
    if (!playing) return [];
    const kind = mediaKind(playing);
    return kind === 'video' ? videos : [...images, ...gifs];
  }, [playing, videos, images, gifs]);

  if (serverStopped) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface text-center">
        <p className="text-2xl font-medium text-white">Server stopped</p>
        <p className="max-w-sm text-sm text-zinc-400">
          GoFlix has been shut down. Close this tab, or relaunch the app to continue.
        </p>
      </div>
    );
  }

  if (!rootId) {
    return (
      <LandingInput
        onLoad={handleLoad}
        loading={isLoading}
        errorMessage={errorBanner}
        onTokenChange={(t) => setAccountToken(t)}
        onStopServer={handleStopServer}
      />
    );
  }

  return (
    <div className="app-ambient min-h-screen pb-16">
      <header className="sticky top-0 z-40 border-b border-zinc-900 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3">
          <button
            type="button"
            onClick={goHome}
            className="shrink-0 font-display text-2xl tracking-wide text-white"
          >
            GO<span className="text-accent">FLIX</span>
          </button>
          <Breadcrumbs items={trail} onNavigate={navigateBreadcrumb} onHome={goHome} />
          <div className="ml-auto flex divide-x divide-zinc-800 overflow-hidden rounded-md border border-zinc-800 text-sm">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="px-3 py-1.5 text-zinc-400 transition hover:text-white"
              title="How to use GoFlix"
            >
              ❔ Guide
            </button>
            <button
              type="button"
              onClick={() => handleBlurModeChange(!blurMode)}
              className={`px-3 py-1.5 transition ${
                blurMode ? 'bg-accent/20 text-white' : 'text-zinc-400 hover:text-white'
              }`}
              title="Blur thumbnails until revealed"
            >
              {blurMode ? '🙈 Blur on' : '👁 Blur off'}
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="px-3 py-1.5 text-zinc-400 transition hover:text-white"
            >
              🔑 Token
            </button>
            <button
              type="button"
              onClick={handleStopServer}
              className="px-3 py-1.5 text-zinc-400 transition hover:text-accent"
              title="Stop server"
            >
              ⏻
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-4">
        {errorBanner && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-white">
            <span>{errorBanner}</span>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={retryLoad}
                disabled={isFetching}
                className="rounded border border-white/30 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
              >
                {isFetching ? 'Retrying…' : '↻ Retry'}
              </button>
              {isRateLimited && (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="rounded bg-accent px-2.5 py-1 text-xs font-medium hover:bg-accent-hover"
                >
                  Set account token
                </button>
              )}
            </div>
          </div>
        )}

        {flatten && streamQuery.isLoading && (
          <p className="mb-3 text-xs text-zinc-500">
            {rescanToken > 0
              ? 'Rescanning for new files…'
              : 'Still scanning subfolders — items will keep appearing…'}
          </p>
        )}

        {isLoading && !folderData ? (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${density === 'compact' ? 6 : 4}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="skeleton aspect-video rounded-md" />
            ))}
          </div>
        ) : (
          folderData && (
            <>
              <SortFilterBar
                sort={sort}
                onSortChange={handleSort}
                search={search}
                onSearchChange={setSearch}
                filters={mediaFilters}
                onToggleFilter={toggleMediaFilter}
                counts={counts}
                favoritesOnly={favoritesOnly}
                onFavoritesOnlyChange={setFavoritesOnly}
                flatten={flatten}
                onFlattenChange={setFlatten}
                shuffle={shuffle}
                onShuffleChange={handleShuffleChange}
                onReshuffle={handleReshuffle}
                groupByType={groupByType}
                onGroupByTypeChange={setGroupByType}
                density={density}
                onDensityChange={handleDensityChange}
                onRescan={handleRescan}
                rescanning={isFetching}
              />

              <LibraryGrid
                videos={videos}
                images={images}
                gifs={gifs}
                folders={folders}
                others={others}
                sort={sort}
                search={search}
                filters={mediaFilters}
                favoritesOnly={favoritesOnly}
                shuffle={shuffle}
                shuffleSeed={shuffleSeed}
                groupByType={groupByType}
                density={density}
                blurMode={blurMode}
                continueWatching={continueWatching}
                folderId={activeId ?? ''}
                onPlay={setPlaying}
                onOpenFolder={openFolder}
                onPlayContinue={playContinue}
              />
            </>
          )
        )}
      </main>

      {needPassword && (
        <PasswordPrompt
          wrongPassword={wrongPassword}
          busy={isFetching}
          onSubmit={(p) => void handlePassword(p)}
          onCancel={goHome}
        />
      )}

      {playing && (
        <Player
          item={playing}
          queue={playerQueue}
          folderId={activeId ?? ''}
          onClose={() => setPlaying(null)}
          onPlayNext={setPlaying}
        />
      )}

      <TokenSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={(t) => setAccountToken(t)}
      />

      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
