import { useEffect, useState } from 'react';

// Keep the header in sight near the top, and ignore small reversals in scroll direction.
const TOP_ZONE = 80;
const SCROLL_THRESHOLD = 24;

export function useHeaderAutoHide(enabled: boolean) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }

    let frame: number | undefined;
    let anchor = Math.max(0, window.scrollY);
    let currentHidden = false;
    const update = () => {
      frame = undefined;
      // Freezing the background of a touch dialog can temporarily reset scrollY.
      if (document.querySelector('dialog[open]')) return;
      const y = Math.max(0, window.scrollY);
      const nearTop = y <= TOP_ZONE;
      anchor = nearTop ? y : currentHidden ? Math.max(anchor, y) : Math.min(anchor, y);
      const nextHidden =
        !nearTop &&
        (currentHidden ? anchor - y < SCROLL_THRESHOLD : y - anchor >= SCROLL_THRESHOLD);
      if (nextHidden === currentHidden) return;
      anchor = y;
      currentHidden = nextHidden;
      setHidden(nextHidden);
    };
    const onScroll = () => {
      frame ??= window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [enabled]);

  return enabled && hidden;
}
