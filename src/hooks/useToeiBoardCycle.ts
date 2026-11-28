import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const DISPLAY_SECONDS = 12;
const FIXED_NOTICE_SECONDS = 20;
const SECOND_SCROLL_CHANCE = 0.25;
type Panel = 'diagram' | 'position' | 'information' | 'fixed-notice';
type Step =
  Panel | 'opening-position' | 'information-after-position' | 'fixed-notice-after-position';

/** Rotate static panels on a timer; let scrolling information finish at its original speed. */
export function useToeiBoardCycle({
  available,
  positionAvailable,
  attention,
  possibleDelay,
  pages,
  now,
  priorityKey,
  fixedNoticeAvailable = false,
}: {
  available: boolean;
  positionAvailable: boolean;
  attention: boolean;
  possibleDelay: boolean;
  pages: number;
  now: Date;
  priorityKey?: string;
  fixedNoticeAvailable?: boolean;
}) {
  const showTrainPanels = available && !(attention && possibleDelay);
  const showFixedNotice = fixedNoticeAvailable && !attention && !priorityKey;
  const [slot, setSlot] = useState<{ step: Step; since: number; extraScroll: boolean }>(() => ({
    step: 'diagram',
    since: now.getTime(),
    extraScroll: !showTrainPanels && showFixedNotice && Math.random() < SECOND_SCROLL_CHANCE,
  }));
  const [page, setPage] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [fixedNoticeIndex, setFixedNoticeIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const opening = useRef(!attention);
  const previousAttention = useRef(attention);
  const latestPosition = useRef(positionAvailable);
  latestPosition.current = positionAvailable;
  const alternatives = useRef({ showTrainPanels, showFixedNotice });
  alternatives.current = { showTrainPanels, showFixedNotice };
  const { step } = slot;
  const showingPosition = step === 'opening-position' || step === 'position';
  const showingFixedNotice = step === 'fixed-notice' || step === 'fixed-notice-after-position';
  const interrupted = attention && !possibleDelay;
  const kind: Panel =
    showingFixedNotice && showFixedNotice
      ? 'fixed-notice'
      : !showTrainPanels
        ? 'information'
        : step === 'diagram'
          ? 'diagram'
          : showingPosition && positionAvailable
            ? 'position'
            : 'information';
  const show = useCallback((step: Step, secondScroll = false) => {
    const { showTrainPanels, showFixedNotice } = alternatives.current;
    const startsScroll =
      step === 'information' ||
      step === 'information-after-position' ||
      (step === 'diagram' && !showTrainPanels);
    setSlot({
      step,
      since: Date.now(),
      extraScroll:
        !secondScroll &&
        startsScroll &&
        (showTrainPanels || showFixedNotice) &&
        Math.random() < SECOND_SCROLL_CHANCE,
    });
  }, []);
  const continueAfterInformation = useCallback(
    (afterPosition: boolean) => {
      if (!showTrainPanels) show('information');
      else show(!afterPosition && latestPosition.current ? 'position' : 'diagram');
    },
    [showTrainPanels, show],
  );
  const completeInformation = useCallback(() => {
    if (interrupted || focused || kind !== 'information') return;
    opening.current = false;
    setMessageIndex((index) => index + 1);
    if (slot.extraScroll && (showTrainPanels || showFixedNotice)) show(step, true);
    else if (showFixedNotice)
      show(step === 'information-after-position' ? 'fixed-notice-after-position' : 'fixed-notice');
    else continueAfterInformation(step !== 'information');
  }, [
    interrupted,
    focused,
    kind,
    slot.extraScroll,
    showTrainPanels,
    showFixedNotice,
    step,
    show,
    continueAfterInformation,
  ]);
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
    const approachEnded = previousAttention.current && !attention;
    previousAttention.current = attention;
    if (approachEnded) {
      setPage(0);
      if (!possibleDelay) {
        show('diagram');
        return;
      }
    }
    if (attention || possibleDelay || !available) opening.current = false;
    if (attention) {
      if (interrupted) setFocused(false);
      else if (step === 'diagram' || showingPosition || showingFixedNotice) show('information');
      return;
    }
    if (showingFixedNotice && !showFixedNotice) {
      if (priorityKey) show('information');
      else continueAfterInformation(step === 'fixed-notice-after-position');
    } else if (opening.current && positionAvailable) {
      opening.current = false;
      show('opening-position');
    } else if (showingPosition && !positionAvailable) {
      show(step === 'opening-position' ? 'diagram' : 'information-after-position');
    }
  }, [
    attention,
    interrupted,
    possibleDelay,
    available,
    positionAvailable,
    showingPosition,
    showingFixedNotice,
    showFixedNotice,
    priorityKey,
    step,
    show,
    continueAfterInformation,
  ]);

  const timed = !interrupted && !focused && (kind !== 'information' || reduced);
  useEffect(() => {
    if (!timed) return;
    const seconds = kind === 'fixed-notice' ? FIXED_NOTICE_SECONDS : DISPLAY_SECONDS;
    const delay =
      kind === 'fixed-notice'
        ? Math.max(0, slot.since + seconds * 1000 - Date.now())
        : seconds * 1000;
    const timer = window.setTimeout(() => {
      if (kind === 'diagram') {
        opening.current = false;
        setPage((page) => page + 1);
        show('information');
      } else if (kind === 'information') {
        completeInformation();
      } else if (kind === 'fixed-notice') {
        setFixedNoticeIndex((index) => index + 1);
        continueAfterInformation(step === 'fixed-notice-after-position');
      } else show(step === 'opening-position' ? 'diagram' : 'information-after-position');
    }, delay);
    return () => window.clearTimeout(timer);
  }, [timed, kind, completeInformation, continueAfterInformation, slot, show]);

  return {
    kind,
    page: page % Math.max(1, pages),
    messageIndex,
    fixedNoticeIndex,
    english: now.getTime() - slot.since >= DISPLAY_SECONDS * 500,
    fixedNoticeStartedAt: kind === 'fixed-notice' ? slot.since : undefined,
    setFocused,
    completeInformation,
  };
}
