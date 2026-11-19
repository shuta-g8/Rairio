import type { Journey } from '../lib/journey';
import { journeyFare } from '../lib/journey';

export function JourneyFareRange({
  journey,
  rowSpan,
  from,
  to,
}: {
  journey: Journey;
  rowSpan: number;
  from: string;
  to: string;
}) {
  const ic = journeyFare(journey.icFare, 'ic', false);
  const paper = journeyFare(journey.icFare, 'paper', false);
  const price = (value: number | undefined) =>
    value === undefined ? '未確認' : `${value.toLocaleString()}円`;
  return (
    <td
      className="journey-fare-cell"
      rowSpan={rowSpan}
      aria-label={`運賃対象：${from}〜${to}。都営区間のみ・大人1人`}
    >
      <span className="journey-fare-range-line" aria-hidden="true" />
      <div className="journey-fare-range-label" title={`${from}〜${to}`}>
        <span>
          IC<b>{price(ic)}</b>
        </span>
        <span>
          きっぷ<b>{price(paper)}</b>
        </span>
      </div>
    </td>
  );
}
