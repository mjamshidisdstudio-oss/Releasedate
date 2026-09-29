import { addDays, diffDays, eachDay, formatGregorianShort, jalali, weekday, type IsoDate } from "../dates";
import type { SprintDTO } from "./types";

/**
 * Month grid for the Back Office calendar (Google Calendar style).
 * A month is either a Jalali month (default) or a Gregorian one; weeks run Sunday → Saturday
 * so the Friday/Saturday weekend sits at the end of each row.
 */

export type MonthMode = "jalali" | "gregorian";

export const WEEK_START = 0; // Sunday

const GREGORIAN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export interface MonthRange {
  start: IsoDate;
  end: IsoDate;
}

/** First and last day of the month (in `mode`) that contains `date`. */
export function monthOf(date: IsoDate, mode: MonthMode): MonthRange {
  if (mode === "gregorian") {
    const [y, m] = date.split("-").map(Number);
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const nextStart = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    return { start, end: addDays(nextStart, -1) };
  }
  const start = addDays(date, 1 - jalali(date).day);
  let end = addDays(start, 28);
  while (jalali(addDays(end, 1)).day !== 1) end = addDays(end, 1);
  return { start, end };
}

/** The month `offset` months away from the one containing `date`. */
export function shiftMonth(date: IsoDate, mode: MonthMode, offset: number): MonthRange {
  let range = monthOf(date, mode);
  for (let i = 0; i < Math.abs(offset); i++) {
    range = monthOf(offset > 0 ? addDays(range.end, 1) : addDays(range.start, -1), mode);
  }
  return range;
}

/** "Mehr 1405" or "October 2026". */
export function monthTitle(range: MonthRange, mode: MonthMode): string {
  if (mode === "gregorian") {
    const [y, m] = range.start.split("-").map(Number);
    return `${GREGORIAN_MONTHS[m - 1]} ${y}`;
  }
  const j = jalali(range.start);
  return `${j.monthName} ${j.year}`;
}

/** The other calendar's span for the same month: "23 Sep – 22 Oct 2026" or "10 Mehr – 9 Aban 1405". */
export function monthSubtitle(range: MonthRange, mode: MonthMode): string {
  if (mode === "jalali") {
    return `${formatGregorianShort(range.start)} – ${formatGregorianShort(range.end, { withYear: true })}`;
  }
  const a = jalali(range.start);
  const b = jalali(range.end);
  return `${a.day} ${a.monthName} – ${b.day} ${b.monthName} ${b.year}`;
}

export interface GridDay {
  date: IsoDate;
  inMonth: boolean;
  /** Day number in the active calendar. */
  primary: number;
  /** Short label in the other calendar ("7 Oct" / "15 Mehr"). */
  secondary: string;
}

export interface SprintSegment {
  sprint: SprintDTO;
  /** 1-based grid columns within the week, end inclusive. */
  startCol: number;
  endCol: number;
  /** The sprint starts / ends inside this week (rounded bar ends). */
  startsHere: boolean;
  endsHere: boolean;
}

export interface GridWeek {
  days: GridDay[];
  sprints: SprintSegment[];
}

export interface MonthGrid {
  month: MonthRange;
  /** First and last day shown, including the spill-over days of the neighbouring months. */
  from: IsoDate;
  to: IsoDate;
  weeks: GridWeek[];
}

export function buildMonthGrid(month: MonthRange, mode: MonthMode, sprints: SprintDTO[] = []): MonthGrid {
  const from = addDays(month.start, -((weekday(month.start) - WEEK_START + 7) % 7));
  const to = addDays(month.end, (WEEK_START + 6 - weekday(month.end) + 7) % 7);
  const days: GridDay[] = eachDay(from, to).map((date) => {
    const j = jalali(date);
    return {
      date,
      inMonth: date >= month.start && date <= month.end,
      primary: mode === "jalali" ? j.day : Number(date.slice(8)),
      secondary: mode === "jalali" ? formatGregorianShort(date) : `${j.day} ${j.monthName}`,
    };
  });

  const ordered = [...sprints].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const weeks: GridWeek[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const week = days.slice(i, i + 7);
    const weekStart = week[0].date;
    const weekEnd = week[6].date;
    const segments = ordered
      .filter((s) => s.startDate <= weekEnd && s.endDate >= weekStart)
      .map((sprint): SprintSegment => {
        const first = sprint.startDate > weekStart ? sprint.startDate : weekStart;
        const last = sprint.endDate < weekEnd ? sprint.endDate : weekEnd;
        return {
          sprint,
          startCol: diffDays(weekStart, first) + 1,
          endCol: diffDays(weekStart, last) + 1,
          startsHere: sprint.startDate >= weekStart,
          endsHere: sprint.endDate <= weekEnd,
        };
      });
    weeks.push({ days: week, sprints: segments });
  }
  return { month, from, to, weeks };
}

/** Days between two dates in either order, inclusive, as [earlier, later]. */
export function orderedSpan(a: IsoDate, b: IsoDate): [IsoDate, IsoDate] {
  return a <= b ? [a, b] : [b, a];
}
