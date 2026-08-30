import { useCallback, useSyncExternalStore } from 'react';
import { toggleFavorite as toggleFavoriteStorage } from '../lib/storage';

let listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return localStorage.getItem('goflix:favorites') ?? '[]';
}

export function useFavorites() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => '[]');
  const ids: string[] = JSON.parse(raw);

  const toggle = useCallback((id: string) => {
    const nowFavorite = toggleFavoriteStorage(id);
    emit();
    return nowFavorite;
  }, []);

  return {
    ids,
    isFavorite: (id: string) => ids.includes(id),
    toggle,
    count: ids.length,
  };
}

export function useIsFavorite(id: string): boolean {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => '[]');
  const ids: string[] = JSON.parse(raw);
  return ids.includes(id);
}
