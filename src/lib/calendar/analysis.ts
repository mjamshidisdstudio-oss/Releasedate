import { addDays, diffDays, formatJalali, jalali, todayInTehran, type IsoDate } from "../dates";
import { OPEN_STATUSES, type Team } from "../domain";
import type { CalendarData, ReleaseDTO, ScheduleChangeDTO } from "./types";

/**
 * Delivery analysis for the releases scheduled inside one calendar payload's range.
 * "Original date" is a release's first planned date: the earliest move's previous date,
 * or its current date if it never moved. Used by the MCP `analyze_releases` tool.
 */

/** "15 Mehr 1405" */
export const jalaliLabel = (date: IsoDate) => `${formatJalali(date)} ${jalali(date).year}`;

/** Compact release row for tool results: enough to reason about, small enough to list dozens. */
export function releaseRow(r: ReleaseDTO) {
  return {
    id: r.id,
    title: r.title,
    date: r.currentDate,
    jalali: jalaliLabel(r.currentDate),
    status: r.status,
    overdue: r.isOverdue,
    teams: r.teams,
    type: r.type,
    dueBefore: r.dueBefore,
    moves: r.scheduleChangeCount,
    releasedAt: r.releasedAt,
  };
}

interface Row {
  release: ReleaseDTO;
  originalDate: IsoDate;
  slipDays: number;
  releasedOn: IsoDate | null;
  moves: number;
  reasons: string[];
}

const isOpen = (r: ReleaseDTO) => OPEN_STATUSES.includes(r.status);

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
}

const average = (values: number[]) =>
  values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;

export function analyzeReleases(data: CalendarData, options: { team?: Team } = {}) {
  const { team } = options;
  const today = data.today;
  const historyByRelease = new Map<string, ScheduleChangeDTO[]>();
  for (const change of data.releaseScheduleHistory) {
    historyByRelease.set(change.releaseId, [...(historyByRelease.get(change.releaseId) ?? []), change]);
  }

  const rows: Row[] = data.releases
    .filter((r) => r.currentDate >= data.from && r.currentDate <= data.to)
    .filter((r) => !team || r.teams.includes(team))
    .map((r) => {
      const changes = [...(historyByRelease.get(r.id) ?? [])].sort((a, b) => a.changedAt.localeCompare(b.changedAt));
      const originalDate = changes[0]?.previousDate ?? r.currentDate;
      return {
        release: r,
        originalDate,
        slipDays: diffDays(originalDate, r.currentDate),
        releasedOn: r.releasedAt ? todayInTehran(new Date(r.releasedAt)) : null,
        moves: changes.length,
        reasons: changes.map((c) => c.reason).filter((reason): reason is string => Boolean(reason)),
      };
    });

  const released = rows.filter((x) => x.release.status === "released");
  const moved = rows.filter((x) => x.moves > 0);
  const brief = (x: Row) => ({ ...releaseRow(x.release), originalDate: x.originalDate, slipDays: x.slipDays });

  const teams: Record<string, { total: number; released: number; open: number; overdue: number; moved: number; cancelled: number }> = {};
  for (const x of rows) {
    for (const t of x.release.teams) {
      const s = (teams[t] ??= { total: 0, released: 0, open: 0, overdue: 0, moved: 0, cancelled: 0 });
      s.total++;
      if (x.release.status === "released") s.released++;
      if (x.release.status === "cancelled") s.cancelled++;
      if (isOpen(x.release)) s.open++;
      if (x.release.isOverdue) s.overdue++;
      if (x.moves > 0) s.moved++;
    }
  }

  const sprints = data.sprints
    .filter((s) => s.endDate >= data.from && s.startDate <= data.to)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((s) => {
      const inSprint = rows.filter((x) => x.release.currentDate >= s.startDate && x.release.currentDate <= s.endDate);
      return {
        sprint: s.number,
        name: s.name,
        start: s.startDate,
        end: s.endDate,
        total: inSprint.length,
        released: inSprint.filter((x) => x.release.status === "released").length,
        open: inSprint.filter((x) => isOpen(x.release)).length,
        cancelled: inSprint.filter((x) => x.release.status === "cancelled").length,
        overdue: inSprint.filter((x) => x.release.isOverdue).length,
      };
    });

  return {
    range: { from: data.from, to: data.to, today, team: team ?? "all" },
    totals: {
      releases: rows.length,
      byStatus: countBy(rows, (x) => x.release.status),
      byType: countBy(rows, (x) => x.release.type),
      overdue: rows.filter((x) => x.release.isOverdue).length,
    },
    schedule: {
      moved: moved.length,
      movedShare: rows.length ? Math.round((moved.length / rows.length) * 100) / 100 : null,
      totalMoves: rows.reduce((n, x) => n + x.moves, 0),
      avgSlipDaysOfMoved: average(moved.map((x) => x.slipDays)),
      maxSlipDays: moved.length ? Math.max(...moved.map((x) => x.slipDays)) : null,
      mostSlipped: [...moved]
        .sort((a, b) => b.slipDays - a.slipDays)
        .slice(0, 5)
        .map((x) => ({ ...brief(x), reasons: x.reasons })),
    },
    delivery: {
      released: released.length,
      onTimeVsOriginalPlan: released.filter((x) => x.releasedOn! <= x.originalDate).length,
      onTimeVsFinalPlan: released.filter((x) => x.releasedOn! <= x.release.currentDate).length,
      avgDaysLateVsOriginalPlan: average(released.map((x) => Math.max(0, diffDays(x.originalDate, x.releasedOn!)))),
    },
    teams,
    sprints,
    overdue: rows
      .filter((x) => x.release.isOverdue)
      .map((x) => ({ ...brief(x), daysOverdue: diffDays(x.release.currentDate, today) })),
    upcoming14Days: rows
      .filter((x) => isOpen(x.release) && x.release.currentDate >= today && x.release.currentDate <= addDays(today, 14))
      .sort((a, b) => a.release.currentDate.localeCompare(b.release.currentDate))
      .map(brief),
  };
}
