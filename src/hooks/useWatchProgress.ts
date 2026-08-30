import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  clearProgress,
  getAllProgress,
  getContinueWatching,
  getProgress,
  saveProgress,
} from '../lib/storage';
import type { WatchProgress } from '../types';

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
  return localStorage.getItem('goflix:progress') ?? '[]';
}

export function useWatchProgress(fileId?: string) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => '[]');
  const all: WatchProgress[] = JSON.parse(raw);
  const current = fileId ? all.find((p) => p.fileId === fileId) : undefined;

  const save = useCallback((entry: WatchProgress) => {
    saveProgress(entry);
    emit();
  }, []);

  const clear = useCallback((id: string) => {
    clearProgress(id);
    emit();
  }, []);

  return {
    progress: current,
    all,
    continueWatching: getContinueWatching(),
    save,
    clear,
  };
}

export function useContinueWatching(folderId?: string) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => '[]');
  void raw;
  const [items, setItems] = useState(() => getContinueWatching(folderId));

  useEffect(() => {
    setItems(getContinueWatching(folderId));
  }, [folderId, raw]);

  return items;
}

export function useProgressFor(fileId: string | undefined) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => '[]');
  void raw;
  return fileId ? getProgress(fileId) : undefined;
}

export function bumpProgress(entry: WatchProgress) {
  saveProgress(entry);
  emit();
}

export function listAllProgress() {
  return getAllProgress();
}
