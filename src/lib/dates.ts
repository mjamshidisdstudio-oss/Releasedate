/**
 * Business dates are plain ISO calendar dates ("2026-10-07") interpreted in Asia/Tehran.
 * Timestamps (createdAt, releasedAt, ...) are UTC instants.
 */

export type IsoDate = string;

export const BUSINESS_TIME_ZONE = "Asia/Tehran";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Convert a DB `DATE` value (a Date at UTC midnight) to an ISO date string. */
export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** Convert an ISO date string to the Date value Prisma expects for a `DATE` column. */
export function fromIsoDate(value: IsoDate): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const d = fromIsoDate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function diffDays(from: IsoDate, to: IsoDate): number {
  return Math.round((fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / 86_400_000);
}

export function eachDay(from: IsoDate, to: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Today's business date in Tehran. */
export function todayInTehran(now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 0 = Sunday ... 5 = Friday, 6 = Saturday */
export function weekday(value: IsoDate): number {
  return fromIsoDate(value).getUTCDay();
}

/** Our product calendar treats Friday and Saturday as weekend days. */
export const WEEKEND_DAYS = [5, 6] as const;

export function isWeekend(value: IsoDate): boolean {
  return (WEEKEND_DAYS as readonly number[]).includes(weekday(value));
}

export function weekdayName(value: IsoDate): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(fromIsoDate(value));
}

export interface JalaliParts {
  year: number;
  month: number;
  day: number;
  monthName: string;
}

const jalaliNumeric = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
const jalaliMonthName = new Intl.DateTimeFormat("en-US-u-ca-persian", { timeZone: "UTC", month: "long" });

export function jalali(value: IsoDate): JalaliParts {
  const d = fromIsoDate(value);
  const parts = jalaliNumeric.formatToParts(d);
  const num = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: num("year"), month: num("month"), day: num("day"), monthName: jalaliMonthName.format(d) };
}

/** "15 Mehr" */
export function formatJalali(value: IsoDate, opts: { withYear?: boolean } = {}): string {
  const j = jalali(value);
  return opts.withYear ? `${j.day} ${j.monthName} ${j.year}` : `${j.day} ${j.monthName}`;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "7 Oct" (fixed abbreviations; some locales print "Sept") */
export function formatGregorianShort(value: IsoDate, opts: { padDay?: boolean; withYear?: boolean } = {}): string {
  const [y, m, d] = value.split("-");
  const day = opts.padDay ? d : String(Number(d));
  return `${day} ${MONTHS_SHORT[Number(m) - 1]}${opts.withYear ? ` ${y}` : ""}`;
}

/** "15 Mehr · 7 Oct" */
export function formatDual(value: IsoDate): string {
  return `${formatJalali(value)} · ${formatGregorianShort(value)}`;
}

/** Is this the first or last day of its Jalali month? */
export function isJalaliMonthEdge(value: IsoDate): boolean {
  return jalali(value).day === 1 || jalali(addDays(value, 1)).day === 1;
}

/** "28 Sep 2026, 18:34" in Tehran time. */
export function formatTimestamp(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("day")} ${MONTHS_SHORT[Number(get("month")) - 1]} ${get("year")}, ${get("hour")}:${get("minute")}`;
}
