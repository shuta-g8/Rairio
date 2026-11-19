import { RAILWAY_SYMBOLS } from '../lib/railway-symbols';
import { networkLineSymbol } from '../lib/kanto-network';
import { RailMark } from './RailMark';

export function JourneyLineMark({ id }: { id: string }) {
  const symbol = id.startsWith('network:') ? networkLineSymbol(id.slice(8)) : RAILWAY_SYMBOLS[id];
  return (
    <span aria-hidden="true">
      <RailMark color={symbol?.color ?? '#687582'} symbol={symbol?.code ?? ''} />
    </span>
  );
}
