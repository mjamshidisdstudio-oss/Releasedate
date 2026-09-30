import type { IsoDate } from "../dates";
import type { CalendarEventType, ReleaseStatus, ReleaseType, Team } from "../domain";

/** JSON shapes returned by the API. Dates are ISO calendar dates, timestamps are ISO UTC strings. */

export interface ScheduleChangeDTO {
  id: string;
  releaseId: string;
  previousDate: IsoDate;
  newDate: IsoDate;
  reason: string | null;
  changedBy: string | null;
  changedAt: string;
}

export interface ReleaseDTO {
  id: string;
  title: string;
  description: string | null;
  type: ReleaseType;
  status: ReleaseStatus;
  currentDate: IsoDate;
  dueBefore: boolean;
  releasedAt: string | null;
  cancelledAt: string | null;
  /** Set when an admin hid the release; hidden releases never reach the calendar. */
  hiddenAt: string | null;
  teams: Team[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Planned/ready/blocked with a scheduled date before today (Tehran). Derived, never stored. */
  isOverdue: boolean;
  scheduleChangeCount: number;
  lastScheduleChange: ScheduleChangeDTO | null;
}

export interface SprintDTO {
  id: string;
  number: number;
  name: string | null;
  startDate: IsoDate;
  endDate: IsoDate;
  archivedAt: string | null;
}

export interface CalendarEventDTO {
  id: string;
  title: string;
  date: IsoDate;
  type: CalendarEventType;
  description: string | null;
  archivedAt: string | null;
}

export interface HolidayDTO {
  id: string;
  date: IsoDate;
  name: string;
  archivedAt: string | null;
}

export interface CalendarData {
  from: IsoDate;
  to: IsoDate;
  today: IsoDate;
  /** Releases scheduled inside the range, plus releases that used to be scheduled inside it. */
  releases: ReleaseDTO[];
  /** Full schedule history of every release above, oldest first. */
  releaseScheduleHistory: ScheduleChangeDTO[];
  /** Sprints overlapping the range, plus the sprint right before it (for "N → N+1" labels). */
  sprints: SprintDTO[];
  events: CalendarEventDTO[];
  holidays: HolidayDTO[];
}
