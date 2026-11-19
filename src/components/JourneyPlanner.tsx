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
import { LoadingSpinner, LoadingStatus } from './LoadingStatus';
import { useJourneyData } from '../hooks/useJourneyData';
import { isExternalJourneyPlace } from '../lib/journey-place-search';
import { searchJourneyOptions, type JourneySearchState } from '../lib/journey-search';
import { loadJourneyHistory, rememberJourneyPlace } from '../lib/journey-search-history';
import type { StationData } from '../types';
import type { TrainPositionsSnapshot } from '../../shared/train-positions';
import { useJourneyStationData } from '../hooks/useJourneyStationData';
import type { NearbyStation } from '../hooks/useNearbyStation';
import { completeJourneyArrival, sortJourneyOptions, type JourneySort } from '../lib/journey-sort';

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
  selectedStationData,
  positions,
  onManualInput,
  nearby,
}: {
  stationId: string;
  selectedStationData?: StationData | null;
  positions?: TrainPositionsSnapshot | null;
  onManualInput?: () => void;
  nearby?: NearbyStation;
}) {
  const [from, setFrom] = useState(stationId);
  const [to, setTo] = useState('');
  const [initialDateTime] = useState(nowFields);
  const [date, setDate] = useState(initialDateTime[0]);
  const [time, setTime] = useState(initialDateTime[1]);
  const { data, error: dataError, reload } = useJourneyData();
  const [searchError, setSearchError] = useState('');
  const error = dataError || searchError;
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState<JourneySearchState>();
  const [sort, setSort] = useState<JourneySort>('arrival');
  const sortedResults = useMemo(
    () => (search ? sortJourneyOptions(search.results, sort, search.inbound) : []),
    [search, sort],
  );
  const boardingStationIds = useMemo(() => {
    if (!search || search.inbound || !data) return [];
    return [
      ...new Set(
        search.results.flatMap(
          (result) =>
            result.journey?.legs.flatMap((leg) =>
              leg.kind === 'ride' ? [data.stops[leg.from].station] : [],
            ) ?? [],
        ),
      ),
    ];
  }, [search, data]);
  const boardingStations = useJourneyStationData(boardingStationIds, selectedStationData);
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
  const inbound = isExternalJourneyPlace(from);
  useEffect(() => {
    setFrom(stationId);
    setSearch(undefined);
  }, [stationId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!data || busy) return;
    if (!from || !to) {
      setAttempted(true);
      setSearchError('');
      setSearch(undefined);
      return;
    }
    if (isExternalJourneyPlace(from) && isExternalJourneyPlace(to)) {
      setSearchError('出発駅または到着駅の片方に都営地下鉄の駅を選んでください。');
      return;
    }
    setSearchError('');
    setBusy(true);
    setSearch(undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      setSearch(searchJourneyOptions(data, { from, to, date, time }));
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : '検索に失敗しました。');
    } finally {
      setBusy(false);
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
            <button
              ref={submitRef}
              type="submit"
              className="journey-submit"
              disabled={!data || busy}
            >
              {busy ? <LoadingSpinner /> : <MagnifyingGlassIcon size={19} aria-hidden="true" />}
              {busy ? '検索中…' : '経路を検索'}
            </button>
          </div>
          {inbound && (
            <p className="journey-data-note">
              他社線の所要時間・接続が未確認のため、都営区間も含めて時刻は表示しません。
            </p>
          )}
        </form>
        {!data && !error && <LoadingStatus>時刻表・運賃データを読み込んでいます…</LoadingStatus>}
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
        {data?.lineEndDates.Asakusa && (
          <p className="journey-data-note">
            浅草線の時刻付き案内は11月20日営業分まで。11月21日改正後の列車時刻表は確認中です。他の3路線は収録期間内で検索できます。
          </p>
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
          {search.results.length > 0 && (
            <div className="journey-result-tools">
              <label>
                並び替え
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as JourneySort)}
                >
                  <option value="arrival">到着が早い順</option>
                  <option value="toei">都営線優先</option>
                </select>
              </label>
            </div>
          )}
          {search.external && (
            <p className="journey-data-note">
              他社線は乗換先の案内のみです。全区間の到着時刻・運賃・終電接続は未計算です。
            </p>
          )}
          {sortedResults.some(
            (result) => completeJourneyArrival(result, search.inbound) === undefined,
          ) && (
            <p className="journey-data-note">
              {sort === 'arrival'
                ? '到着時刻が分かる経路を早い順に、未計算の経路はその後に表示します。未計算の経路を含めた最速順ではありません。'
                : '都営線のみ、都営線を含む経路、他社線のみの順に表示します。到着時刻が未計算の経路も含みます。'}
            </p>
          )}
          {search.message && (
            <p className="journey-empty" role="status">
              {search.message}
            </p>
          )}
          {sortedResults.map((result, i) => (
            <JourneyResult
              key={`${sort}-${i}`}
              result={result}
              data={data!}
              inbound={search.inbound}
              index={i}
              boardingStations={boardingStations}
              positions={positions}
            />
          ))}
        </div>
      )}
      <JourneyDetails data={data} />
    </section>
  );
}
