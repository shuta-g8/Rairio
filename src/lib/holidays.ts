import { HOLIDAY_DATES } from '../generated/holiday-dates.ts';

// Retain the provider's local civil-date semantics, including its full date range.
export function isHoliday(date: Date | string): boolean {
  const key =
    date instanceof Date
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      : date;
  return HOLIDAY_DATES.has(key);
}
