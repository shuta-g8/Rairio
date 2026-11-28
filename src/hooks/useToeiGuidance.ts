import { useMemo, useState } from 'react';
import type { LineOperation } from '../../shared/railways';
import {
  shuffledGuidanceIds,
  toeiInformationMessages,
  type ToeiInformationMessage,
} from '../lib/toei-guidance';

/** Keep only the current deck, including while a diagram temporarily replaces the notice. */
export function useToeiGuidance(
  operation: LineOperation | undefined,
  previous: boolean,
  messageIndex: number,
  single: boolean,
  possibleDelay: boolean,
  routeMessage?: ToeiInformationMessage,
) {
  const messages = useMemo(() => {
    const general = toeiInformationMessages(operation, previous, possibleDelay);
    return routeMessage ? [...general, routeMessage] : general;
  }, [operation, previous, possibleDelay, routeMessage]);
  const priority = useMemo(
    () => messages.filter(({ id }) => id === 'operation' || id === 'possible-delay'),
    [messages],
  );
  const ids = useMemo(
    () => messages.filter((message) => !priority.includes(message)).map(({ id }) => id),
    [messages, priority],
  );
  const signature = JSON.stringify([priority.map(({ id }) => id), ids]);
  const hasPriority = priority.length > 0;
  const noticeIndex = hasPriority ? Math.floor(messageIndex / 2) : messageIndex;
  const round = hasPriority || single ? Math.floor(noticeIndex / ids.length) : messageIndex;
  const createDeck = (previousLast?: string) => ({
    signature,
    round,
    ids: shuffledGuidanceIds(ids, previousLast),
  });
  const [stored, setStored] = useState(() => createDeck());
  let deck = stored;
  if (stored.signature !== signature || stored.round !== round) {
    deck = createDeck(stored.ids.at(-1));
    setStored(deck);
  }
  return useMemo(() => {
    if (hasPriority && messageIndex % 2 === 0) return priority;
    const order = hasPriority || single ? [deck.ids[noticeIndex % ids.length]] : deck.ids;
    return order.map((id) => messages.find((message) => message.id === id)!);
  }, [messages, deck.ids, single, messageIndex, priority, hasPriority, noticeIndex, ids.length]);
}
