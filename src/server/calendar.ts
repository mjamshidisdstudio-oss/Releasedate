import type { PrismaClient } from "@prisma/client";
import { addDays, fromIsoDate, todayInTehran, type IsoDate } from "@/lib/dates";
import type { CalendarData } from "@/lib/calendar/types";
import { prisma as defaultPrisma } from "./db";
import { releaseInclude, toReleaseDTO, toScheduleChangeDTO } from "./releases";
import { toEventDTO, toHolidayDTO, toSprintDTO } from "./planning";

export class CalendarService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  /** Everything the calendar needs for one range, in a fixed number of queries. */
  async getCalendar(from: IsoDate, to: IsoDate, today: IsoDate = todayInTehran()): Promise<CalendarData> {
    const range = { gte: fromIsoDate(from), lte: fromIsoDate(to) };

    const [releases, sprints, previousSprint, events, holidays] = await Promise.all([
      this.db.release.findMany({
        where: {
          hiddenAt: null,
          OR: [{ currentDate: range }, { scheduleChanges: { some: { previousDate: range } } }],
        },
        include: releaseInclude,
        orderBy: [{ currentDate: "asc" }, { createdAt: "asc" }],
      }),
      this.db.sprint.findMany({
        where: { archivedAt: null, startDate: { lte: range.lte }, endDate: { gte: range.gte } },
        orderBy: { startDate: "asc" },
      }),
      this.db.sprint.findFirst({
        where: { archivedAt: null, startDate: { lt: range.gte } },
        orderBy: { startDate: "desc" },
      }),
      this.db.calendarEvent.findMany({ where: { archivedAt: null, date: range }, orderBy: { date: "asc" } }),
      this.db.holiday.findMany({ where: { archivedAt: null, date: range }, orderBy: { date: "asc" } }),
    ]);

    const allSprints = [...sprints];
    if (previousSprint && !allSprints.some((s) => s.id === previousSprint.id)) allSprints.unshift(previousSprint);

    return {
      from,
      to,
      today,
      releases: releases.map((r) => toReleaseDTO(r, today)),
      releaseScheduleHistory: releases.flatMap((r) => r.scheduleChanges.map(toScheduleChangeDTO)),
      sprints: allSprints.map(toSprintDTO),
      events: events.map(toEventDTO),
      holidays: holidays.map(toHolidayDTO),
    };
  }

  /**
   * Default window: from the start of the sprint two before the current one to the end of
   * the sprint two after it. Falls back to four weeks back / six weeks ahead without sprints.
   */
  async defaultRange(today: IsoDate = todayInTehran()): Promise<{ from: IsoDate; to: IsoDate }> {
    const todayDate = fromIsoDate(today);
    const [before, after] = await Promise.all([
      this.db.sprint.findMany({
        where: { archivedAt: null, startDate: { lte: todayDate } },
        orderBy: { startDate: "desc" },
        take: 3,
      }),
      this.db.sprint.findMany({
        where: { archivedAt: null, startDate: { gt: todayDate } },
        orderBy: { startDate: "asc" },
        take: 2,
      }),
    ]);
    const first = before.at(-1);
    const last = after.at(-1) ?? before[0];
    const from = first ? first.startDate.toISOString().slice(0, 10) : addDays(today, -28);
    const to = last && last.endDate > todayDate ? last.endDate.toISOString().slice(0, 10) : addDays(today, 42);
    return { from, to };
  }
}

export const calendarService = new CalendarService();
