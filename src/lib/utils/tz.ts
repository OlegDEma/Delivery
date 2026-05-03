/**
 * Europe/Kyiv timezone helpers.
 *
 * Operational timezone for the business is Europe/Kyiv (UTC+2 winter, UTC+3 summer).
 * Database stores everything in UTC, so when the UI sends "YYYY-MM-DD" or we compute
 * "today", we must resolve those to the correct UTC instants that correspond to
 * local midnight / end-of-day in Kyiv — accounting for DST.
 *
 * We use Intl.DateTimeFormat with the IANA zone so Node's built-in ICU does the DST
 * math — no deps, no manual rule tables.
 */

const KYIV_ZONE = 'Europe/Kyiv';

/** Returns the Kyiv UTC offset (in hours) at the given instant. +2 in winter, +3 in summer. */
export function kyivOffsetHours(date: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: KYIV_ZONE,
    timeZoneName: 'shortOffset',
  });
  const parts = fmt.formatToParts(date);
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+2';
  const match = /GMT([+-]\d+)/.exec(tzName);
  return match ? parseInt(match[1], 10) : 2;
}

/** Format offset hours like `+02:00` or `-03:00`. */
function formatOffset(hours: number): string {
  const sign = hours >= 0 ? '+' : '-';
  const h = String(Math.abs(hours)).padStart(2, '0');
  return `${sign}${h}:00`;
}

/** Returns the Kyiv-local date ("YYYY-MM-DD") for a given instant (default: now). */
export function kyivYmd(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KYIV_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" sanity check — bare regex, callers should validate before passing. */
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** UTC Date corresponding to 00:00:00 local-Kyiv for the given "YYYY-MM-DD". */
export function startOfKyivDay(ymd: string): Date {
  if (!YMD_RE.test(ymd)) throw new Error(`Invalid YYYY-MM-DD: ${ymd}`);
  // Build a probe in the middle of the day to pick the right offset (handles DST boundary days).
  const probe = new Date(`${ymd}T12:00:00Z`);
  const offset = formatOffset(kyivOffsetHours(probe));
  return new Date(`${ymd}T00:00:00.000${offset}`);
}

/** UTC Date corresponding to 23:59:59.999 local-Kyiv for the given "YYYY-MM-DD". */
export function endOfKyivDay(ymd: string): Date {
  if (!YMD_RE.test(ymd)) throw new Error(`Invalid YYYY-MM-DD: ${ymd}`);
  const probe = new Date(`${ymd}T12:00:00Z`);
  const offset = formatOffset(kyivOffsetHours(probe));
  return new Date(`${ymd}T23:59:59.999${offset}`);
}

/** Start of the Kyiv-local "today" as a UTC Date. */
export function startOfKyivToday(now: Date = new Date()): Date {
  return startOfKyivDay(kyivYmd(now));
}

/**
 * Build a Prisma-compatible { gte?, lte? } range from optional "YYYY-MM-DD" strings,
 * interpreting them as full calendar days in Europe/Kyiv.
 */
export function kyivDateRange(
  fromYmd?: string | null,
  toYmd?: string | null,
): { gte?: Date; lte?: Date } {
  const range: { gte?: Date; lte?: Date } = {};
  if (fromYmd) range.gte = startOfKyivDay(fromYmd);
  if (toYmd) range.lte = endOfKyivDay(toYmd);
  return range;
}
