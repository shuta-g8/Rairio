import { useEffect, useState } from 'react';

export function useClock(active = true) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    let timer: number;
    const tick = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === 'hidden') return;
      const current = new Date();
      setNow(current);
      // Recalculate each time so delayed callbacks do not shift subsequent ticks.
      timer = window.setTimeout(tick, 1000 - (current.getTime() % 1000));
    };
    tick();
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [active]);
  return now;
}
