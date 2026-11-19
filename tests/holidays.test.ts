import test from 'node:test';
import assert from 'node:assert/strict';
import holidayJp from '@holiday-jp/holiday_jp';
import { HOLIDAY_DATES, HOLIDAY_SOURCE_VERSION } from '../src/generated/holiday-dates.ts';
import { isHoliday } from '../src/lib/holidays.ts';

test('軽量な祝日表は取得元の全日付とバージョンを保持する', () => {
  assert.equal(HOLIDAY_SOURCE_VERSION, holidayJp.VERSION);
  assert.deepEqual([...HOLIDAY_DATES], Object.keys(holidayJp.holidays).sort());
  for (let year = 1969; year <= 2051; year++) {
    for (let month = 0; month < 12; month++)
      for (let day = 1; day <= 31; day++) {
        const date = new Date(year, month, day);
        assert.equal(isHoliday(date), holidayJp.isHoliday(date), date.toISOString());
      }
  }
  for (const key of ['1970-01-01', '2026-05-06', '2050-01-01', 'not-a-date', '2026-1-1']) {
    assert.equal(isHoliday(key), holidayJp.isHoliday(key), key);
  }
});
