import { useEffect, useRef, useState } from 'react';
import { setKnownResolution } from '../lib/durationCache';
import { buildStreamSrc, isMkv, mediaKind } from '../lib/media';
import { formatDuration, stripExtension } from '../lib/gofileParse';
import { bumpProgress } from '../hooks/useWatchProgress';
import { useMkvRemux } from '../hooks/useMkvRemux';
import type { NormalizedItem } from '../types';

interface PlayerProps {
  item: NormalizedItem;
  queue: NormalizedItem[];
  folderId: string;
  onClose: () => void;
  onPlayNext: (item: NormalizedItem) => void;
}

export function Player(props: PlayerProps) {
  if (mediaKind(props.item) !== 'video') return <ImageViewer {...props} />;
  return <VideoPlayer {...props} />;
}

const SWIPE_THRESHOLD_PX = 50;

function queueNeighbors(queue: NormalizedItem[], item: NormalizedItem) {
  const idx = queue.findIndex((q) => q.id === item.id);
  if (idx < 0) return { prev: null, next: null };
  return {
    prev: idx > 0 ? queue[idx - 1] : null,
    next: idx < queue.length - 1 ? queue[idx + 1] : null,
  };
}

function ImageViewer({ item, queue, onClose, onPlayNext }: PlayerProps) {
  const { prev, next } = queueNeighbors(queue, item);
  const [resolution, setResolution] = useState<{ w: number; h: number } | null>(null);
  const touchStart = useRef<number | null>(null);
  const isGif = mediaKind(item) === 'gif';

  useEffect(() => setResolution(null), [item.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && prev) onPlayNext(prev);
      else if (e.key === 'ArrowRight' && next) onPlayNext(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onClose, onPlayNext]);

  const src = buildStreamSrc(item);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="max-w-md truncate text-sm font-medium text-white">
            {stripExtension(item.name)}
            {isGif && <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">GIF</span>}
          </p>
          {resolution && (
            <p className="text-xs text-zinc-500">
              {resolution.w}×{resolution.h}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={src}
            download={item.name}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            ⭳ Download
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
          >
            ✕ Close
          </button>
        </div>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-4"
        onTouchStart={(e) => {
          touchStart.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStart.current == null) return;
          const dx = (e.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current;
          if (dx > SWIPE_THRESHOLD_PX && prev) onPlayNext(prev);
          else if (dx < -SWIPE_THRESHOLD_PX && next) onPlayNext(next);
          touchStart.current = null;
        }}
      >
        {prev && (
          <button
            type="button"
            onClick={() => onPlayNext(prev)}
            className="absolute left-2 z-10 rounded-full bg-black/50 p-3 text-xl text-white hover:bg-black/70"
          >
            ‹
          </button>
        )}
        <img
          src={src}
          alt={item.name}
          className="max-h-full max-w-full object-contain"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > 0) setResolution({ w: img.naturalWidth, h: img.naturalHeight });
          }}
        />
        {next && (
          <button
            type="button"
            onClick={() => onPlayNext(next)}
            className="absolute right-2 z-10 rounded-full bg-black/50 p-3 text-xl text-white hover:bg-black/70"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const UP_NEXT_SECONDS = 8;

function VideoPlayer({ item, queue, folderId, onClose, onPlayNext }: PlayerProps) {
  const { next } = queueNeighbors(queue, item);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [resolution, setResolution] = useState<{ w: number; h: number } | null>(null);
  const [upNextCountdown, setUpNextCountdown] = useState<number | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const countdownTimer = useRef<number | undefined>(undefined);

  const mkv = isMkv(item);
  const remux = useMkvRemux(item, mkv);
  const checking = mkv && remux.state === 'checking';
  const choice = mkv && remux.state === 'choice';
  const preparing = mkv && remux.state === 'preparing';
  const unsupported = mkv && remux.state === 'unavailable';
  const src = mkv && remux.state === 'ready' ? remux.src : buildStreamSrc(item);

  useEffect(() => {
    setResolution(null);
    setUpNextCountdown(null);
    setCurrentTime(0);
    setDuration(0);
  }, [item.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') seekBy(5);
      else if (e.key === 'ArrowLeft') seekBy(-5);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers reference latest video via ref
  }, [onClose]);

  useEffect(() => {
    return () => {
      window.clearTimeout(hideTimer.current);
      window.clearInterval(countdownTimer.current);
    };
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(0, v.currentTime + delta), v.duration || Infinity);
  };

  const persist = () => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    bumpProgress({
      fileId: item.id,
      folderId,
      name: item.name,
      directLink: item.directLink,
      currentTime: v.currentTime,
      duration: v.duration,
      updatedAt: Date.now(),
    });
  };

  const wakeControls = () => {
    setShowControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowControls(false), 3000);
  };

  const startUpNext = () => {
    if (!next) return;
    setUpNextCountdown(UP_NEXT_SECONDS);
    countdownTimer.current = window.setInterval(() => {
      setUpNextCountdown((c) => {
        if (c == null) return null;
        if (c <= 1) {
          window.clearInterval(countdownTimer.current);
          onPlayNext(next);
          return null;
        }
        return c - 1;
      });
    }, 1000);
  };

  if (checking) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/95 px-4 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
        <p className="text-sm text-zinc-400">Checking playback…</p>
      </div>
    );
  }

  if (choice) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/95 px-4 text-center">
        <p className="text-lg font-medium text-white">
          {stripExtension(item.name)} needs to be converted to play in-browser (MKV).
        </p>
        <p className="max-w-sm text-sm text-zinc-400">
          This can take anywhere from under a minute to several minutes depending on file size — it
          only happens once, then it's cached for next time.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={remux.start}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            ▶ Convert &amp; Play
          </button>
          <a
            href={src}
            download={item.name}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            ⭳ Download instead
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (preparing) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/95 px-4 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
        <p className="text-sm text-zinc-400">Converting this video for playback…</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (unsupported) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/95 px-4 text-center">
        <p className="text-lg font-medium text-white">
          {stripExtension(item.name)} can't be played in-browser (MKV).
        </p>
        <p className="max-w-sm text-sm text-zinc-400">
          {mkv && remux.reason
            ? remux.reason
            : "Most browsers can't decode this container. Download it to watch locally."}
        </p>
        <div className="flex gap-3">
          <a
            href={src}
            download={item.name}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            ⭳ Download
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black"
      onMouseMove={wakeControls}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        src={src}
        autoPlay
        className="h-full w-full object-contain"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setDuration(v.duration);
          if (v.videoWidth > 0 && v.videoHeight > 0) {
            setResolution({ w: v.videoWidth, h: v.videoHeight });
            setKnownResolution(item.id, v.videoWidth, v.videoHeight);
          }
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setCurrentTime(v.currentTime);
          if (Math.floor(v.currentTime) % 5 === 0) persist();
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          persist();
        }}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
        onEnded={() => {
          persist();
          if (next) startUpNext();
        }}
      />

      <div
        className={`pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3 transition ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="pointer-events-auto">
          <p className="max-w-md truncate text-sm font-medium text-white">{stripExtension(item.name)}</p>
          {resolution && (
            <p className="text-xs text-zinc-400">
              {resolution.w}×{resolution.h}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            persist();
            onClose();
          }}
          className="pointer-events-auto rounded-md px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800/70 hover:text-white"
        >
          ✕ Close
        </button>
      </div>

      {upNextCountdown != null && next && (
        <div className="pointer-events-auto absolute bottom-24 right-4 rounded-lg border border-zinc-700 bg-zinc-900/95 p-3 text-sm text-white">
          <p className="text-xs text-zinc-400">Up next in {upNextCountdown}s</p>
          <p className="mt-0.5 max-w-xs truncate font-medium">{stripExtension(next.name)}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.clearInterval(countdownTimer.current);
                onPlayNext(next);
              }}
              className="rounded bg-accent px-2.5 py-1 text-xs hover:bg-accent-hover"
            >
              Play now
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.clearInterval(countdownTimer.current);
                setUpNextCountdown(null);
              }}
              className="rounded border border-zinc-600 px-2.5 py-1 text-xs hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/90 to-transparent px-4 pb-4 pt-10 transition ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={(e) => {
            const v = videoRef.current;
            if (v) v.currentTime = Number(e.target.value);
          }}
          className="w-full accent-accent"
        />
        <div className="flex items-center gap-3 text-sm text-white">
          <button type="button" onClick={togglePlay} className="text-lg">
            {playing ? '⏸' : '▶'}
          </button>
          <span className="text-xs text-zinc-400">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                v.muted = !v.muted;
              }}
            >
              {muted || volume === 0 ? '🔇' : '🔊'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = videoRef.current;
                if (!v) return;
                v.volume = Number(e.target.value);
                v.muted = Number(e.target.value) === 0;
              }}
              className="w-20 accent-accent"
            />
          </div>

          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-xs"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>

          {next && (
            <button
              type="button"
              onClick={() => onPlayNext(next)}
              className="ml-1 rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
            >
              Next ⏭
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const el = containerRef.current;
              if (!el) return;
              if (document.fullscreenElement) void document.exitFullscreen();
              else void el.requestFullscreen();
            }}
            className="ml-auto rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
          >
            ⛶ Fullscreen
          </button>
        </div>
      </div>
    </div>
  );
}
