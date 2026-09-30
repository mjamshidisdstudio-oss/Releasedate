import { execSync } from "node:child_process";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildCalendarView } from "@/lib/calendar/build";
import { fromIsoDate } from "@/lib/dates";
import { CalendarService } from "@/server/calendar";
import { prisma } from "@/server/db";
import { ReleaseService, type Actor } from "@/server/releases";
import { createReleaseSchema } from "@/server/validation";
import { createActor, resetDatabase } from "./helpers";

const calendar = new CalendarService(prisma);
const releases = new ReleaseService(prisma);
let actor: Actor;

beforeEach(async () => {
  await resetDatabase();
  actor = await createActor();
});

afterAll(() => prisma.$disconnect());

describe("calendar aggregation", () => {
  it("returns current releases, moved history, sprints, events and holidays for the range", async () => {
    const inRange = await releases.create(
      createReleaseSchema.parse({ title: "In range", teams: ["frontend"], releaseDate: "2026-09-20" }),
      actor,
    );
    // Moved out of the range: must still come back because its old date is inside it.
    const movedOut = await releases.create(
      createReleaseSchema.parse({ title: "Moved out", teams: ["backend", "ai"], releaseDate: "2026-09-23" }),
      actor,
    );
    await releases.move(movedOut.id, { newDate: "2026-10-22", reason: null }, actor);
    await releases.create(createReleaseSchema.parse({ title: "Elsewhere", teams: ["ai"], releaseDate: "2026-12-01" }), actor);

    await prisma.sprint.createMany({
      data: [
        { number: 87, startDate: fromIsoDate("2026-09-07"), endDate: fromIsoDate("2026-09-20") },
        { number: 88, startDate: fromIsoDate("2026-09-21"), endDate: fromIsoDate("2026-10-04") },
        { number: 99, startDate: fromIsoDate("2027-01-01"), endDate: fromIsoDate("2027-01-14") },
      ],
    });
    await prisma.calendarEvent.createMany({
      data: [
        { title: "Madrid Event", date: fromIsoDate("2026-09-25") },
        { title: "Archived", date: fromIsoDate("2026-09-26"), archivedAt: new Date() },
      ],
    });
    await prisma.holiday.create({ data: { name: "Holiday", date: fromIsoDate("2026-09-24") } });

    const data = await calendar.getCalendar("2026-09-15", "2026-10-01", "2026-09-28");

    expect(data.releases.map((r) => r.title).sort()).toEqual(["In range", "Moved out"]);
    expect(data.releaseScheduleHistory).toEqual([
      expect.objectContaining({ releaseId: movedOut.id, previousDate: "2026-09-23", newDate: "2026-10-22" }),
    ]);
    // Sprint 87 precedes the range start's sprint and is included so "87 → 88" can be labelled.
    expect(data.sprints.map((s) => s.number)).toEqual([87, 88]);
    expect(data.events.map((e) => e.title)).toEqual(["Madrid Event"]);
    expect(data.holidays.map((h) => h.name)).toEqual(["Holiday"]);
    expect(data.releases.find((r) => r.id === inRange.id)?.isOverdue).toBe(true);

    const view = buildCalendarView(data);
    const sept23 = view.days.find((d) => d.date === "2026-09-23")!;
    expect(sept23.items).toEqual([expect.objectContaining({ kind: "moved", currentDate: "2026-10-22" })]);
    expect(view.days.find((d) => d.date === "2026-09-21")!.sprintTransition?.label).toBe("Sprint 87 → 88");
  });

  it("move back: A → B → A keeps both history rows but shows one active card on A", async () => {
    const r = await releases.create(
      createReleaseSchema.parse({ title: "Social Pack Release", teams: ["frontend"], releaseDate: "2026-09-20" }),
      actor,
    );
    await releases.move(r.id, { newDate: "2026-09-16", reason: null }, actor);
    await releases.move(r.id, { newDate: "2026-09-20", reason: null }, actor);

    expect(await releases.history(r.id)).toHaveLength(2);
    const view = buildCalendarView(await calendar.getCalendar("2026-09-10", "2026-09-30"));
    const onA = view.days.find((d) => d.date === "2026-09-20")!.items;
    expect(onA.map((i) => i.kind)).toEqual(["release"]);
    const onB = view.days.find((d) => d.date === "2026-09-16")!.items;
    expect(onB.map((i) => i.kind)).toEqual(["moved"]);
  });
});

