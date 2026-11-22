import { ASAKUSA_CUTOVER, editionServiceDate } from '../../shared/timetable-editions';
export function TimetableUnavailable({ now }: { now: Date }) {
  return (
    <div className="timetable-unavailable" role="status">
      <p>
        {editionServiceDate(now.getTime()) >= ASAKUSA_CUTOVER
          ? '改正後の時刻表を確認できていません。'
          : '時刻表を確認できていません。'}
      </p>
      <a href="https://www.kotsu.metro.tokyo.jp/subway/timetable/" target="_blank" rel="noreferrer">
        東京都交通局の時刻表を確認する
      </a>
    </div>
  );
}
