import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { ArrowsLeftRightIcon } from '@phosphor-icons/react/dist/csr/ArrowsLeftRight';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { CalendarDotsIcon } from '@phosphor-icons/react/dist/csr/CalendarDots';
import { ClockIcon } from '@phosphor-icons/react/dist/csr/Clock';
import { JourneyPlaceSearch } from './JourneyPlaceSearch';
import { JourneyResult } from './JourneyResult';
import { JourneyDetails } from './JourneyDetails';
import {
  JourneyMoreResults,
  journeyResultsPerPage,
  JourneyResultTools,
} from './JourneyResultTools';
import { OnlineJourneyResults } from './OnlineJourneyResults';
import { LoadingSpinner, LoadingStatus } from './LoadingStatus';
import { loadJourneyData, useJourneyData } from '../hooks/useJourneyData';
import { findJourneyPlace, isExternalJourneyPlace, placeName } from '../lib/journey-place-search';
import { searchJourneyOptions, type JourneySearchState } from '../lib/journey-search';
import { loadJourneyHistory, rememberJourneyPlace } from '../lib/journey-search-history';
import type { NearbyStation } from '../hooks/useNearbyStation';
import { sortJourneyOptions, type JourneySort } from '../lib/journey-sort';
import { requestOnlinePlan } from '../lib/journey-online';
import {
  fareComparisonTrips,
  isFareComparisonTrip,
  type OnlineJourneyPlan,
} from '../../shared/journey-online';
import type { JourneyData } from '../../shared/journey';

type PlannerSearch = JourneySearchState & { online?: OnlineJourneyPlan; timetable?: JourneyData };

const nowFields = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16).split('T');

function openDateTimePicker(event: MouseEvent<HTMLInputElement>) {
  try {
    event.currentTarget.showPicker?.();
  } catch {
    // Keep the browser's normal focus, picker and keyboard input as a fallback.
  }
}

