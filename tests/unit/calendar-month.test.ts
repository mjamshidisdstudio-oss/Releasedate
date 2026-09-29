import { describe, expect, it } from "vitest";
import { buildMonthGrid, monthOf, monthSubtitle, monthTitle, orderedSpan, shiftMonth } from "@/lib/calendar/month";
import type { SprintDTO } from "@/lib/calendar/types";

const sprint = (number: number, startDate: string, endDate: string): SprintDTO => ({
  id: `s${number}`,
  number,
  name: null,
  startDate,
  endDate,
  archivedAt: null,
});

describe("month ranges", () => {
  it("finds the Jalali month around a date (Mehr 1405 = 23 Sep – 22 Oct 2026)", () => {
    const mehr = monthOf("2026-10-07", "jalali");
    expect(mehr).toEqual({ start: "2026-09-23", end: "2026-10-22" });
    expect(monthTitle(mehr, "jalali")).toBe("Mehr 1405");
    expect(monthSubtitle(mehr, "jalali")).toBe("23 Sep – 22 Oct 2026");
  });

  it("handles 31-day Jalali months (Shahrivar 1405)", () => {
    expect(monthOf("2026-09-22", "jalali")).toEqual({ start: "2026-08-23", end: "2026-09-22" });
  });

  it("finds the Gregorian month around a date", () => {
    const oct = monthOf("2026-10-07", "gregorian");
    expect(oct).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(monthTitle(oct, "gregorian")).toBe("October 2026");
    expect(monthSubtitle(oct, "gregorian")).toBe("9 Mehr – 9 Aban 1405");
    expect(monthOf("2026-12-15", "gregorian")).toEqual({ start: "2026-12-01", end: "2026-12-31" });
  });

  it("steps to neighbouring months", () => {
    expect(shiftMonth("2026-10-07", "jalali", 1).start).toBe("2026-10-23"); // 1 Aban
    expect(shiftMonth("2026-10-07", "jalali", -1).start).toBe("2026-08-23"); // 1 Shahrivar
    expect(shiftMonth("2026-12-15", "gregorian", 1)).toEqual({ start: "2027-01-01", end: "2027-01-31" });
    expect(shiftMonth("2026-10-07", "gregorian", -2).start).toBe("2026-08-01");
  });
});

describe("month grid", () => {
  it("pads the month to whole Sunday → Saturday weeks", () => {
    const grid = buildMonthGrid(monthOf("2026-10-07", "jalali"), "jalali");
    expect(grid.from).toBe("2026-09-20"); // Sunday before 1 Mehr (Wed)
    expect(grid.to).toBe("2026-10-24"); // Saturday after 30 Mehr (Thu)
    expect(grid.weeks).toHaveLength(5);
    expect(grid.weeks.every((w) => w.days.length === 7)).toBe(true);
    expect(grid.weeks[0].days[0]).toMatchObject({ date: "2026-09-20", inMonth: false, primary: 29, secondary: "20 Sep" });
    expect(grid.weeks[0].days[3]).toMatchObject({ date: "2026-09-23", inMonth: true, primary: 1 });
  });

  it("labels days with the other calendar", () => {
    const grid = buildMonthGrid(monthOf("2026-10-07", "gregorian"), "gregorian");
    expect(grid.weeks[0].days[4]).toMatchObject({ date: "2026-10-01", primary: 1, secondary: "9 Mehr" });
  });

  it("splits sprints into one bar per week", () => {
    const grid = buildMonthGrid(monthOf("2026-10-07", "jalali"), "jalali", [
      sprint(88, "2026-09-21", "2026-10-04"),
      sprint(89, "2026-10-05", "2026-10-18"),
    ]);
    const [w1, w2, w3] = grid.weeks;
    expect(w1.sprints).toEqual([expect.objectContaining({ startCol: 2, endCol: 7, startsHere: true, endsHere: false })]);
    expect(w2.sprints).toEqual([expect.objectContaining({ startCol: 1, endCol: 7, startsHere: false, endsHere: false })]);
    expect(w3.sprints.map((s) => [s.sprint.number, s.startCol, s.endCol, s.startsHere, s.endsHere])).toEqual([
      [88, 1, 1, false, true],
      [89, 2, 7, true, false],
    ]);
  });

  it("orders a dragged span either way", () => {
    expect(orderedSpan("2026-10-09", "2026-10-06")).toEqual(["2026-10-06", "2026-10-09"]);
    expect(orderedSpan("2026-10-06", "2026-10-06")).toEqual(["2026-10-06", "2026-10-06"]);
  });
});
