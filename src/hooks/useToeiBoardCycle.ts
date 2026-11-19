import { useCallback, useEffect, useRef, useState } from 'react';

const DISPLAY_SECONDS = 12;
type Panel = 'diagram' | 'position' | 'information';

/** Rotate static panels on a timer; let scrolling information finish at its original speed. */
export function useToeiBoardCycle({
  available,
  positionAvailable,
  pages,
  now,
  priorityKey,
}: {
  available: boolean;
  positionAvailable: boolean;
  pages: number;
  now: Date;
  priorityKey?: string;
}) {
  const [slot, setSlot] = useState<{ kind: Panel; since: number }>(() => ({
    kind: 'diagram',
    since: now.getTime(),
  }));
  const [page, setPage] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const hadPosition = useRef(false);
  const latestPosition = useRef(positionAvailable);
  latestPosition.current = positionAvailable;
  const kind: Panel = !available
    ? 'information'
    : slot.kind === 'position' && !positionAvailable
      ? 'diagram'
      : slot.kind;
  const completeInformation = useCallback(() => {
    setMessageIndex((index) => index + 1);
    setSlot({ kind: latestPosition.current ? 'position' : 'diagram', since: Date.now() });
  }, []);
  useEffect(() => {
    setMessageIndex(0);
    if (priorityKey) setSlot({ kind: 'information', since: Date.now() });
  }, [priorityKey]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!available) {
      hadPosition.current = false;
      return;
    }
    if (focused) return;
    if (positionAvailable && !hadPosition.current)
      setSlot((slot) =>
        slot.kind === 'information' ? slot : { kind: 'position', since: Date.now() },
      );
    else if (!positionAvailable)
      setSlot((slot) => (slot.kind === 'position' ? { kind: 'diagram', since: Date.now() } : slot));
    hadPosition.current = positionAvailable;
  }, [available, positionAvailable, focused]);

  useEffect(() => {
    if (focused || (kind === 'information' && !reduced)) return;
    const timer = window.setTimeout(() => {
      if (kind === 'diagram') {
        setPage((page) => (page + 1) % pages);
        setSlot({ kind: 'information', since: Date.now() });
      } else if (kind === 'information') {
        completeInformation();
      } else setSlot({ kind: 'diagram', since: Date.now() });
    }, DISPLAY_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [available, focused, kind, pages, reduced, completeInformation, messageIndex]);

  return {
    kind,
    page,
    messageIndex,
    english: now.getTime() - slot.since >= DISPLAY_SECONDS * 500,
    setFocused,
    completeInformation,
  };
}
