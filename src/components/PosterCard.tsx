import { useState } from 'react';
import { useInView } from '../hooks/useInView';
import { useThumbnail } from '../hooks/useThumbnail';
import { useFavorites } from '../hooks/useFavorites';
import { useWatched } from '../hooks/useWatched';
import { getCachedDuration, getCachedResolution } from '../lib/durationCache';
import { buildStreamSrc, isBrowserPlayable, mediaKind } from '../lib/media';
import { formatBytes, formatDuration, stripExtension } from '../lib/gofileParse';
import type { NormalizedItem, WatchProgress } from '../types';

interface Props {
  item: NormalizedItem;
  progress?: WatchProgress;
  onPlay: (item: NormalizedItem) => void;
  priority?: boolean;
  blurMode?: boolean;
}

export function PosterCard({ item, progress, onPlay, priority, blurMode }: Props) {
  const [ref, observed] = useInView<HTMLDivElement>();
  const inView = priority || observed;
  const [hovering, setHovering] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [muted, setMuted] = useState(true);

  const kind = mediaKind(item);
  const isGif = kind === 'gif';
  const isPicture = kind === 'image' || isGif;
  const playable = kind === 'video' && isBrowserPlayable(item);

  const { poster, loading } = useThumbnail(item, kind !== 'other' && inView);
  const { isFavorite, toggle } = useFavorites();
  const { isWatched } = useWatched();

  const favorite = isFavorite(item.id);
  const watched = kind === 'video' && isWatched(item.id);
  const knownDuration = progress?.duration ?? (kind === 'video' ? getCachedDuration(item.id) : undefined);
  const resolution = kind === 'video' ? getCachedResolution(item.id) : undefined;

  const blurred = Boolean(blurMode) && !revealed;
  const showLiveGif = isGif && hovering && inView;
  const showVideoPreview = playable && hovering && inView;

  const progressRatio =
    progress && progress.duration > 0 ? Math.min(1, progress.currentTime / progress.duration) : 0;

  const mediaClass = 'h-full w-full object-cover';

  return (
    <div
      ref={ref}
      className="group relative aspect-video overflow-hidden rounded-md bg-zinc-900"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={() => onPlay(item)}
      role="button"
      tabIndex={0}
    >
      {loading && !poster && <div className="skeleton absolute inset-0" />}

      {showLiveGif ? (
        <img
          src={buildStreamSrc(item)}
          alt={item.name}
          className={`${mediaClass} ${blurred ? 'blur-xl scale-110' : ''}`}
          loading="lazy"
        />
      ) : showVideoPreview ? (
        <video
          src={buildStreamSrc(item)}
          className={`${mediaClass} ${blurred ? 'blur-xl scale-110' : ''}`}
          autoPlay
          loop
          muted={muted}
          playsInline
        />
      ) : (
        <img
          src={poster}
          alt={item.name}
          className={`${mediaClass} ${blurred ? 'blur-xl scale-110' : ''}`}
          loading="lazy"
        />
      )}

      {blurred && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setRevealed(true);
          }}
          className="reveal-chip absolute inset-0 flex items-center justify-center bg-black/30 text-sm font-medium text-white"
        >
          <span className="rounded-full border border-white/30 bg-black/40 px-3 py-1.5">
            👁 Reveal
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle(item.id);
        }}
        className={`absolute right-1.5 top-1.5 z-10 rounded-full p-1 text-sm transition ${
          favorite ? 'text-yellow-400' : 'text-white/60 opacity-0 group-hover:opacity-100'
        }`}
        title={favorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        {favorite ? '★' : '☆'}
      </button>

      {watched && (
        <span
          className="absolute left-1.5 top-1.5 z-10 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-emerald-400"
          title="Watched"
        >
          ✓
        </span>
      )}

      {isGif && (
        <span className="absolute left-1.5 bottom-1.5 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          GIF
        </span>
      )}

      {playable && !blurred && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMuted((m) => !m);
          }}
          className="absolute right-1.5 bottom-1.5 z-10 rounded-full bg-black/60 p-1 text-xs text-white opacity-0 transition group-hover:opacity-100"
        >
          {muted ? '🔇' : '🔊'}
        </button>
      )}

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
        <span className="rounded-full bg-black/50 p-3 text-xl text-white">
          {isPicture ? '👁' : '▶'}
        </span>
      </div>

      {progressRatio > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
          <div className="h-full bg-accent" style={{ width: `${progressRatio * 100}%` }} />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-4">
        <p className="truncate text-xs font-medium text-white">{stripExtension(item.name)}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-400">
          {kind === 'video' && knownDuration ? <span>{formatDuration(knownDuration)}</span> : null}
          {resolution ? <span>{resolution.width}×{resolution.height}</span> : null}
          {item.size ? <span>{formatBytes(item.size)}</span> : null}
        </p>
      </div>
    </div>
  );
}
