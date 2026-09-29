import {
  eachDay,
  formatGregorianShort,
  formatJalali,
  isJalaliMonthEdge,
  isWeekend,
  jalali,
  weekdayName,
  type IsoDate,
} from "../dates";
import type { CalendarData, CalendarEventDTO, HolidayDTO, ReleaseDTO, ScheduleChangeDTO, SprintDTO } from "./types";

/**
 * Turns the aggregated calendar payload into render-ready days and Executive Summary rows.
 * This is the only place calendar grouping rules live; components just draw the result.
 */

export interface ReleaseItem {
  kind: "release";
  key: string;
  release: ReleaseDTO;
}

/** A release that used to be scheduled on this day and has since moved. */
export interface MovedItem {
  kind: "moved";
  key: string;
  release: ReleaseDTO;
  /** The date this card sits on: a previous schedule of the release. */
  previousDate: IsoDate;
  /** Where the release went when it left this date. */
  movedTo: IsoDate;
  /** Where the release is scheduled now. */
  currentDate: IsoDate;
  change: ScheduleChangeDTO;
}

export interface EventItem {
  kind: "event";
  key: string;
  event: CalendarEventDTO;
}

export type CalendarItem = ReleaseItem | MovedItem | EventItem;

export interface SprintTransition {
  sprint: SprintDTO;
  previous: SprintDTO | null;
  label: string;
}

export type DayLayout = "compact" | "full";

export interface CalendarDay {
  date: IsoDate;
  isToday: boolean;
  isWeekend: boolean;
  weekdayName: string;
  holidays: HolidayDTO[];
  sprintTransition: SprintTransition | null;
  items: CalendarItem[];
  layout: DayLayout;
  /** Column width in px, following the reference calendar's proportions. */
  width: number;
  primaryLabel: string;
  secondaryLabel: string;
}

export type SummaryRow =
  | { kind: "sprint"; key: string; date: IsoDate; transition: SprintTransition }
  | { kind: "event"; key: string; date: IsoDate; event: CalendarEventDTO }
  | { kind: "release"; key: string; date: IsoDate; release: ReleaseDTO }
  | { kind: "moved"; key: string; date: IsoDate; item: MovedItem };

export interface CalendarView {
  days: CalendarDay[];
  summary: SummaryRow[];
  sprintRange: { first: number; last: number } | null;
  /** True when nothing at all (releases, moves, events, sprint transitions) falls in the range. */
  isEmpty: boolean;
}

export const DAY_WIDTH = {
  compact: 44,
  holidayOnly: 86,
  markerOnly: 155,
  cards: 290,
  cardsWide: 330,
  cardsWidest: 360,
} as const;

function sprintLabel(sprint: SprintDTO, previous: SprintDTO | null): string {
  return previous ? `Sprint ${previous.number} → ${sprint.number}` : `Sprint ${sprint.number} starts`;
}

export function sprintTransitions(sprints: SprintDTO[]): Map<IsoDate, SprintTransition> {
  const ordered = [...sprints].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const map = new Map<IsoDate, SprintTransition>();
  ordered.forEach((sprint, i) => {
    const previous = i > 0 ? ordered[i - 1] : null;
    map.set(sprint.startDate, { sprint, previous, label: sprintLabel(sprint, previous) });
  });
  return map;
}

/**
 * Historical cards: one per (release, previous date), skipping any previous date the
 * release is scheduled on again today, so a release that moved back never shows twice.
 */
export function movedItems(releases: ReleaseDTO[], history: ScheduleChangeDTO[]): MovedItem[] {
  const byRelease = new Map<string, ScheduleChangeDTO[]>();
  for (const change of history) {
    const list = byRelease.get(change.releaseId) ?? [];
    list.push(change);
    byRelease.set(change.releaseId, list);
  }

  const items: MovedItem[] = [];
  for (const release of releases) {
    const changes = (byRelease.get(release.id) ?? []).sort((a, b) => a.changedAt.localeCompare(b.changedAt));
    // The latest change away from each date says where the release went from there.
    const lastLeave = new Map<IsoDate, ScheduleChangeDTO>();
    for (const change of changes) lastLeave.set(change.previousDate, change);

    for (const [previousDate, change] of lastLeave) {
      if (previousDate === release.currentDate) continue;
      items.push({
        kind: "moved",
        key: `moved:${release.id}:${previousDate}`,
        release,
        previousDate,
        movedTo: change.newDate,
        currentDate: release.currentDate,
        change,
      });
    }
  }
  return items;
}

