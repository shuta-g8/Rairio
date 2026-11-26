import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const DISPLAY_SECONDS = 12;
type Panel = 'diagram' | 'position' | 'information';
type Step = Panel | 'opening-position' | 'information-after-position';

/** Rotate static panels on a timer; let scrolling information finish at its original speed. */
export function useToeiBoardCycle({
  available,
  positionAvailable,
  attention,
  possibleDelay,
  pages,
  now,
  priorityKey,
}: {
  available: boolean;
  positionAvailable: boolean;
  attention: boolean;
  possibleDelay: boolean;
  pages: number;
  now: Date;
  priorityKey?: string;
}) {
  const [slot, setSlot] = useState<{ step: Step; since: number }>(() => ({
    step: 'diagram',
    since: now.getTime(),
  }));
  const [page, setPage] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const opening = useRef(!attention);
  const previousNotice = useRef({ attention, possibleDelay });
  const latestPosition = useRef(positionAvailable);
  latestPosition.current = positionAvailable;
  const { step } = slot;
  const showingPosition = step === 'opening-position' || step === 'position';
  const kind: Panel = !available
    ? 'information'
    : step === 'diagram'
      ? 'diagram'
      : showingPosition && positionAvailable
        ? 'position'
        : 'information';
  const show = useCallback((step: Step) => setSlot({ step, since: Date.now() }), []);
  const completeInformation = useCallback(() => {
    if (attention || possibleDelay || focused || kind !== 'information') return;
    opening.current = false;
    setMessageIndex((index) => index + 1);
    if (!available) show('information');
    else show(step === 'information' && latestPosition.current ? 'position' : 'diagram');
  }, [attention, possibleDelay, focused, kind, available, step, show]);
  useEffect(() => {
    setMessageIndex(0);
    if (priorityKey) show('information');
  }, [priorityKey, show]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useLayoutEffect(() => {
    // Keep the current notice across the approach, then show the first map page once.
    const approachEnded = previousNotice.current.attention && !attention;
    const delayEnded = previousNotice.current.possibleDelay && !possibleDelay;
    previousNotice.current = { attention, possibleDelay };
    if (approachEnded) {
      setPage(0);
      show('diagram');
      return;
    }
    if (attention || possibleDelay || !available) opening.current = false;
    if (attention || possibleDelay) {
      setFocused(false);
      return;
    }
    if (opening.current && positionAvailable) {
      opening.current = false;
      show('opening-position');
    } else if (showingPosition && !positionAvailable) {
      show(step === 'opening-position' ? 'diagram' : 'information-after-position');
    } else if (delayEnded) {
      show(step);
    }
  }, [attention, possibleDelay, available, positionAvailable, showingPosition, step, show]);

  const timed = !attention && !possibleDelay && !focused && (kind !== 'information' || reduced);
  useEffect(() => {
    if (!timed) return;
    const timer = window.setTimeout(() => {
      if (kind === 'diagram') {
        opening.current = false;
        setPage((page) => page + 1);
        show('information');
      } else if (kind === 'information') {
        completeInformation();
      } else show(step === 'opening-position' ? 'diagram' : 'information-after-position');
    }, DISPLAY_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [timed, kind, completeInformation, slot, show]);

  return {
    kind,
    page: page % Math.max(1, pages),
    messageIndex,
    english: now.getTime() - slot.since >= DISPLAY_SECONDS * 500,
    setFocused,
    completeInformation,
  };
}
