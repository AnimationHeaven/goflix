import type { ReactNode } from 'react';

/** Illustrative, non-interactive recreations of the real UI — used only in
 * the in-app guide so members can see what a control looks like before
 * they go looking for it. Built from the same design tokens as the real
 * components, not screenshots, so there's nothing to keep in sync. */

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-black shadow-lg">
      <div className="flex items-center gap-1.5 border-b border-zinc-800 bg-zinc-900 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-zinc-700" />
        <span className="h-2 w-2 rounded-full bg-zinc-700" />
        <span className="h-2 w-2 rounded-full bg-zinc-700" />
        <span className="ml-2 font-mono text-[10px] text-zinc-500">{label}</span>
      </div>
      <div className="bg-zinc-950 p-4">{children}</div>
    </div>
  );
}

export function LandingMockup() {
  return (
    <Frame label="GoFlix">
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <p className="font-display text-2xl tracking-wide text-white">
          GO<span className="text-accent">FLIX</span>
        </p>
        <p className="text-[11px] text-zinc-500">Paste a Gofile folder link or ID to start browsing.</p>
        <div className="flex w-full max-w-[280px] gap-1.5">
          <span className="flex-1 truncate rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-[10px] text-zinc-500">
            https://gofile.io/d/XXXXXX
          </span>
          <span className="shrink-0 rounded bg-accent px-3 py-1.5 text-[10px] font-semibold text-white">
            Browse
          </span>
        </div>
      </div>
    </Frame>
  );
}

const TILES = [
  { grad: 'from-violet-900 to-indigo-950', tag: '12:04', star: true },
  { grad: 'from-rose-900 to-red-950', tag: '4:41', watched: true },
  { grad: 'from-cyan-900 to-slate-950', tag: '1080×1350' },
  { grad: 'from-amber-800 to-yellow-950', tag: 'GIF' },
  { grad: 'from-emerald-900 to-green-950', tag: '8:19' },
  { grad: 'from-pink-900 to-rose-950', tag: '2160×3840', star: true },
];

export function BrowseMockup() {
  return (
    <Frame label="GoFlix — Collection">
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full border border-accent/40 bg-accent/15 px-2.5 py-1 text-[10px] font-medium text-white">
          Videos 40
        </span>
        <span className="rounded-full border border-accent/40 bg-accent/15 px-2.5 py-1 text-[10px] font-medium text-white">
          Pictures 60
        </span>
        <span className="rounded-full border border-accent/40 bg-accent/15 px-2.5 py-1 text-[10px] font-medium text-white">
          GIFs 15
        </span>
        <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-[10px] text-zinc-500">
          ★ Favorites 3
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-500">
          Search this folder…
        </span>
        <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-500">
          Newest first ▾
        </span>
        <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-500">
          🔀 Shuffle
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {TILES.map((t, i) => (
          <div
            key={i}
            className={`relative flex aspect-video items-end rounded bg-gradient-to-br p-1.5 ${t.grad}`}
          >
            {t.star && <span className="absolute right-1.5 top-1.5 text-[10px] text-white">★</span>}
            {t.watched && (
              <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1 text-[8px] text-emerald-400">
                ✓
              </span>
            )}
            <span className="rounded bg-black/55 px-1 font-mono text-[8px] text-white">{t.tag}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function CollectionMockup() {
  return (
    <Frame label="Collections">
      <div className="flex items-center gap-2.5 rounded-md border border-zinc-800 bg-zinc-900 p-2">
        <div className="h-10 w-16 shrink-0 rounded bg-gradient-to-br from-fuchsia-900 to-purple-950" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-white">Season 3 — Uncut</p>
          <p className="text-[10px] text-zinc-500">212 items</p>
        </div>
        <span className="text-zinc-600">›</span>
      </div>
    </Frame>
  );
}

export function PlayerMockup() {
  return (
    <Frame label="Now Playing">
      <div className="relative aspect-video overflow-hidden rounded bg-gradient-to-br from-indigo-900 via-purple-900 to-rose-950">
        <div className="absolute inset-x-0 top-0 flex justify-between p-2 text-[9px] text-white/85">
          <span>Cold Open — Episode 4</span>
          <span>1920×1080</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2.5">
          <div className="relative mb-2 h-1 rounded-full bg-white/25">
            <div className="h-full w-[38%] rounded-full bg-accent" />
            <div className="absolute left-[38%] top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
          </div>
          <div className="flex items-center gap-3 text-[9px] text-white">
            <span>⏸</span>
            <span className="font-mono text-white/75">4:32 / 12:04</span>
            <span>🔊</span>
            <span className="ml-auto">1×</span>
            <span>Next ⏭</span>
            <span>⛶</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function ViewerMockup() {
  return (
    <Frame label="Poster_04.png">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded bg-gradient-to-br from-cyan-900 to-slate-950">
        <div className="absolute inset-x-0 top-0 flex justify-between p-2 text-[9px] text-white">
          <span>Poster_04.png</span>
          <span className="text-white/80">⭳ Download &nbsp; ✕ Close</span>
        </div>
        <span className="absolute left-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-xs text-white">
          ‹
        </span>
        <span className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-xs text-white">
          ›
        </span>
        <span className="absolute bottom-2 left-2 rounded bg-black/55 px-1.5 py-0.5 text-[8px] text-white">
          GIF
        </span>
      </div>
    </Frame>
  );
}
