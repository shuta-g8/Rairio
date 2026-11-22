import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/csr/ArrowSquareOut';
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { lineName, lineSymbol } from '../lib/stations';
import { railwayForLine } from '../../shared/railways';
import type { Route, Station, StationData } from '../types';
import { indexOperations, operationsArePrevious, type OperationsData } from '../lib/operations';
import { useClock } from '../hooks/useClock';
import { TRAIN_POSITIONS_CATALOG, type TrainPositionsSnapshot } from '../../shared/train-positions';
import { StationDepartureBoard } from './StationDepartureBoard';
import { UpdatedAt } from './UpdatedAt';
import { StationHeading } from './StationHeading';
import { RailMark } from './RailMark';
import { loadBoardMode, saveBoardMode, TOEI_VIEWING_NOTE, type BoardMode } from '../lib/board-mode';
import {
  editionServiceDate,
  managesTimetable,
  timetableEditionForDate,
} from '../../shared/timetable-editions';
import { JOURNEY_GTFS_CATALOG } from '../../shared/journey-sources';
import { readDeparturePolicy } from '../lib/departure-policy';

interface Props {
  active: boolean;
  children?: ReactNode;
  station: Station;
  stationSaved: boolean;
  stationSaveDisabled: boolean;
  onToggleSave: () => void;
  data: StationData | null;
  error: string;
  loading: boolean;
  filter: string;
  onFilter: (line: string) => void;
  onRefresh: () => void;
  onOpen: (route: Route) => void;
  operations: OperationsData;
  trainPositions?: TrainPositionsSnapshot | null;
}
export function StationDepartures({
  active,
  children,
  station,
  stationSaved,
  stationSaveDisabled,
  onToggleSave,
  data,
  error,
  loading,
  filter,
  onFilter,
  onRefresh,
  onOpen,
  operations,
  trainPositions,
}: Props) {
  const now = useClock(active);
  const [boardMode, setBoardMode] = useState(loadBoardMode);
  const [departurePolicy] = useState(readDeparturePolicy);
  const changeBoardMode = useCallback((mode: BoardMode) => {
    setBoardMode(mode);
    saveBoardMode(mode);
  }, []);
  const previousOperations = operationsArePrevious(operations, now);
  const sectionRef = useRef<HTMLElement>(null);
  const sectionHeight = useRef(0);
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    section.style.minHeight = loading && sectionHeight.current ? `${sectionHeight.current}px` : '';
    if (loading || error) return;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize[0].blockSize;
      if (height > 0) sectionHeight.current = Math.ceil(height);
    });
    observer.observe(section, { box: 'border-box' });
    return () => observer.disconnect();
  }, [loading, error]);
  const lines = useMemo(() => {
    const colors = new Map<string, string>();
    for (const route of data?.routes || []) {
      const name = lineName(route.line);
      if (!colors.has(name)) colors.set(name, route.color);
    }
    return [...colors].map(([name, color]) => ({ name, color, symbol: lineSymbol(name) }));
  }, [data]);
  const routes = useMemo(
    () =>
      lines
        .filter(({ name }) => filter === 'all' || name === filter)
        .flatMap(({ name }) =>
          (data?.routes || [])
            .filter((route) => lineName(route.line) === name)
            .map((route) => ({ route, operationId: railwayForLine(route.line)?.id || '' })),
        ),
    [data, filter, lines],
  );
  const byId = useMemo(() => indexOperations(operations.snapshot), [operations.snapshot]);
  const fetchedAt = useMemo(() => (data ? Date.parse(data.fetchedAt) : null), [data]);
  const stale = fetchedAt !== null && now.getTime() - fetchedAt > 14 * 86400000;
  const date = editionServiceDate(now.getTime());
  const gtfsVisible = routes.some(({ route }) => timetableEditionForDate(route, date)?.gtfs);
  const sourceUpdated = useMemo(() => {
    const stamps = (data?.routes ?? [])
      .map((route) =>
        managesTimetable(route)
          ? timetableEditionForDate(route, date)?.sourceUpdated
          : route.sourceUpdated,
      )
      .filter((value): value is string => !!value && Number.isFinite(Date.parse(value)));
    return stamps.length ? new Date(Math.min(...stamps.map(Date.parse))).toISOString() : undefined;
  }, [data, date]);
  return (
    <section
      ref={sectionRef}
      id="departures"
      tabIndex={-1}
      className="departures-section"
      data-board-mode={boardMode}
      aria-labelledby="station-heading"
      aria-busy={loading}
    >
      {children}
      <div className="departure-controls">
        <StationHeading
          station={station}
          saved={stationSaved}
          saveDisabled={stationSaveDisabled}
          onToggleSave={onToggleSave}
          boardMode={boardMode}
          onBoardModeChange={changeBoardMode}
        />

        {lines.length > 1 && (
          <div className="line-filters" role="group" aria-label="路線を絞り込み">
            <button
              className={filter === 'all' ? 'selected' : ''}
              aria-pressed={filter === 'all'}
              onClick={() => onFilter('all')}
            >
              全路線<span className="line-filter-count">{lines.length}</span>
            </button>
            {lines.map(({ name: line, color, symbol }) => (
              <button
                key={line}
                className={filter === line ? 'selected' : ''}
                aria-pressed={filter === line}
                onClick={() => onFilter(line)}
              >
                <span aria-hidden="true">
                  <RailMark color={color} symbol={symbol} />
                </span>
                {line.replace(/^都営/, '')}
              </button>
            ))}
          </div>
        )}
      </div>

      {boardMode === 'toei' && (
        <p className="toei-viewing-note">
          <InfoIcon size={16} aria-hidden="true" />
          {TOEI_VIEWING_NOTE}
        </p>
      )}

      {stale && (
        <p className="notice stale">
          <InfoIcon size={17} aria-hidden="true" />
          時刻表の取得から14日以上経過しています。ダイヤ改正の可能性があるため、出典の最新時刻表もご確認ください。
        </p>
      )}
      {error ? (
        <div className="error-state" role="alert">
          <InfoIcon size={30} aria-hidden="true" />
          <h3>時刻表を読み込めませんでした</h3>
          <p>{error}</p>
          <button onClick={onRefresh}>
            <ArrowClockwiseIcon size={16} aria-hidden="true" />
            もう一度読み込む
          </button>
        </div>
      ) : loading ? (
        <div className="route-grid" aria-label="時刻表を読み込み中">
          {[0, 1].map((i) => (
            <div className="route-card skeleton" key={i}>
              <div />
              <div />
              <div />
            </div>
          ))}
        </div>
      ) : (
        <div className="route-grid">
          {routes.map(({ route, operationId }) => (
            <StationDepartureBoard
              mode={boardMode}
              key={`${station.id}-${route.id}`}
              route={route}
              now={now}
              onOpen={() => onOpen(route)}
              operation={byId.get(operationId)}
              previous={previousOperations}
              positions={trainPositions}
            />
          ))}
        </div>
      )}

      <p className="schedule-note">
        {departurePolicy === 'hybrid'
          ? '接近案内と列車の切替は実測に基づく時間の目安です。列車を照合できた新しい位置情報で補正しますが、実際の到着・発車を保証しません。'
          : '接近案内は、列車を照合できた最新の位置情報を優先し、取得できない場合は時刻表を目安に表示します。'}
        <br />
        {gtfsVisible && (
          <>
            浅草線のGTFS版では、走行中の列車を時刻表と照合できたときに種別・接近案内を表示します。
            <br />
          </>
        )}
        発車時刻・カウントダウンは時刻表に基づく目安で、
        {departurePolicy === 'hybrid'
          ? '案内の補正後も表示時刻自体は変更しません。'
          : '遅延補正は行いません。'}
      </p>
      {data && (
        <div className="source-line">
          {sourceUpdated && (
            <UpdatedAt
              timestamp={sourceUpdated}
              label="提供元データの更新日時（日本時間）"
              caption="提供元更新"
            />
          )}
          <a href={data.sourceUrl} target="_blank" rel="noreferrer">
            出典：東京都交通局・公共交通オープンデータ協議会
            <ArrowSquareOutIcon size={12} aria-hidden="true" />
          </a>
          {gtfsVisible && (
            <a href={JOURNEY_GTFS_CATALOG} target="_blank" rel="noreferrer">
              浅草線時刻表の出典（GTFS）
              <ArrowSquareOutIcon size={12} aria-hidden="true" />
            </a>
          )}
          <a href={TRAIN_POSITIONS_CATALOG} target="_blank" rel="noreferrer">
            列車位置の出典
            <ArrowSquareOutIcon size={12} aria-hidden="true" />
          </a>
        </div>
      )}
    </section>
  );
}
