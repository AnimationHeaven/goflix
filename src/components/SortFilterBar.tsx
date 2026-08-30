import type { Density } from '../lib/storage';
import type { SortKey } from '../types';

export interface MediaFilters {
  video: boolean;
  image: boolean;
  gif: boolean;
  other: boolean;
}

export interface MediaCounts {
  video: number;
  image: number;
  gif: number;
  other: number;
  favorites: number;
}

interface Props {
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  search: string;
  onSearchChange: (s: string) => void;
  filters: MediaFilters;
  onToggleFilter: (key: keyof MediaFilters) => void;
  counts: MediaCounts;
  favoritesOnly: boolean;
  onFavoritesOnlyChange: (v: boolean) => void;
  flatten: boolean;
  onFlattenChange: (v: boolean) => void;
  shuffle: boolean;
  onShuffleChange: (v: boolean) => void;
  onReshuffle: () => void;
  groupByType: boolean;
  onGroupByTypeChange: (v: boolean) => void;
  density: Density;
  onDensityChange: (d: Density) => void;
  onRescan: () => void;
  rescanning: boolean;
}

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'name-desc', label: 'Name (Z–A)' },
  { value: 'date-newest', label: 'Newest first' },
  { value: 'date-oldest', label: 'Oldest first' },
  { value: 'size-largest', label: 'Largest first' },
  { value: 'size-smallest', label: 'Smallest first' },
  { value: 'duration-longest', label: 'Longest first' },
  { value: 'duration-shortest', label: 'Shortest first' },
];

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? 'border-accent bg-accent/20 text-white'
          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

export function SortFilterBar({
  sort,
  onSortChange,
  search,
  onSearchChange,
  filters,
  onToggleFilter,
  counts,
  favoritesOnly,
  onFavoritesOnlyChange,
  flatten,
  onFlattenChange,
  shuffle,
  onShuffleChange,
  onReshuffle,
  groupByType,
  onGroupByTypeChange,
  density,
  onDensityChange,
  onRescan,
  rescanning,
}: Props) {
  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill active={filters.video} onClick={() => onToggleFilter('video')}>
          Videos {counts.video}
        </FilterPill>
        <FilterPill active={filters.image} onClick={() => onToggleFilter('image')}>
          Pictures {counts.image}
        </FilterPill>
        <FilterPill active={filters.gif} onClick={() => onToggleFilter('gif')}>
          GIFs {counts.gif}
        </FilterPill>
        <FilterPill active={filters.other} onClick={() => onToggleFilter('other')}>
          Other {counts.other}
        </FilterPill>
        <span className="mx-1 h-4 w-px bg-zinc-800" />
        <FilterPill active={favoritesOnly} onClick={() => onFavoritesOnlyChange(!favoritesOnly)}>
          ★ Favorites {counts.favorites}
        </FilterPill>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search this folder…"
          className="min-w-[10rem] flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-accent sm:flex-none sm:w-64"
        />

        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-white outline-none focus:border-accent"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={flatten}
            onChange={(e) => onFlattenChange(e.target.checked)}
            className="accent-accent"
          />
          Include subfolders
        </label>

        {flatten && (
          <button
            type="button"
            onClick={onRescan}
            disabled={rescanning}
            className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-50"
          >
            {rescanning ? 'Rescanning…' : '↻ Rescan'}
          </button>
        )}

        <label className="flex items-center gap-1.5 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={groupByType}
            onChange={(e) => onGroupByTypeChange(e.target.checked)}
            className="accent-accent"
          />
          Group by type
        </label>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (!shuffle) onShuffleChange(true);
              else onReshuffle();
            }}
            className={`rounded-md border px-2.5 py-1.5 text-xs transition ${
              shuffle
                ? 'border-accent bg-accent/20 text-white'
                : 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white'
            }`}
            title={shuffle ? 'Shuffle again' : 'Shuffle order'}
          >
            🔀 {shuffle ? 'Reshuffle' : 'Shuffle'}
          </button>
          {shuffle && (
            <button
              type="button"
              onClick={() => onShuffleChange(false)}
              className="rounded-md px-1.5 py-1.5 text-xs text-zinc-500 hover:text-white"
              title="Turn off shuffle"
            >
              ✕
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1 rounded-md border border-zinc-700 p-0.5">
          <button
            type="button"
            onClick={() => onDensityChange('comfortable')}
            className={`rounded px-2 py-1 text-xs transition ${
              density === 'comfortable' ? 'bg-zinc-700 text-white' : 'text-zinc-400'
            }`}
          >
            Comfortable
          </button>
          <button
            type="button"
            onClick={() => onDensityChange('compact')}
            className={`rounded px-2 py-1 text-xs transition ${
              density === 'compact' ? 'bg-zinc-700 text-white' : 'text-zinc-400'
            }`}
          >
            Compact
          </button>
        </div>
      </div>
    </div>
  );
}
