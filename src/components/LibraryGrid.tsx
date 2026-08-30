import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { PosterCard } from './PosterCard';
import { useInView } from '../hooks/useInView';
import { useCollectionPreview } from '../hooks/useCollectionPreview';
import { useVideoDurations } from '../hooks/useVideoDurations';
import { useFavorites } from '../hooks/useFavorites';
import { getCachedDuration } from '../lib/durationCache';
import { buildStreamSrc } from '../lib/media';
import type { Density } from '../lib/storage';
import type { MediaFilters } from './SortFilterBar';
import type { NormalizedItem, SortKey, WatchProgress } from '../types';

interface Props {
  videos: NormalizedItem[];
  images: NormalizedItem[];
  gifs: NormalizedItem[];
  folders: NormalizedItem[];
  others: NormalizedItem[];
  sort: SortKey;
  search: string;
  filters: MediaFilters;
  favoritesOnly: boolean;
  shuffle: boolean;
  shuffleSeed: number;
  groupByType: boolean;
  density: Density;
  blurMode: boolean;
  continueWatching: WatchProgress[];
  folderId: string;
  onPlay: (item: NormalizedItem) => void;
  onOpenFolder: (id: string, name: string) => void;
  onPlayContinue: (progress: WatchProgress) => void;
}

function isDurationSort(sort: SortKey): boolean {
  return sort === 'duration-longest' || sort === 'duration-shortest';
}

function sortItems(items: NormalizedItem[], sort: SortKey): NormalizedItem[] {
  const arr = [...items];
  switch (sort) {
    case 'name-asc':
      arr.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'name-desc':
      arr.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'date-newest':
      arr.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      break;
    case 'date-oldest':
      arr.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
      break;
    case 'size-largest':
      arr.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
      break;
    case 'size-smallest':
      arr.sort((a, b) => (a.size ?? 0) - (b.size ?? 0));
      break;
    case 'duration-longest':
      arr.sort((a, b) => (getCachedDuration(b.id) ?? -1) - (getCachedDuration(a.id) ?? -1));
      break;
    case 'duration-shortest':
      arr.sort((a, b) => {
        const ad = getCachedDuration(a.id);
        const bd = getCachedDuration(b.id);
        if (ad == null && bd == null) return 0;
        if (ad == null) return 1;
        if (bd == null) return -1;
        return ad - bd;
      });
      break;
  }
  return arr;
}

function shuffleWeight(id: string, seed: number): number {
  let h = seed || 1;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function shuffleItems(items: NormalizedItem[], seed: number): NormalizedItem[] {
  return [...items].sort((a, b) => shuffleWeight(a.id, seed) - shuffleWeight(b.id, seed));
}

function orderItems(items: NormalizedItem[], sort: SortKey, shuffle: boolean, shuffleSeed: number) {
  return shuffle ? shuffleItems(items, shuffleSeed) : sortItems(items, sort);
}

function useFilteredOrdered(
  items: NormalizedItem[],
  search: string,
  favoritesOnly: boolean,
  favoriteIds: string[],
  sort: SortKey,
  shuffle: boolean,
  shuffleSeed: number,
): NormalizedItem[] {
  return useMemo(() => {
    let filtered = items;
    const q = search.trim().toLowerCase();
    if (q) filtered = filtered.filter((i) => i.name.toLowerCase().includes(q));
    if (favoritesOnly) {
      const set = new Set(favoriteIds);
      filtered = filtered.filter((i) => set.has(i.id));
    }
    return orderItems(filtered, sort, shuffle, shuffleSeed);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- favoriteIds identity changes on every favorites store emit
  }, [items, search, favoritesOnly, favoriteIds, sort, shuffle, shuffleSeed]);
}

function computeColumns(density: Density): number {
  const w = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const steps =
    density === 'compact'
      ? ([[1536, 8], [1280, 7], [1024, 6], [768, 4], [640, 3], [0, 2]] as const)
      : ([[1536, 6], [1280, 5], [1024, 4], [768, 3], [640, 2], [0, 1]] as const);
  for (const [min, cols] of steps) if (w >= min) return cols;
  return 2;
}

function useColumnCount(density: Density): number {
  const [cols, setCols] = useState(() => computeColumns(density));
  useLayoutEffect(() => {
    const onResize = () => setCols(computeColumns(density));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [density]);
  return cols;
}

/** Cheaply keeps the window-virtualizer's scrollMargin in sync with content
 * rendered above the grid (header, filter bar, banners) even when that
 * content's height changes without a window resize event. */
function useScrollMargin(ref: React.RefObject<HTMLDivElement | null>): number {
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      if (ref.current) setMargin(ref.current.offsetTop);
    };
    measure();
    window.addEventListener('resize', measure);
    const id = window.setInterval(measure, 400);
    return () => {
      window.removeEventListener('resize', measure);
      window.clearInterval(id);
    };
  }, [ref]);
  return margin;
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-2 mt-8 flex items-baseline gap-2 first:mt-0">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <span className="text-sm text-zinc-500">{count}</span>
    </div>
  );
}

