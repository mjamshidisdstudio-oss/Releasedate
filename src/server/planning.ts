import type { PrismaClient, Sprint, CalendarEvent, Holiday } from "@prisma/client";
import type { z } from "zod";
import { fromIsoDate, toIsoDate } from "@/lib/dates";
import type { CalendarEventDTO, HolidayDTO, SprintDTO } from "@/lib/calendar/types";
import { prisma as defaultPrisma } from "./db";
import { conflict, notFound } from "./errors";
import type { eventSchema, holidaySchema, sprintSchema } from "./validation";

/** Sprints, calendar events and holidays: simple CRUD with soft archive instead of delete. */

export const toSprintDTO = (s: Sprint): SprintDTO => ({
  id: s.id,
  number: s.number,
  name: s.name,
  startDate: toIsoDate(s.startDate),
  endDate: toIsoDate(s.endDate),
  archivedAt: s.archivedAt?.toISOString() ?? null,
});

export const toEventDTO = (e: CalendarEvent): CalendarEventDTO => ({
  id: e.id,
  title: e.title,
  date: toIsoDate(e.date),
  type: e.type,
  description: e.description,
  archivedAt: e.archivedAt?.toISOString() ?? null,
});

export const toHolidayDTO = (h: Holiday): HolidayDTO => ({
  id: h.id,
  date: toIsoDate(h.date),
  name: h.name,
  archivedAt: h.archivedAt?.toISOString() ?? null,
});

type SprintInput = z.output<typeof sprintSchema>;
type EventInput = z.output<typeof eventSchema>;
type HolidayInput = z.output<typeof holidaySchema>;

export class PlanningService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  // --- Sprints -------------------------------------------------------------

  async listSprints(): Promise<SprintDTO[]> {
    const rows = await this.db.sprint.findMany({ orderBy: { startDate: "desc" } });
    return rows.map(toSprintDTO);
  }

  async createSprint(input: SprintInput): Promise<SprintDTO> {
    await this.assertSprintFits(input);
    return toSprintDTO(await this.db.sprint.create({ data: this.sprintData(input) }));
  }

  async updateSprint(id: string, input: SprintInput): Promise<SprintDTO> {
    await this.findOr404(this.db.sprint.findUnique({ where: { id } }), "Sprint");
    await this.assertSprintFits(input, id);
    return toSprintDTO(await this.db.sprint.update({ where: { id }, data: this.sprintData(input) }));
  }

  async archiveSprint(id: string, archived: boolean): Promise<SprintDTO> {
    const sprint = await this.findOr404(this.db.sprint.findUnique({ where: { id } }), "Sprint");
    if (!archived) await this.assertSprintFits({ ...toSprintDTO(sprint) }, id);
    return toSprintDTO(await this.db.sprint.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } }));
  }

  private sprintData(input: SprintInput) {
    return {
      number: input.number,
      name: input.name,
      startDate: fromIsoDate(input.startDate),
      endDate: fromIsoDate(input.endDate),
    };
  }

  /** Active sprints must have unique numbers and must not overlap. */
  private async assertSprintFits(input: Pick<SprintInput, "number" | "startDate" | "endDate">, excludeId?: string) {
    const sameNumber = await this.db.sprint.findFirst({
      where: { number: input.number, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (sameNumber) throw conflict(`Sprint ${input.number} already exists`);
    const overlap = await this.db.sprint.findFirst({
      where: {
        archivedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startDate: { lte: fromIsoDate(input.endDate) },
        endDate: { gte: fromIsoDate(input.startDate) },
      },
    });
    if (overlap) throw conflict(`Dates overlap Sprint ${overlap.number}`);
  }

  // --- Calendar events -----------------------------------------------------

  async listEvents(): Promise<CalendarEventDTO[]> {
    const rows = await this.db.calendarEvent.findMany({ orderBy: { date: "desc" } });
    return rows.map(toEventDTO);
  }

  async createEvent(input: EventInput): Promise<CalendarEventDTO> {
    return toEventDTO(await this.db.calendarEvent.create({ data: { ...input, date: fromIsoDate(input.date) } }));
  }

  async updateEvent(id: string, input: EventInput): Promise<CalendarEventDTO> {
    await this.findOr404(this.db.calendarEvent.findUnique({ where: { id } }), "Event");
    return toEventDTO(
      await this.db.calendarEvent.update({ where: { id }, data: { ...input, date: fromIsoDate(input.date) } }),
    );
  }

  async archiveEvent(id: string, archived: boolean): Promise<CalendarEventDTO> {
    await this.findOr404(this.db.calendarEvent.findUnique({ where: { id } }), "Event");
    return toEventDTO(
      await this.db.calendarEvent.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } }),
    );
  }

  // --- Holidays ------------------------------------------------------------

  async listHolidays(): Promise<HolidayDTO[]> {
    const rows = await this.db.holiday.findMany({ orderBy: { date: "desc" } });
    return rows.map(toHolidayDTO);
  }

  async createHoliday(input: HolidayInput): Promise<HolidayDTO> {
    return toHolidayDTO(await this.db.holiday.create({ data: { name: input.name, date: fromIsoDate(input.date) } }));
  }

  async updateHoliday(id: string, input: HolidayInput): Promise<HolidayDTO> {
    await this.findOr404(this.db.holiday.findUnique({ where: { id } }), "Holiday");
    return toHolidayDTO(
      await this.db.holiday.update({ where: { id }, data: { name: input.name, date: fromIsoDate(input.date) } }),
    );
  }

  async archiveHoliday(id: string, archived: boolean): Promise<HolidayDTO> {
    await this.findOr404(this.db.holiday.findUnique({ where: { id } }), "Holiday");
    return toHolidayDTO(
      await this.db.holiday.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } }),
    );
  }

  private async findOr404<T>(query: Promise<T | null>, what: string): Promise<T> {
    const row = await query;
    if (!row) throw notFound(what);
    return row;
  }
}

export const planningService = new PlanningService();
