import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { addDays, isIsoDate, todayInTehran } from "@/lib/dates";
import { EDITABLE_STATUSES, EVENT_TYPES, RELEASE_STATUSES, RELEASE_TYPES, TEAMS } from "@/lib/domain";
import { analyzeReleases, jalaliLabel, releaseRow } from "@/lib/calendar/analysis";
import { calendarService } from "./calendar";
import { DomainError, notFound } from "./errors";
import { planningService } from "./planning";
import { releaseService, type Actor } from "./releases";
import {
  archiveSchema,
  calendarRangeSchema,
  createReleaseSchema,
  eventSchema,
  holidaySchema,
  listReleasesSchema,
  markReleasedSchema,
  moveReleaseSchema,
  sprintSchema,
  updateReleaseSchema,
} from "./validation";

/**
 * MCP tools for Claude and other MCP clients: read, analyze and edit the calendar from chat.
 * Tools call the same services and validation as the Back Office API, acting as the token's owner,
 * so every rule (moves kept in history, nothing deleted, no overlapping sprints) still applies.
 */

const INSTRUCTIONS = `Releasedate is the team's release calendar and Back Office.
Dates are Gregorian YYYY-MM-DD business dates in Asia/Tehran; results also carry Jalali labels (e.g. "15 Mehr 1405"). Convert Jalali dates the user gives you to Gregorian before calling a tool.
A release's date only changes through move_release, which records old -> new date (with an optional reason) in an append-only history. Releases are cancelled, never deleted; sprints, events and holidays are archived, never deleted.
Weekends are Friday and Saturday. Teams: ${TEAMS.join(", ")}.
Find a record's id with a read tool before changing it, and say what you are about to change.`;

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isIsoDate, "Not a real date")
  .describe("YYYY-MM-DD (Gregorian, Tehran business date)");
const uuid = z.string().uuid();
const kinds = ["sprints", "events", "holidays"] as const;

const read = { readOnlyHint: true, openWorldHint: false } as const;
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

function describeError(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  if (error instanceof z.ZodError) {
    return error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
  }
  console.error(error);
  return "Something went wrong";
}

/** Runs a tool body, returning its result as JSON text, or its error as a readable tool error. */
async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await fn(), null, 2) }] };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: describeError(error) }] };
  }
}

const defined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;

