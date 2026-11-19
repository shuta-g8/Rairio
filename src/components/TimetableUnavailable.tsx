import { TIMETABLE_SOURCE } from '../../shared/transit-source';
import { ASAKUSA_CUTOVER, editionServiceDate } from '../../shared/timetable-editions';
export function TimetableUnavailable({ now }: { now: Date }) {
  return (
    <div className="timetable-unavailable" role="status">
      <p>
        {editionServiceDate(now.getTime()) >= ASAKUSA_CUTOVER
          ? '改正後の時刻表を確認できていません。'
          : '時刻表を確認できていません。'}
      </p>
      <a href={TIMETABLE_SOURCE} target="_blank" rel="noreferrer">
        東京都交通局の時刻表を確認する
      </a>
    </div>
  );
}
