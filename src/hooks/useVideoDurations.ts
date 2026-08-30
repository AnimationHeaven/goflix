import { useEffect, useMemo, useState } from 'react';
import {
  getCachedDuration,
  isDurationSettled,
  queueDurationProbe,
  subscribeDurations,
} from '../lib/durationCache';
import type { NormalizedItem } from '../types';

interface DurationProgress {
  tick: number;
  total: number;
  resolved: number;
  settled: number;
}

/** Drives the duration-sort progress bar: queues background probes for every
 * item missing a cached duration, and reports how many have settled
 * (succeeded OR permanently failed) so the bar can reach 100% even when some
 * videos never resolve. */
export function useVideoDurations(items: NormalizedItem[], enabled: boolean): DurationProgress {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    for (const item of items) {
      if (getCachedDuration(item.id) == null) queueDurationProbe(item);
    }
  }, [items, enabled]);

  useEffect(() => subscribeDurations(() => setTick((t) => t + 1)), []);

  const { resolved, settled } = useMemo(() => {
    let resolvedCount = 0;
    let settledCount = 0;
    for (const item of items) {
      if (getCachedDuration(item.id) != null) resolvedCount += 1;
      if (isDurationSettled(item.id)) settledCount += 1;
    }
    return { resolved: resolvedCount, settled: settledCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick is the real trigger; the cache reads are module-level
  }, [items, tick]);

  return { tick, total: items.length, resolved, settled };
}