export function createMcpServer(actor: Actor): McpServer {
  const server = new McpServer({ name: "releasedate", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  // --- Reading & analysis ------------------------------------------------------------

  server.registerTool(
    "get_calendar",
    {
      title: "Get calendar",
      description:
        "Everything on the calendar for a date range (max 370 days): releases with Jalali dates, schedule history, sprints, events and holidays. Without a range, the default window around the current sprints.",
      inputSchema: { from: date.optional(), to: date.optional() },
      annotations: read,
    },
    ({ from, to }) =>
      run(async () => {
        const range = from || to ? calendarRangeSchema.parse({ from, to }) : await calendarService.defaultRange();
        const data = await calendarService.getCalendar(range.from, range.to);
        return {
          from: data.from,
          to: data.to,
          today: data.today,
          releases: data.releases.map(releaseRow),
          scheduleHistory: data.releaseScheduleHistory.map((h) => ({
            releaseId: h.releaseId,
            from: h.previousDate,
            to: h.newDate,
            reason: h.reason,
            by: h.changedBy,
            at: h.changedAt,
          })),
          sprints: data.sprints.map((s) => ({ id: s.id, number: s.number, name: s.name, start: s.startDate, end: s.endDate })),
          events: data.events.map((e) => ({ ...e, jalali: jalaliLabel(e.date) })),
          holidays: data.holidays.map((h) => ({ ...h, jalali: jalaliLabel(h.date) })),
        };
      }),
  );

  server.registerTool(
    "list_releases",
    {
      title: "List releases",
      description: "Search releases; every filter is optional. needs_update=true returns open releases whose date has passed (overdue).",
      inputSchema: {
        q: z.string().max(200).optional().describe("Text in the title"),
        status: z.array(z.enum(RELEASE_STATUSES)).optional(),
        team: z.enum(TEAMS).optional(),
        from: date.optional(),
        to: date.optional(),
        needs_update: z.boolean().optional(),
      },
      annotations: read,
    },
    ({ q, status, team, from, to, needs_update }) =>
      run(async () => {
        const filters = listReleasesSchema.parse(
          defined({ q, status: status?.join(","), team, from, to, needsUpdate: needs_update ? "true" : undefined }),
        );
        const rows = await releaseService.list(filters);
        return { count: rows.length, releases: rows.map(releaseRow) };
      }),
  );

  server.registerTool(
    "get_release",
    {
      title: "Get release",
      description: "One release in full, with its description and complete schedule history (every move, its reason and who made it).",
      inputSchema: { id: uuid },
      annotations: read,
    },
    ({ id }) =>
      run(async () => {
        const [release, history] = await Promise.all([releaseService.get(id), releaseService.history(id)]);
        return {
          ...release,
          jalali: jalaliLabel(release.currentDate),
          history: history.map((h) => ({ from: h.previousDate, to: h.newDate, reason: h.reason, by: h.changedBy, at: h.changedAt })),
        };
      }),
  );

  server.registerTool(
    "analyze_releases",
    {
      title: "Analyze releases",
      description:
        "Delivery analysis for releases scheduled in a range: counts by status/type/team, overdue list, how often and how far releases slipped against their first planned date (with move reasons), on-time delivery, a per-sprint breakdown and what is due in the next 14 days. Defaults to the last 120 days through the next 60.",
      inputSchema: { from: date.optional(), to: date.optional(), team: z.enum(TEAMS).optional() },
      annotations: read,
    },
    ({ from, to, team }) =>
      run(async () => {
        const today = todayInTehran();
        const range = calendarRangeSchema.parse({ from: from ?? addDays(today, -120), to: to ?? addDays(today, 60) });
        return analyzeReleases(await calendarService.getCalendar(range.from, range.to, today), { team });
      }),
  );

  server.registerTool(
    "list_planning",
    {
      title: "List sprints, events or holidays",
      description: "All sprints, calendar events or Iran official holidays, newest first. Archived (deactivated) ones only with include_archived.",
      inputSchema: { kind: z.enum(kinds), include_archived: z.boolean().optional() },
      annotations: read,
    },
    ({ kind, include_archived }) =>
      run(async () => {
        const rows = await { sprints: () => planningService.listSprints(), events: () => planningService.listEvents(), holidays: () => planningService.listHolidays() }[kind]();
        const visible = include_archived ? rows : rows.filter((r) => !r.archivedAt);
        return { count: visible.length, [kind]: visible };
      }),
  );

  // --- Writing: releases --------------------------------------------------------------

  const newRelease = z.object({
    title: z.string().min(1).max(200),
    release_date: date,
    teams: z.array(z.enum(TEAMS)).min(1),
    type: z.enum(RELEASE_TYPES).optional(),
    description: z.string().max(5000).optional(),
    due_before: z.boolean().optional().describe("Deadline: due before this date rather than on it"),
    status: z.enum(EDITABLE_STATUSES).optional(),
  });

  server.registerTool(
    "create_releases",
    {
      title: "Create releases",
      description:
        "Create 1-50 releases (e.g. from a pasted roadmap). Each one is created independently; the result lists what was created and anything that failed and why.",
      inputSchema: { releases: z.array(newRelease).min(1).max(50) },
      annotations: write,
    },
    ({ releases }) =>
      run(async () => {
        const created = [];
        const failed = [];
        for (const r of releases) {
          try {
            const input = createReleaseSchema.parse(
              defined({
                title: r.title,
                releaseDate: r.release_date,
                teams: r.teams,
                type: r.type,
                description: r.description,
                dueBefore: r.due_before,
                status: r.status,
              }),
            );
            created.push(releaseRow(await releaseService.create(input, actor)));
          } catch (error) {
            failed.push({ title: r.title, error: describeError(error) });
          }
        }
        return { created, failed };
      }),
  );

  server.registerTool(
    "update_release",
    {
      title: "Update release",
      description:
        "Change a release's title, description, type, teams, due-before flag or status (planned/ready/blocked). Only the given fields change. Its date only changes through move_release.",
      inputSchema: {
        id: uuid,
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(5000).nullable().optional().describe("null clears it"),
        type: z.enum(RELEASE_TYPES).optional(),
        teams: z.array(z.enum(TEAMS)).min(1).optional(),
        due_before: z.boolean().optional(),
        status: z.enum(EDITABLE_STATUSES).optional(),
      },
      annotations: { ...write, idempotentHint: true },
    },
    ({ id, due_before, ...fields }) =>
      run(async () => releaseRow(await releaseService.update(id, updateReleaseSchema.parse(defined({ ...fields, dueBefore: due_before }))))),
  );

  server.registerTool(
    "move_release",
    {
      title: "Move release",
      description: "Reschedule a release. The old date is kept in its history and stays on the calendar as a faded 'Moved' card.",
      inputSchema: { id: uuid, new_date: date, reason: z.string().max(1000).optional() },
      annotations: write,
    },
    ({ id, new_date, reason }) =>
      run(async () => releaseRow(await releaseService.move(id, moveReleaseSchema.parse({ newDate: new_date, reason }), actor))),
  );

  server.registerTool(
    "change_release_status",
    {
      title: "Mark released / cancel / reopen",
      description:
        "released: mark as shipped (released_at defaults to now; the scheduled date is kept). cancelled: cancel it (it stays on the calendar). reopen: undo a mistaken release or cancel.",
      inputSchema: {
        id: uuid,
        action: z.enum(["released", "cancelled", "reopen"]),
        released_at: z.string().optional().describe("ISO timestamp with offset, only for action=released"),
      },
      annotations: write,
    },
    ({ id, action, released_at }) =>
      run(async () => {
        if (action === "released") {
          return releaseRow(await releaseService.markReleased(id, markReleasedSchema.parse(defined({ releasedAt: released_at }))));
        }
        return releaseRow(action === "cancelled" ? await releaseService.cancel(id) : await releaseService.reopen(id));
      }),
  );

  // --- Writing: sprints, events, holidays ------------------------------------------------

  /** With an id, merges the given fields over the record's current values; without, creates it. */
  async function current<T extends { id: string }>(rows: Promise<T[]>, id: string, what: string): Promise<T> {
    const row = (await rows).find((r) => r.id === id);
    if (!row) throw notFound(what);
    return row;
  }

  server.registerTool(
    "save_sprint",
    {
      title: "Create or update sprint",
      description:
        "Without id: create a sprint (number, start_date and end_date required). With id: update only the given fields. Active sprints cannot overlap and numbers are unique.",
      inputSchema: {
        id: uuid.optional(),
        number: z.number().int().positive().optional(),
        name: z.string().max(100).nullable().optional(),
        start_date: date.optional(),
        end_date: date.optional(),
      },
      annotations: write,
    },
    ({ id, number, name, start_date, end_date }) =>
      run(async () => {
        const given = defined({ number, name, startDate: start_date, endDate: end_date });
        if (!id) return planningService.createSprint(sprintSchema.parse(given));
        const s = await current(planningService.listSprints(), id, "Sprint");
        const merged = { number: s.number, name: s.name, startDate: s.startDate, endDate: s.endDate, ...given };
        return planningService.updateSprint(id, sprintSchema.parse(merged));
      }),
  );

  server.registerTool(
    "save_event",
    {
      title: "Create or update calendar event",
      description: "Without id: create an event (title and date required). With id: update only the given fields.",
      inputSchema: {
        id: uuid.optional(),
        title: z.string().min(1).max(200).optional(),
        date: date.optional(),
        type: z.enum(EVENT_TYPES).optional(),
        description: z.string().max(5000).nullable().optional(),
      },
      annotations: write,
    },
    ({ id, ...fields }) =>
      run(async () => {
        const given = defined(fields);
        if (!id) return planningService.createEvent(eventSchema.parse(given));
        const e = await current(planningService.listEvents(), id, "Event");
        const merged = { title: e.title, date: e.date, type: e.type, description: e.description, ...given };
        return planningService.updateEvent(id, eventSchema.parse(merged));
      }),
  );

  server.registerTool(
    "save_holiday",
    {
      title: "Create or update holiday",
      description: "Iran official holiday. Without id: create it (name and date required). With id: update only the given fields.",
      inputSchema: { id: uuid.optional(), name: z.string().min(1).max(200).optional(), date: date.optional() },
      annotations: write,
    },
    ({ id, ...fields }) =>
      run(async () => {
        const given = defined(fields);
        if (!id) return planningService.createHoliday(holidaySchema.parse(given));
        const h = await current(planningService.listHolidays(), id, "Holiday");
        return planningService.updateHoliday(id, holidaySchema.parse({ name: h.name, date: h.date, ...given }));
      }),
  );

  server.registerTool(
    "archive_planning_record",
    {
      title: "Deactivate or restore a sprint, event or holiday",
      description: "archived=true hides it from the calendar (nothing is deleted); archived=false restores it.",
      inputSchema: { kind: z.enum(kinds), id: uuid, archived: z.boolean() },
      annotations: { ...write, idempotentHint: true },
    },
    ({ kind, id, archived }) =>
      run(async () => {
        const { archived: value } = archiveSchema.parse({ archived });
        if (kind === "sprints") return planningService.archiveSprint(id, value);
        if (kind === "events") return planningService.archiveEvent(id, value);
        return planningService.archiveHoliday(id, value);
      }),
  );

  return server;
}
