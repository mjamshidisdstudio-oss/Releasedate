import { describe, expect, it } from "vitest";
import { buildCalendarView, DAY_WIDTH, movedItems } from "@/lib/calendar/build";
import type { CalendarData, ReleaseDTO, ScheduleChangeDTO, SprintDTO } from "@/lib/calendar/types";

let seq = 0;
function release(overrides: Partial<ReleaseDTO> & { id: string; currentDate: string }): ReleaseDTO {
  return {
    title: overrides.id,
    description: null,
    type: "feature",
    status: "planned",
    dueBefore: false,
    releasedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    teams: ["backend"],
    createdBy: null,
    createdAt: `2026-08-01T00:00:${String(seq++ % 60).padStart(2, "0")}Z`,
    updatedAt: "2026-08-01T00:00:00Z",
    isOverdue: false,
    scheduleChangeCount: 0,
    lastScheduleChange: null,
    ...overrides,
  };
}

function change(releaseId: string, previousDate: string, newDate: string, minute: number): ScheduleChangeDTO {
  return {
    id: `${releaseId}-${minute}`,
    releaseId,
    previousDate,
    newDate,
    reason: null,
    changedBy: "tester",
    changedAt: `2026-08-02T10:${String(minute).padStart(2, "0")}:00Z`,
  };
}

function data(overrides: Partial<CalendarData>): CalendarData {
  return {
    from: "2026-09-01",
    to: "2026-10-31",
    today: "2026-09-28",
    releases: [],
    releaseScheduleHistory: [],
    sprints: [],
    events: [],
    holidays: [],
    ...overrides,
  };
}

const day = (view: ReturnType<typeof buildCalendarView>, date: string) => view.days.find((d) => d.date === date)!;

describe("buildCalendarView — schedule history", () => {
  it("shows a moved release as a faded card on its old date and an active card on its new date", () => {
    const hdr = release({ id: "hdr", currentDate: "2026-10-07" });
    const view = buildCalendarView(data({ releases: [hdr], releaseScheduleHistory: [change("hdr", "2026-09-23", "2026-10-07", 1)] }));

    const oldDay = day(view, "2026-09-23").items;
    expect(oldDay).toHaveLength(1);
    expect(oldDay[0]).toMatchObject({ kind: "moved", previousDate: "2026-09-23", currentDate: "2026-10-07" });

    const newDay = day(view, "2026-10-07").items;
    expect(newDay).toHaveLength(1);
    expect(newDay[0]).toMatchObject({ kind: "release" });
  });

  it("keeps one faded card per earlier date when a release moves several times (A → B → C)", () => {
    const r = release({ id: "r", currentDate: "2026-10-20" });
    const items = movedItems([r], [change("r", "2026-10-01", "2026-10-10", 1), change("r", "2026-10-10", "2026-10-20", 2)]);
    expect(items.map((i) => [i.previousDate, i.movedTo, i.currentDate])).toEqual([
      ["2026-10-01", "2026-10-10", "2026-10-20"],
      ["2026-10-10", "2026-10-20", "2026-10-20"],
    ]);
  });

  it("renders only the active card when a release moves back to an earlier date (Social Pack: 29 → 25 → 29)", () => {
    const social = release({ id: "social", currentDate: "2026-09-20" });
    const history = [change("social", "2026-09-20", "2026-09-16", 1), change("social", "2026-09-16", "2026-09-20", 2)];
    const view = buildCalendarView(data({ releases: [social], releaseScheduleHistory: history }));

    expect(day(view, "2026-09-20").items.map((i) => i.kind)).toEqual(["release"]);
    expect(day(view, "2026-09-16").items).toHaveLength(1);
    expect(day(view, "2026-09-16").items[0]).toMatchObject({ kind: "moved", movedTo: "2026-09-20" });
  });

  it("collapses repeated moves away from the same date into one card that points at the latest move", () => {
    const r = release({ id: "r", currentDate: "2026-10-30" });
    const history = [
      change("r", "2026-10-01", "2026-10-05", 1),
      change("r", "2026-10-05", "2026-10-01", 2),
      change("r", "2026-10-01", "2026-10-30", 3),
    ];
    const onFirst = movedItems([r], history).filter((i) => i.previousDate === "2026-10-01");
    expect(onFirst).toHaveLength(1);
    expect(onFirst[0].movedTo).toBe("2026-10-30");
  });

  it("does not show a moved card for a date outside the requested range", () => {
    const r = release({ id: "r", currentDate: "2026-10-07" });
    const view = buildCalendarView(data({ from: "2026-10-01", releases: [r], releaseScheduleHistory: [change("r", "2026-09-13", "2026-10-07", 1)] }));
    expect(view.summary.filter((row) => row.kind === "moved")).toHaveLength(0);
  });
});

describe("buildCalendarView — markers and layout", () => {
  const sprints: SprintDTO[] = [
    { id: "s87", number: 87, name: null, startDate: "2026-09-07", endDate: "2026-09-20", archivedAt: null },
    { id: "s88", number: 88, name: null, startDate: "2026-09-21", endDate: "2026-10-04", archivedAt: null },
  ];

  it("derives sprint transition labels from sprint start dates", () => {
    const view = buildCalendarView(data({ sprints }));
    expect(day(view, "2026-09-21").sprintTransition?.label).toBe("Sprint 87 → 88");
    expect(day(view, "2026-09-07").sprintTransition?.label).toBe("Sprint 87 starts");
    expect(view.summary).toContainEqual(expect.objectContaining({ kind: "sprint", date: "2026-09-21" }));
    expect(view.sprintRange).toEqual({ first: 87, last: 88 });
  });

  it("keeps weekends, official holidays and events as separate concepts", () => {
    const view = buildCalendarView(
      data({
        holidays: [{ id: "h", date: "2026-09-01", name: "Holiday", archivedAt: null }],
        events: [{ id: "e", title: "Madrid Event", date: "2026-10-25", type: "company_event", description: null, archivedAt: null }],
      }),
    );
    const friday = day(view, "2026-09-04");
    expect(friday).toMatchObject({ isWeekend: true, holidays: [], items: [] });
    expect(day(view, "2026-09-05").isWeekend).toBe(true); // Saturday
    expect(day(view, "2026-09-01")).toMatchObject({ isWeekend: false, holidays: [expect.objectContaining({ name: "Holiday" })] });
    expect(day(view, "2026-10-25").items[0]).toMatchObject({ kind: "event" });
  });

  it("compresses empty days and widens days with content", () => {
    const view = buildCalendarView(
      data({
        sprints,
        releases: [release({ id: "r", currentDate: "2026-09-15" })],
        holidays: [{ id: "h", date: "2026-09-01", name: "Holiday", archivedAt: null }],
      }),
    );
    expect(day(view, "2026-09-02")).toMatchObject({ width: DAY_WIDTH.compact, layout: "compact" });
    expect(day(view, "2026-09-01")).toMatchObject({ width: DAY_WIDTH.holidayOnly, layout: "full" });
    expect(day(view, "2026-09-21")).toMatchObject({ width: DAY_WIDTH.markerOnly, layout: "full" });
    expect(day(view, "2026-09-15").width).toBeGreaterThanOrEqual(DAY_WIDTH.cards);
  });

  it("reports an empty range", () => {
    expect(buildCalendarView(data({})).isEmpty).toBe(true);
  });
});
