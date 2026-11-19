import { memo } from 'react';
import type { DayKind, Route } from '../types';
import { Modal } from './Modal';
import { TimetableContent } from './TimetableContent';

export const Timetable = memo(function Timetable({
  stationName,
  route,
  initialDay,
  onClose,
}: {
  stationName: string;
  route: Route;
  initialDay: DayKind;
  onClose: () => void;
}) {
  return (
    <Modal
      title={`${stationName}駅の一日分の時刻表`}
      onClose={onClose}
      wide
      mobileCloseLabel="時刻表を閉じる"
    >
      <TimetableContent route={route} initialDay={initialDay} />
    </Modal>
  );
});
