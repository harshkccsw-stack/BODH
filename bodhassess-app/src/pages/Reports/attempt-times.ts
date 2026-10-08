// When an attempt was started and completed, for the Raw Data sheet (V45).
// Pure — no `@/` imports — so it is unit-tested without the API client.
//
// The server sends ISO instants in UTC. The sheet shows them in the local
// time of whoever exports, as REAL Excel date cells (they sort and filter as
// dates); Excel dates carry no zone, so the headers name it instead.

/** Excel's day zero. Serial 1 is 1900-01-01 (Lotus's 1900 leap-year bug included). */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

/** The number format the date cells are written with. */
export const EXCEL_DATE_TIME_FORMAT = 'yyyy-mm-dd hh:mm:ss';

/**
 * An ISO instant as an Excel date serial reading as the exporter's LOCAL
 * wall-clock time, to the second. '' when absent or unreadable, so the cell
 * stays blank — an attempt nobody has a time for is never given one.
 */
export function excelLocalDateTime(iso: string | null | undefined): number | '' {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const wall = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return (wall - EXCEL_EPOCH_UTC) / DAY_MS;
}

/**
 * Minutes from start to completion, one decimal. Wall-clock — it includes any
 * time the respondent spent away. '' unless both are known and in order.
 */
export function minutesBetween(startIso: string | null | undefined, endIso: string | null | undefined): number | '' {
  if (!startIso || !endIso) return '';
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '';
  return Math.round((end - start) / 6_000) / 10;
}

/**
 * The exporter's UTC offset for the column headers ("GMT+5:30"). The offset,
 * not the zone's name: browsers still report India as "Asia/Calcutta", and
 * the offset is exactly what the numbers in the cells were shifted by.
 */
export function localZoneLabel(): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName');
    return part?.value || 'local time';
  } catch {
    return 'local time';
  }
}
