import type { BreadcrumbEntry } from '../types';

interface Props {
  items: BreadcrumbEntry[];
  onNavigate: (id: string, index: number) => void;
  onHome: () => void;
}

export function Breadcrumbs({ items, onNavigate, onHome }: Props) {
  return (
    <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-400">
      <button
        type="button"
        onClick={onHome}
        className="rounded px-1.5 py-0.5 transition hover:bg-zinc-800 hover:text-white"
      >
        GoFlix
      </button>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${item.id}-${i}`} className="flex items-center gap-1.5">
            <span className="text-zinc-600">/</span>
            {isLast ? (
              <span className="max-w-[12rem] truncate px-1.5 font-medium text-white sm:max-w-xs">
                {item.name}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(item.id, i)}
                className="max-w-[10rem] truncate rounded px-1.5 py-0.5 transition hover:bg-zinc-800 hover:text-white sm:max-w-[14rem]"
              >
                {item.name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