function CollectionRow({
  folder,
  onOpen,
  priority,
}: {
  folder: NormalizedItem;
  onOpen: (id: string, name: string) => void;
  priority: boolean;
}) {
  const [ref, observed] = useInView<HTMLButtonElement>();
  const inView = priority || observed;
  const preview = useCollectionPreview(folder.id, inView);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onOpen(folder.id, folder.name)}
      className="flex w-full items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-2 text-left transition hover:border-zinc-600 hover:bg-zinc-900"
    >
      <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-800">
        {preview.thumbnailSrc ? (
          <img src={preview.thumbnailSrc} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="text-xl">📁</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{folder.name}</p>
        <p className="text-xs text-zinc-500">
          {preview.loading ? 'Loading…' : preview.itemCount != null ? `${preview.itemCount} items` : 'Collection'}
        </p>
      </div>
      <span className="text-zinc-600">›</span>
    </button>
  );
}

function MediaGrid({
  items,
  density,
  blurMode,
  progressMap,
  onPlay,
}: {
  items: NormalizedItem[];
  density: Density;
  blurMode: boolean;
  progressMap: Map<string, WatchProgress>;
  onPlay: (item: NormalizedItem) => void;
}) {
  const cols = useColumnCount(density);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollMargin = useScrollMargin(containerRef);

  const rows = useMemo(() => {
    const out: NormalizedItem[][] = [];
    for (let i = 0; i < items.length; i += cols) out.push(items.slice(i, i + cols));
    return out;
  }, [items, cols]);

  const rowVirtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => (density === 'compact' ? 150 : 200),
    overscan: 4,
    scrollMargin,
  });

  return (
    <div ref={containerRef} style={{ position: 'relative', height: rowVirtualizer.getTotalSize() }}>
      {rowVirtualizer.getVirtualItems().map((vRow) => {
        const row = rows[vRow.index];
        return (
          <div
            key={vRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vRow.start - scrollMargin}px)`,
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap: '0.75rem',
              paddingBottom: '0.75rem',
            }}
          >
            {row.map((item) => (
              <PosterCard
                key={item.id}
                item={item}
                progress={progressMap.get(item.id)}
                onPlay={onPlay}
                blurMode={blurMode}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function LibraryGrid({
  videos,
  images,
  gifs,
  folders,
  others,
  sort,
  search,
  filters,
  favoritesOnly,
  shuffle,
  shuffleSeed,
  groupByType,
  density,
  blurMode,
  continueWatching,
  onPlay,
  onOpenFolder,
  onPlayContinue,
}: Props) {
  const { ids: favoriteIds } = useFavorites();

  const activeVideos = filters.video ? videos : [];
  const activeImages = filters.image ? images : [];
  const activeGifs = filters.gif ? gifs : [];
  const activeOthers = filters.other ? others : [];

  const durationProgress = useVideoDurations(activeVideos, isDurationSort(sort));

  const orderedVideos = useFilteredOrdered(
    activeVideos,
    search,
    favoritesOnly,
    favoriteIds,
    sort,
    shuffle,
    shuffleSeed,
  );
  const orderedImages = useFilteredOrdered(
    activeImages,
    search,
    favoritesOnly,
    favoriteIds,
    sort,
    shuffle,
    shuffleSeed,
  );
  const orderedGifs = useFilteredOrdered(
    activeGifs,
    search,
    favoritesOnly,
    favoriteIds,
    sort,
    shuffle,
    shuffleSeed,
  );
  const orderedOthers = useFilteredOrdered(
    activeOthers,
    search,
    favoritesOnly,
    favoriteIds,
    sort,
    shuffle,
    shuffleSeed,
  );

  const combined = useMemo(
    () => [...orderedVideos, ...orderedImages, ...orderedGifs],
    [orderedVideos, orderedImages, orderedGifs],
  );

  const progressMap = useMemo(() => {
    const map = new Map<string, WatchProgress>();
    for (const p of continueWatching) map.set(p.fileId, p);
    return map;
  }, [continueWatching]);

  const showDurationBar =
    !shuffle && isDurationSort(sort) && durationProgress.total > 0 && durationProgress.settled < durationProgress.total;

  const totalShown =
    orderedVideos.length + orderedImages.length + orderedGifs.length + orderedOthers.length;

  return (
    <div>
      {showDurationBar && (
        <div className="mb-4 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Reading video durations…</span>
            <span>
              {durationProgress.settled}/{durationProgress.total}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-accent transition-all"
              style={{
                width: `${(durationProgress.settled / Math.max(1, durationProgress.total)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {continueWatching.length > 0 && (
        <div className="mb-2">
          <SectionHeader title="Continue Watching" count={continueWatching.length} />
          <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-2">
            {continueWatching.map((p) => (
              <button
                key={p.fileId}
                type="button"
                onClick={() => onPlayContinue(p)}
                className="w-56 shrink-0 rounded-md border border-zinc-800 bg-zinc-900 p-2 text-left transition hover:border-zinc-600"
              >
                <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${Math.min(100, (p.currentTime / Math.max(1, p.duration)) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 truncate text-xs font-medium text-white">{p.name}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {folders.length > 0 && (
        <div>
          <SectionHeader title="Collections" count={folders.length} />
          <div className="space-y-2">
            {folders.map((folder, i) => (
              <CollectionRow key={folder.id} folder={folder} onOpen={onOpenFolder} priority={i < 8} />
            ))}
          </div>
        </div>
      )}

      {totalShown === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center text-zinc-500">
          <p className="text-3xl">📭</p>
          <p className="mt-3 text-sm">
            {search ? `No results for "${search}"` : 'Nothing here matches the current filters.'}
          </p>
        </div>
      ) : groupByType ? (
        <>
          {orderedVideos.length > 0 && (
            <div>
              <SectionHeader title="Titles" count={orderedVideos.length} />
              <MediaGrid
                items={orderedVideos}
                density={density}
                blurMode={blurMode}
                progressMap={progressMap}
                onPlay={onPlay}
              />
            </div>
          )}
          {orderedImages.length > 0 && (
            <div>
              <SectionHeader title="Pictures" count={orderedImages.length} />
              <MediaGrid
                items={orderedImages}
                density={density}
                blurMode={blurMode}
                progressMap={progressMap}
                onPlay={onPlay}
              />
            </div>
          )}
          {orderedGifs.length > 0 && (
            <div>
              <SectionHeader title="GIFs" count={orderedGifs.length} />
              <MediaGrid
                items={orderedGifs}
                density={density}
                blurMode={blurMode}
                progressMap={progressMap}
                onPlay={onPlay}
              />
            </div>
          )}
        </>
      ) : (
        combined.length > 0 && (
          <div>
            <SectionHeader title="Media" count={combined.length} />
            <MediaGrid
              items={combined}
              density={density}
              blurMode={blurMode}
              progressMap={progressMap}
              onPlay={onPlay}
            />
          </div>
        )
      )}

      {orderedOthers.length > 0 && (
        <div>
          <SectionHeader title="Other files" count={orderedOthers.length} />
          <div className="space-y-1">
            {orderedOthers.map((item) => (
              <a
                key={item.id}
                href={buildStreamSrc(item)}
                download={item.name}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
              >
                <span>📄</span>
                <span className="truncate">{item.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
