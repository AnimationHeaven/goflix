import type { ReactNode } from 'react';
import { BrowseMockup, CollectionMockup, LandingMockup, PlayerMockup, ViewerMockup } from './GuideMockups';

interface Props {
  open: boolean;
  onClose: () => void;
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wider text-accent">{eyebrow}</p>
      <h3 className="font-display mt-1 text-2xl tracking-wide text-white">{title}</h3>
      <div className="mt-3 space-y-3 text-sm text-zinc-300">{children}</div>
    </section>
  );
}

function Callout({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-md border border-accent/30 bg-accent/10 px-3 py-2.5 text-sm text-zinc-200">
      <span className="shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
      <summary className="cursor-pointer list-none text-sm font-medium text-white marker:content-['']">
        <span className="mr-1.5 inline-block text-zinc-500 transition group-open:rotate-45">+</span>
        {q}
      </summary>
      <p className="mt-2 pl-5 text-sm text-zinc-400">{children}</p>
    </details>
  );
}

export function GuideModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="font-display text-2xl tracking-wide text-white">
            HOW TO USE <span className="text-accent">GOFLIX</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            ✕ Close
          </button>
        </div>

        <div className="scrollbar-thin space-y-8 overflow-y-auto px-6 py-6">
          <Section eyebrow="Getting Started" title="Paste, browse, watch">
            <p>
              GoFlix doesn't host anything — it's just a nicer window into a Gofile folder you
              already have access to.
            </p>
            <LandingMockup />
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>Paste your link — the exclusive Gofile link you were given, a full URL or just the code both work.</li>
              <li>Hit <b className="text-white">Browse</b>.</li>
              <li>GoFlix lays it out like a proper library — titles, pictures, and gifs sorted into their own sections.</li>
            </ol>
            <Callout icon="🔒">
              <b className="text-white">Your link is exclusive to you.</b> GoFlix never saves or
              displays a pasted link — even on a shared computer, the next person who opens the
              app won't see what you browsed.
            </Callout>
          </Section>

          <Section eyebrow="Browsing" title="Filter, search, sort">
            <BrowseMockup />
            <ul className="list-disc space-y-1.5 pl-5">
              <li><b className="text-white">Filter pills</b> — tap Videos / Pictures / GIFs / Other to show or hide a category. Counts update live.</li>
              <li><b className="text-white">Sort</b> — name, date, size, or duration. Duration sort reads each video's length in the background the first time.</li>
              <li><b className="text-white">Include subfolders</b> — pulls every file out of every collection into one flat view.</li>
              <li><b className="text-white">Shuffle</b> — randomizes the order. Tap again to reshuffle.</li>
              <li><b className="text-white">Collections</b> — subfolders show as a list with previews and item counts, above your media.</li>
            </ul>
            <CollectionMockup />
          </Section>

          <Section eyebrow="The Player" title="Click anything to open it">
            <ul className="list-disc space-y-1.5 pl-5">
              <li><b className="text-white">Video</b> — space to play/pause, ←/→ to seek, adjustable speed, an up-next queue.</li>
            </ul>
            <PlayerMockup />
            <ul className="list-disc space-y-1.5 pl-5">
              <li><b className="text-white">Pictures &amp; gifs</b> — arrow keys or swipe to move through the rest of the folder, download button included.</li>
            </ul>
            <ViewerMockup />
            <Callout icon="⚠️">
              Some old formats (like MKV) can't run in a browser at all — you'll get a direct
              download button instead of a broken player.
            </Callout>
          </Section>

          <Section eyebrow="Make It Yours" title="Favorites, watched, and privacy">
            <ul className="list-disc space-y-1.5 pl-5">
              <li><b className="text-white">⭐ Favorites</b> — hover a poster, tap the star, filter to Favorites any time.</li>
              <li><b className="text-white">✓ Watched</b> — a quiet checkmark once you finish something.</li>
              <li><b className="text-white">▶ Continue Watching</b> — resumes anything you stopped partway through.</li>
              <li><b className="text-white">👁 Blur mode</b> — toggle it in the header and every thumbnail blurs until you tap to reveal it.</li>
            </ul>
          </Section>

          <Section eyebrow="Good to Know" title="Common questions">
            <div className="space-y-2">
              <Faq q="I'm getting a &quot;rate-limiting&quot; message">
                That's Gofile itself throttling requests — not a GoFlix problem. Wait a few
                seconds and tap <b>↻ Retry</b> on the error banner. It usually clears within a
                minute.
              </Faq>
              <Faq q="Is my link visible to anyone else?">
                No. Your pasted link is never saved or shown to anyone else who opens this app —
                it exists only for your session.
              </Faq>
              <Faq q="Can I use this on my phone?">
                Yes — the layout adjusts automatically, and the picture/gif viewer supports
                swiping left and right.
              </Faq>
              <Faq q="A folder feels slow to load the first time">
                The first open of a big collection has to read every file's details from Gofile —
                after that it's cached and loads instantly.
              </Faq>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
