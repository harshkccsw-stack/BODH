import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { excelLocalDateTime, localZoneLabel, minutesBetween } from '../attempt-times';

/**
 * The Raw Data sheet's Started At / Completed At cells: UTC instants from the
 * server, shown in the exporter's local time. Pinned to IST here so the
 * expected serials do not depend on the machine running the tests.
 */
describe('attempt times in the Raw Data sheet', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'Asia/Kolkata'; });
  afterAll(() => { process.env.TZ = originalTz; });

  it('turns a UTC instant into an Excel serial at local wall-clock time', () => {
    // 05:53:02 UTC is 11:23:02 IST on 2026-10-08; day 46303 counted from 1899-12-30.
    expect(excelLocalDateTime('2026-10-08T05:53:02.657971Z'))
      .toBeCloseTo(46303 + (11 * 3600 + 23 * 60 + 2) / 86400, 9);
    // Crossing midnight locally moves the date, not just the time.
    expect(excelLocalDateTime('2026-09-07T20:00:00Z')).toBeCloseTo(46273 + (1 * 3600 + 30 * 60) / 86400, 9);
  });

  it('leaves the cell blank when there is no time', () => {
    expect(excelLocalDateTime(null)).toBe('');
    expect(excelLocalDateTime(undefined)).toBe('');
    expect(excelLocalDateTime('not a date')).toBe('');
  });

  it('measures time taken in minutes, only when both ends are known and in order', () => {
    expect(minutesBetween('2026-09-08T05:20:32Z', '2026-09-08T05:23:31Z')).toBe(3);
    expect(minutesBetween('2026-09-22T08:23:45Z', '2026-09-22T08:42:41Z')).toBe(18.9);
    expect(minutesBetween(null, '2026-09-08T05:23:31Z')).toBe('');
    expect(minutesBetween('2026-09-08T05:23:31Z', null)).toBe('');
    expect(minutesBetween('2026-09-08T05:23:31Z', '2026-09-08T05:20:32Z')).toBe('');
  });

  it('names the zone for the headers', () => {
    expect(localZoneLabel()).toBe('GMT+5:30');
  });
});