function longestTitle(items: CalendarItem[]): number {
  return Math.max(
    0,
    ...items.map((item) => (item.kind === "event" ? item.event.title : item.release.title).length),
  );
}

export function dayWidth(items: CalendarItem[], hasSprintTransition: boolean, hasHoliday: boolean): number {
  if (items.length > 0) {
    const longest = longestTitle(items);
    if (longest > 56) return DAY_WIDTH.cardsWidest;
    if (longest > 32) return DAY_WIDTH.cardsWide;
    return DAY_WIDTH.cards;
  }
  if (hasSprintTransition) return DAY_WIDTH.markerOnly;
  if (hasHoliday) return DAY_WIDTH.holidayOnly;
  return DAY_WIDTH.compact;
}

function groupBy<T>(values: T[], key: (value: T) => IsoDate): Map<IsoDate, T[]> {
  const map = new Map<IsoDate, T[]>();
  for (const value of values) {
    const k = key(value);
    const list = map.get(k) ?? [];
    list.push(value);
    map.set(k, list);
  }
  return map;
}

const byCreated = (a: { release: ReleaseDTO }, b: { release: ReleaseDTO }) =>
  a.release.createdAt.localeCompare(b.release.createdAt) || a.release.title.localeCompare(b.release.title);

export function buildCalendarView(data: CalendarData): CalendarView {
  const days = eachDay(data.from, data.to);
  const releasesByDate = groupBy(data.releases, (r) => r.currentDate);
  const movedByDate = groupBy(movedItems(data.releases, data.releaseScheduleHistory), (m) => m.previousDate);
  const eventsByDate = groupBy(data.events, (e) => e.date);
  const holidaysByDate = groupBy(data.holidays, (h) => h.date);
  const transitions = sprintTransitions(data.sprints);

  const calendarDays: CalendarDay[] = days.map((date, index) => {
    const events: EventItem[] = (eventsByDate.get(date) ?? []).map((event) => ({
      kind: "event",
      key: `event:${event.id}`,
      event,
    }));
    const releases: ReleaseItem[] = (releasesByDate.get(date) ?? [])
      .map((release): ReleaseItem => ({ kind: "release", key: `release:${release.id}`, release }))
      .sort(byCreated);
    const moved = (movedByDate.get(date) ?? []).sort(byCreated);
    const items: CalendarItem[] = [...events, ...releases, ...moved];

    const holidays = holidaysByDate.get(date) ?? [];
    const sprintTransition = transitions.get(date) ?? null;
    const width = dayWidth(items, sprintTransition !== null, holidays.length > 0);
    const layout: DayLayout = width > DAY_WIDTH.compact ? "full" : "compact";
    const j = jalali(date);

    return {
      date,
      isToday: date === data.today,
      isWeekend: isWeekend(date),
      weekdayName: weekdayName(date),
      holidays,
      sprintTransition,
      items,
      layout,
      width,
      primaryLabel: layout === "full" ? formatGregorianShort(date) : String(Number(date.slice(8))),
      secondaryLabel:
        layout === "full" || index === 0 || isJalaliMonthEdge(date) ? formatJalali(date) : String(j.day),
    };
  });

  const summary: SummaryRow[] = [];
  for (const day of calendarDays) {
    if (day.sprintTransition) {
      summary.push({ kind: "sprint", key: `sprint:${day.date}`, date: day.date, transition: day.sprintTransition });
    }
    for (const item of day.items) {
      if (item.kind === "event") summary.push({ kind: "event", key: item.key, date: day.date, event: item.event });
      else if (item.kind === "release") summary.push({ kind: "release", key: item.key, date: day.date, release: item.release });
      else summary.push({ kind: "moved", key: item.key, date: day.date, item });
    }
  }

  const visibleSprints = data.sprints.filter((s) => s.endDate >= data.from && s.startDate <= data.to);
  const numbers = visibleSprints.map((s) => s.number);

  return {
    days: calendarDays,
    summary,
    sprintRange: numbers.length ? { first: Math.min(...numbers), last: Math.max(...numbers) } : null,
    isEmpty: summary.length === 0,
  };
}