export function JourneyPlanner({
  stationId,
  onManualInput,
  nearby,
}: {
  stationId: string;
  onManualInput?: () => void;
  nearby?: NearbyStation;
}) {
  const [from, setFrom] = useState(stationId);
  const [to, setTo] = useState('');
  const [initialDateTime] = useState(nowFields);
  const [date, setDate] = useState(initialDateTime[0]);
  const [time, setTime] = useState(initialDateTime[1]);
  const [conventionalOnly, setConventionalOnly] = useState(true);
  const { data, error: dataError, reload } = useJourneyData();
  const [searchError, setSearchError] = useState('');
  const error = searchError || dataError;
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState<PlannerSearch>();
  const [shown, setShown] = useState(journeyResultsPerPage);
  const timetable = search?.timetable ?? data;
  const [showLocalFares, setShowLocalFares] = useState(false);
  const planRequest = useRef<AbortController | null>(null);
  const [sort, setSort] = useState<JourneySort>('arrival');
  const sortedResults = useMemo(
    () => (search ? sortJourneyOptions(search.results, sort, search.inbound) : []),
    [search, sort],
  );
  const [recent, setRecent] = useState(loadJourneyHistory);
  const [attempted, setAttempted] = useState(false);
  const plannerRef = useRef<HTMLElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const restoreSearchFocus = useRef(false);
  useEffect(() => {
    if (search) resultHeadingRef.current?.focus({ preventScroll: true });
    else if (restoreSearchFocus.current) {
      restoreSearchFocus.current = false;
      submitRef.current?.focus({ preventScroll: true });
    } else return;
    plannerRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [search]);
  function remember(id: string) {
    if (id) setRecent((current) => rememberJourneyPlace(id, current));
  }
  useEffect(() => {
    setFrom(stationId);
    setSearch(undefined);
    setBusy(false);
    return () => planRequest.current?.abort();
  }, [stationId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!from || !to) {
      setAttempted(true);
      setSearchError('');
      setSearch(undefined);
      return;
    }
    if (
      !findJourneyPlace(from)?.toei &&
      !findJourneyPlace(to)?.toei &&
      !isFareComparisonTrip(from, to)
    ) {
      setSearchError('出発駅または到着駅の少なくとも片方に東京都交通局の駅を選んでください。');
      return;
    }
    if (from === to) {
      setSearchError('出発駅と到着駅に別の駅を選んでください。');
      return;
    }
    setSearchError('');
    setBusy(true);
    setSearch(undefined);
    setShowLocalFares(false);
    setShown(journeyResultsPerPage);
    const controller = new AbortController();
    planRequest.current = controller;
    try {
      const input = { from, to, date, time, conventionalOnly };
      const fromExternal = isExternalJourneyPlace(from);
      const toExternal = isExternalJourneyPlace(to);
      let local = data;
      let localResults: JourneySearchState | undefined;
      if (!fromExternal && !toExternal) {
        if (!local && !dataError) local = await loadJourneyData().catch(() => undefined);
        if (controller.signal.aborted) return;
        if (local) {
          localResults = searchJourneyOptions(local, input);
          if (localResults.results.length) {
            setSearch({ ...localResults, timetable: local });
            return;
          }
        }
      }
      const online = navigator.onLine
        ? await requestOnlinePlan(input, controller.signal)
        : undefined;
      if (controller.signal.aborted) return;
      if (online) {
        setSearch({
          from: placeName(from),
          to: placeName(to),
          date,
          time,
          inbound: false,
          external: false,
          results: [],
          online,
        });
      } else if (local && !(fromExternal && toExternal)) {
        setSearch({ ...(localResults ?? searchJourneyOptions(local, input)), timetable: local });
      } else {
        setSearchError('オンライン経路検索に接続してからお試しください。');
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setSearchError(e instanceof Error ? e.message : '検索に失敗しました。');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <section ref={plannerRef} className="journey-planner" aria-labelledby="journey-heading">
      <div className="journey-heading">
        <h2 id="journey-heading">経路・乗換案内</h2>
      </div>
      <div hidden={Boolean(search)}>
        <form className="journey-form" onSubmit={submit} onFocusCapture={onManualInput}>
          <div className="journey-stations">
            <JourneyPlaceSearch
              label="出発駅"
              nearby={nearby}
              value={from}
              recent={recent}
              requiredError={attempted && !from}
              onChange={(id) => {
                setFrom(id);
                remember(id);
                setSearch(undefined);
              }}
            />
            <button
              type="button"
              className="journey-swap"
              aria-label="出発と到着を入れ替える"
              onClick={() => {
                setFrom(to);
                setTo(from);
                setSearch(undefined);
              }}
            >
              <ArrowsLeftRightIcon size={22} aria-hidden="true" />
            </button>
            <JourneyPlaceSearch
              label="到着駅"
              value={to}
              recent={recent}
              requiredError={attempted && !to}
              onChange={(id) => {
                setTo(id);
                remember(id);
                setSearch(undefined);
              }}
            />
          </div>
          <div className="journey-options">
            <div className="journey-option">
              <label htmlFor="journey-departure-date">出発日</label>
              <span className="journey-date-time">
                <span className="journey-date-time-value" aria-hidden="true">
                  {date ? date.replaceAll('-', '/') : '日付を選択'}
                  <CalendarDotsIcon size={18} />
                </span>
                <input
                  id="journey-departure-date"
                  type="date"
                  onClick={openDateTimePicker}
                  value={date}
                  required
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSearch(undefined);
                  }}
                />
              </span>
            </div>
            <div className="journey-option">
              <label htmlFor="journey-departure-time">出発時刻</label>
              <span className="journey-date-time">
                <span className="journey-date-time-value" aria-hidden="true">
                  {time || '時刻を選択'}
                  <ClockIcon size={18} />
                </span>
                <input
                  id="journey-departure-time"
                  type="time"
                  onClick={openDateTimePicker}
                  value={time}
                  required
                  onChange={(e) => {
                    setTime(e.target.value);
                    setSearch(undefined);
                  }}
                />
              </span>
            </div>
            <button ref={submitRef} type="submit" className="journey-submit" disabled={busy}>
              {busy ? <LoadingSpinner /> : <MagnifyingGlassIcon size={19} aria-hidden="true" />}
              {busy ? '検索中…' : '経路を検索'}
            </button>
          </div>
          <label className="journey-conventional-only">
            <input
              type="checkbox"
              checked={conventionalOnly}
              onChange={(event) => setConventionalOnly(event.target.checked)}
            />
            在来線のみ
          </label>
          <p className="journey-data-note">
            関東1都6県の東京都交通局の駅を発着する経路と、以下の運賃比較区間を検索できます。
          </p>
          <details>
            <summary>運賃比較の区間を選ぶ</summary>
            {fareComparisonTrips.map((trip) => (
              <button
                key={trip.from}
                type="button"
                disabled={busy}
                onClick={() => {
                  setFrom(trip.from);
                  setTo(trip.to);
                  setSearchError('');
                  onManualInput?.();
                }}
              >
                {trip.label}
              </button>
            ))}
          </details>
        </form>
        {!data && !error && <LoadingStatus>補助案内のデータを読み込んでいます…</LoadingStatus>}
        {error && (
          <div className="journey-notice" role="alert">
            {error}{' '}
            <button
              type="button"
              onClick={() => {
                setSearchError('');
                reload();
              }}
            >
              読み込み直す
            </button>
          </div>
        )}
      </div>
      {search && (
        <div className="journey-results" aria-live="polite" aria-busy={busy}>
          <button
            type="button"
            className="journey-back"
            onClick={() => {
              restoreSearchFocus.current = true;
              setSearch(undefined);
            }}
          >
            <ArrowLeftIcon size={18} aria-hidden="true" />
            検索に戻る
          </button>
          <div className="journey-result-heading">
            <h3 ref={resultHeadingRef} tabIndex={-1}>
              {search.from} <ArrowRightIcon size={18} aria-hidden="true" /> {search.to}
            </h3>
            <p>
              {search.date} {search.time}
              {search.inbound ? '指定・時刻未案内' : '以降'}
            </p>
          </div>
          {search.online && (
            <OnlineJourneyResults
              plan={search.online}
              timetable={timetable}
              searchDate={search.date}
              sort={sort}
              onSort={setSort}
            />
          )}
          {search.results.length > 0 && (
            <JourneyResultTools
              sort={sort}
              onSort={setSort}
              onFares={() => setShowLocalFares(true)}
              fareDisabled={showLocalFares || !search.results.some((result) => result.journey)}
              fareLabel={showLocalFares ? '表示済み' : undefined}
            />
          )}
          {search.message && (
            <p className="journey-empty" role="status">
              {search.message}
            </p>
          )}
          {sortedResults.slice(0, shown).map((result, i) => (
            <JourneyResult
              key={`${sort}-${i}`}
              result={result}
              data={timetable!}
              inbound={search.inbound}
              index={i}
              showFares={showLocalFares}
            />
          ))}
          <JourneyMoreResults
            shown={shown}
            total={sortedResults.length}
            onShowMore={() => setShown((count) => count + journeyResultsPerPage)}
          />
        </div>
      )}
      <JourneyDetails data={data} />
    </section>
  );
}
