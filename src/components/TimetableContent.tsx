import { memo, useMemo, useRef, useState } from 'react';
import { ArrowDownIcon } from '@phosphor-icons/react/dist/csr/ArrowDown';
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/csr/ArrowSquareOut';
import { useClock } from '../hooks/useClock';
import { DAY_LABEL, japanHour, serviceHour, serviceDate, timetableDay } from '../lib/time';
import { schedulesForDate, timetableEditionForDate } from '../../shared/timetable-editions';
import { JOURNEY_GTFS_CATALOG } from '../../shared/journey-sources';
import { TIMETABLE_SOURCE } from '../../shared/transit-source';
import { TimetableUnavailable } from './TimetableUnavailable';
import { groupTimetableByHour } from '../lib/timetable';
import { lineName, lineSymbol, stationDisplayName } from '../lib/stations';
import type { DayKind, Route } from '../types';
import { trainTypeName } from '../lib/train-type';
import { RailMark } from './RailMark';

export const TimetableContent = memo(function TimetableContent({
  route,
  initialDay,
}: {
  route: Route;
  initialDay: DayKind;
}) {
  const now = useClock();
  const date = serviceDate(now);
  const edition = timetableEditionForDate(route, date);
  const gtfs = edition?.gtfs;
  const openedOn = useRef(date);
  const [selection, setSelection] = useState<{ edition?: string; day: DayKind }>();
  const defaultDay = gtfs || openedOn.current !== date ? timetableDay(route, date) : initialDay;
  const day = selection && selection.edition === edition?.id ? selection.day : defaultDay;
  const currentHour = serviceHour(japanHour(now));
  const currentRow = useRef<HTMLTableRowElement>(null);
  const applicable = schedulesForDate(route, serviceDate(now));
  const schedule = applicable?.[day] ?? [];
  const groups = useMemo(() => groupTimetableByHour(schedule), [schedule]);
  const hasCurrentHour = groups.has(currentHour);
  if (!applicable) return <TimetableUnavailable now={now} />;

  function scrollToCurrentHour() {
    currentRow.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'center',
    });
  }
  return (
    <>
      <div className="timetable-summary">
        <RailMark color={route.color} symbol={lineSymbol(route.line)} />
        <div>
          <strong>{lineName(route.line)}</strong>
          <p>{route.direction}方面</p>
        </div>
      </div>
      <div className="day-tabs" role="group" aria-label="曜日ダイヤ">
        {(Object.keys(DAY_LABEL) as DayKind[]).map((kind) => (
          <button
            key={kind}
            aria-pressed={day === kind}
            onClick={() => setSelection({ edition: edition?.id, day: kind })}
          >
            {DAY_LABEL[kind]}
          </button>
        ))}
      </div>
      <div className="timetable-tools">
        <button
          type="button"
          className="timetable-now-button"
          title={hasCurrentHour ? '現在時へ移動' : '現在の時間帯に発車予定はありません'}
          disabled={!hasCurrentHour}
          onClick={scrollToCurrentHour}
        >
          <ArrowDownIcon size={18} aria-hidden="true" />
          <span>現在時へ移動</span>
        </button>
        <p className="timetable-hint">0〜3時台は前日のダイヤに含まれます。</p>
      </div>
      <div className="timetable-scroll">
        <table className="timetable-table">
          <thead>
            <tr>
              <th scope="col">時</th>
              <th scope="col">発車時刻（分）・行先</th>
            </tr>
          </thead>
          <tbody>
            {[...groups].map(([hour, trains]) => (
              <tr
                key={hour}
                ref={hour === currentHour ? currentRow : undefined}
                aria-current={hour === currentHour ? 'time' : undefined}
              >
                <th scope="row">{hour}</th>
                <td>
                  <div className="minute-list">
                    {trains.map((train, index) => (
                      <div key={`${train.time}-${index}`} className="minute-item">
                        <strong>{train.time.slice(3)}</strong>
                        {train.type && (
                          <span>
                            {trainTypeName(train.type, route.railwayId || route.id.split('.')[1])}
                          </span>
                        )}
                        <span>
                          {stationDisplayName(train.destination)}
                          {train.extra ? ' ※' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="modal-footer">
        <span>※ 運転日が指定された列車です。出典でご確認ください。</span>
        <a
          href={
            gtfs
              ? JOURNEY_GTFS_CATALOG
              : (route.sourceUrl === JOURNEY_GTFS_CATALOG ? TIMETABLE_SOURCE : route.sourceUrl) +
                '?kind=' +
                (day === 'weekday' ? '1' : day === 'saturday' ? '2' : '4')
          }
          target="_blank"
          rel="noreferrer"
        >
          {gtfs ? '出典の時刻表（東京都交通局 GTFS）' : '出典の時刻表'}
          <ArrowSquareOutIcon size={13} aria-hidden="true" />
        </a>
      </div>
    </>
  );
});
