import { useSyncExternalStore } from 'react';

function subscribe(): () => void {
  return () => undefined;
}

function getSnapshot(): string {
  return localStorage.getItem('goflix:watched') ?? '[]';
}

export function useWatched() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => '[]');
  const ids: string[] = JSON.parse(raw);
  return {
    ids,
    isWatched: (id: string) => ids.includes(id),
  };
}
