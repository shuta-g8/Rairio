const timeZone = 'Asia/Tokyo';

export const clockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
export const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});
export const operationTimestampFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone,
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const updatedAtFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
