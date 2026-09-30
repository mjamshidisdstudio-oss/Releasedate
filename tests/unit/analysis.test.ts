import { describe, expect, it } from "vitest";
import { analyzeReleases, jalaliLabel } from "@/lib/calendar/analysis";
import type { CalendarData, ReleaseDTO, ScheduleChangeDTO } from "@/lib/calendar/types";

const release = (over: Partial<ReleaseDTO> & { id: string }): ReleaseDTO => ({
  title: over.id,
  description: null,
  type: "feature",
  status: "planned",
  currentDate: "2026-10-07",
  dueBefore: false,
  releasedAt: null,
  cancelledAt: null,
  hiddenAt: null,
  teams: ["backend"],
  createdBy: null,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
  isOverdue: false,
  scheduleChangeCount: 0,
  lastScheduleChange: null,
  ...over,
});

const change = (releaseId: string, previousDate: string, newDate: string, changedAt: string, reason: string | null = null): ScheduleChangeDTO => ({
  id: `${releaseId}:${changedAt}`,
  releaseId,
  previousDate,
  newDate,
  reason,
  changedBy: "admin",
  changedAt,
});

const data: CalendarData = {
  from: "2026-09-01",
  to: "2026-10-31",
  today: "2026-10-10",
  releases: [
    // Moved twice (1 Oct → 5 Oct → 7 Oct), released on 7 Oct: late vs the original plan, on time vs the final one.
    release({ id: "a", status: "released", releasedAt: "2026-10-07T08:00:00Z", scheduleChangeCount: 2 }),
    // Never moved, released a day early.
    release({ id: "b", status: "released", currentDate: "2026-09-20", releasedAt: "2026-09-19T08:00:00Z", teams: ["frontend"] }),
    // Open and past its date.
    release({ id: "c", currentDate: "2026-10-08", isOverdue: true, teams: ["backend", "ai"] }),
    // Due within 14 days.
    release({ id: "d", currentDate: "2026-10-15", status: "ready" }),
    // Only here because it used to be scheduled inside the range: not counted.
    release({ id: "e", currentDate: "2026-12-01" }),
  ],
  releaseScheduleHistory: [
    change("a", "2026-10-05", "2026-10-07", "2026-09-10T00:00:00Z", "QA"),
    change("a", "2026-10-01", "2026-10-05", "2026-09-01T00:00:00Z", "Waiting for design"),
  ],
  sprints: [{ id: "s", number: 88, name: null, startDate: "2026-10-04", endDate: "2026-10-17", archivedAt: null }],
  events: [],
  holidays: [],
};

describe("release analysis", () => {
  const result = analyzeReleases(data);

  it("labels dates in Jalali", () => {
    expect(jalaliLabel("2026-10-07")).toBe("15 Mehr 1405");
  });

  it("counts only releases scheduled inside the range", () => {
    expect(result.totals.releases).toBe(4);
    expect(result.totals.byStatus).toEqual({ released: 2, planned: 1, ready: 1 });
    expect(result.totals.overdue).toBe(1);
  });

  it("measures slips against the first planned date, with the move reasons in order", () => {
    expect(result.schedule).toMatchObject({ moved: 1, totalMoves: 2, maxSlipDays: 6, avgSlipDaysOfMoved: 6 });
    expect(result.schedule.mostSlipped[0]).toMatchObject({ id: "a", originalDate: "2026-10-01", slipDays: 6, reasons: ["Waiting for design", "QA"] });
  });

  it("compares the actual release day (Tehran) with the original and final plans", () => {
    expect(result.delivery).toEqual({ released: 2, onTimeVsOriginalPlan: 1, onTimeVsFinalPlan: 2, avgDaysLateVsOriginalPlan: 3 });
  });

  it("breaks down by team and sprint, and lists overdue and upcoming releases", () => {
    expect(result.teams.backend).toEqual({ total: 3, released: 1, open: 2, overdue: 1, moved: 1, cancelled: 0 });
    expect(result.sprints).toEqual([
      { sprint: 88, name: null, start: "2026-10-04", end: "2026-10-17", total: 3, released: 1, open: 2, cancelled: 0, overdue: 1 },
    ]);
    expect(result.overdue.map((r) => [r.id, r.daysOverdue])).toEqual([["c", 2]]);
    expect(result.upcoming14Days.map((r) => r.id)).toEqual(["d"]);
  });

  it("filters by team", () => {
    expect(analyzeReleases(data, { team: "frontend" }).totals.releases).toBe(1);
  });
});
