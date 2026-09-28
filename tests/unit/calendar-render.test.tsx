import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCalendarView } from "@/lib/calendar/build";
import type { CalendarData, ReleaseDTO } from "@/lib/calendar/types";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { ExecutiveSummary } from "@/components/calendar/ExecutiveSummary";

const hdr: ReleaseDTO = {
  id: "hdr",
  title: "HDR Service Release",
  description: null,
  type: "feature",
  status: "planned",
  currentDate: "2026-10-07",
  dueBefore: false,
  releasedAt: null,
  cancelledAt: null,
  teams: ["backend", "frontend"],
  createdBy: null,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
  isOverdue: false,
  scheduleChangeCount: 1,
  lastScheduleChange: null,
};

const payload: CalendarData = {
  from: "2026-09-23",
  to: "2026-10-07",
  today: "2026-09-28",
  releases: [hdr],
  releaseScheduleHistory: [
    { id: "c1", releaseId: "hdr", previousDate: "2026-09-23", newDate: "2026-10-07", reason: null, changedBy: "x", changedAt: "2026-08-02T00:00:00Z" },
  ],
  sprints: [],
  events: [],
  holidays: [],
};

function column(html: string, date: string): string {
  const start = html.indexOf(`data-date="${date}"`);
  const end = html.indexOf("<section", start);
  return html.slice(start, end === -1 ? undefined : end);
}

describe("calendar rendering", () => {
  const view = buildCalendarView(payload);
  const html = renderToStaticMarkup(<CalendarGrid days={view.days} />);

  it("renders the previous date as a faded Moved card pointing at the new date (1 Mehr → 15 Mehr)", () => {
    const oldDay = column(html, "2026-09-23");
    expect(oldDay).toContain("moved-history");
    expect(oldDay).toContain("Moved");
    expect(oldDay).toContain("→ 15 Mehr");
  });

  it("renders the current date as a normal active card", () => {
    const newDay = column(html, "2026-10-07");
    expect(newDay).toContain("HDR Service Release");
    expect(newDay).not.toContain("moved-history");
    expect(newDay).toContain("task-card multi");
  });

  it("derives the Executive Summary from the same data", () => {
    const summary = renderToStaticMarkup(<ExecutiveSummary rows={view.summary} />);
    expect(summary).toContain("23 Sep / 1 Mehr");
    expect(summary).toContain("Moved → 15 Mehr");
    expect(summary).toContain("07 Oct / 15 Mehr");
  });
});
