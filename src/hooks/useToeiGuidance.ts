import { useMemo, useState } from 'react';
import type { LineOperation } from '../../shared/railways';
import { shuffledGuidanceIds, toeiInformationMessages } from '../lib/toei-guidance';

/** Keep only the current deck, including while a diagram temporarily replaces the notice. */
export function useToeiGuidance(
  operation: LineOperation | undefined,
  previous: boolean,
  messageIndex: number,
  single: boolean,
) {
  const messages = useMemo(
    () => toeiInformationMessages(operation, previous),
    [operation, previous],
  );
  const priority = messages.find((message) => message.id === 'operation');
  const ids = useMemo(
    () => messages.filter((message) => message.id !== 'operation').map((message) => message.id),
    [messages],
  );
  const signature = JSON.stringify([!!priority, ids]);
  const noticeIndex = priority ? Math.floor(messageIndex / 2) : messageIndex;
  const round = priority || single ? Math.floor(noticeIndex / ids.length) : messageIndex;
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
    if (priority && messageIndex % 2 === 0) return [priority];
    const order = priority || single ? [deck.ids[noticeIndex % ids.length]] : deck.ids;
    return order.map((id) => messages.find((message) => message.id === id)!);
  }, [messages, deck.ids, single, messageIndex, priority, noticeIndex, ids.length]);
}