describe("seeded roadmap", () => {
  it("reproduces the reference calendar from the database", async () => {
    execSync("npx tsx prisma/seed.ts", { env: process.env, stdio: "pipe" });
    const view = buildCalendarView(await calendar.getCalendar("2026-08-18", "2026-10-25", "2026-09-28"));
    const titles = (date: string, kind: "release" | "moved") =>
      view.days
        .find((d) => d.date === date)!
        .items.filter((i) => i.kind === kind)
        .map((i) => (i.kind === "event" ? i.event.title : i.release.title));

    // 22 Shahrivar: two faded cards, nothing active.
    expect(titles("2026-09-13", "release")).toEqual([]);
    expect(titles("2026-09-13", "moved")).toEqual(["Workspace V5.2 Full Rollout", "HDR Service Release"]);
    // 25 Shahrivar: Unified Login and Social Pack were planned there before.
    expect(titles("2026-09-16", "moved")).toEqual(["Unified Login & Signup Flow", "Social Pack Release"]);
    // 29 Shahrivar: Social Pack is back — one active card, no faded duplicate.
    expect(titles("2026-09-20", "release")).toEqual(["Social Pack Release", "Workspace V5.2 Improvements", "AIHD LAB"]);
    expect(titles("2026-09-20", "moved")).toEqual([]);
    // 1 Mehr → 15 Mehr / 30 Mehr
    expect(titles("2026-09-23", "moved")).toHaveLength(4);
    expect(titles("2026-10-07", "release")).toHaveLength(4);
    expect(titles("2026-10-22", "release")).toEqual(["Auto Evaluator"]);
    // Past items are no longer "planned".
    expect(titles("2026-08-31", "release")).toHaveLength(4);
    expect(view.days.find((d) => d.date === "2026-08-31")!.items.every((i) => i.kind === "release" && i.release.status === "released")).toBe(true);

    const labels = view.days.filter((d) => d.sprintTransition).map((d) => [d.date, d.sprintTransition!.label]);
    expect(labels).toEqual([
      ["2026-08-24", "Sprint 85 → 86"],
      ["2026-09-07", "Sprint 86 → 87"],
      ["2026-09-21", "Sprint 87 → 88"],
      ["2026-10-05", "Sprint 88 → 89"],
      ["2026-10-19", "Sprint 89 → 90"],
    ]);
    expect(view.days.find((d) => d.date === "2026-10-25")!.items).toEqual([
      expect.objectContaining({ kind: "event", event: expect.objectContaining({ title: "Madrid Event" }) }),
    ]);
    expect(view.days.find((d) => d.date === "2026-08-21")!.holidays).toHaveLength(1);
    expect(view.days.find((d) => d.date === "2026-08-30")!.holidays).toHaveLength(1);
  });
});

describe("hidden releases", () => {
  it("hidden release disappears from the calendar and default list but keeps its data and history", async () => {
    const r = await releases.create(
      createReleaseSchema.parse({ title: "To hide", teams: ["frontend"], releaseDate: "2026-09-20" }),
      actor,
    );
    await releases.move(r.id, { newDate: "2026-09-25", reason: "test" }, actor);
    await releases.setHidden(r.id, true);

    const hiddenView = buildCalendarView(await calendar.getCalendar("2026-09-15", "2026-09-30"));
    expect(hiddenView.summary).toHaveLength(0);
    expect((await releases.list({ status: [], needsUpdate: false })).map((x) => x.id)).not.toContain(r.id);
    expect((await releases.list({ status: [], needsUpdate: false, hidden: true })).map((x) => x.id)).toEqual([r.id]);
    expect(await releases.history(r.id)).toHaveLength(1);
    expect(await prisma.release.count()).toBe(1);

    await releases.setHidden(r.id, false);
    const view = buildCalendarView(await calendar.getCalendar("2026-09-15", "2026-09-30"));
    expect(view.summary.map((row) => row.kind).sort()).toEqual(["moved", "release"]);
  });
});
