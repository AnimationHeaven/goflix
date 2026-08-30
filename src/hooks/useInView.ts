import { useEffect, useRef, useState } from 'react';

/** Lazy-mount gate for grid cards: defers thumbnail/duration work until the
 * card is near the viewport. Falls back to eagerly "in view" if
 * IntersectionObserver is unavailable. */
export function useInView<T extends Element>(rootMargin = '600px') {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return [ref, inView] as const;
}
