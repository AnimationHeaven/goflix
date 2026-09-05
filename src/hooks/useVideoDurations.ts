import { useEffect, useMemo, useState } from 'react';
import { getCachedDuration, isDurationSettled, subscribeDurations } from '../lib/durationCache';
import type { NormalizedItem } from '../types';

interface DurationProgress {
  tick: number;
  total: number;
  resolved: number;
  settled: number;
}

/** Drives the duration-sort progress bar. Probing itself happens lazily, in
 * PosterCard, only for videos actually scrolled into view — this hook just
 * watches the shared cache and reports how many of the current list have
 * settled (succeeded OR permanently failed), so the bar can reach 100% even
 * when some videos never resolve. Deliberately does NOT eagerly queue probes
 * for the whole list: on a large flattened folder that could mean thousands
 * of metadata requests against Gofile at once for items nowhere near the
 * viewport, which is exactly the kind of quota-burning "leakage" a real
 * duration sort shouldn't cost. */
export function useVideoDurations(items: NormalizedItem[]): DurationProgress {
  const [tick, setTick] = useState(0);

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
