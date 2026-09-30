"use client";

import { useCallback, useEffect, useState } from "react";
import { formatJalali, formatTimestamp } from "@/lib/dates";
import { RELEASE_STATUSES, RELEASE_TYPE_LABELS, STATUS_LABELS, TEAM_LABELS, TEAMS } from "@/lib/domain";
import type { ReleaseDTO } from "@/lib/calendar/types";
import { api } from "./api";
import { ReleaseActions, ReleaseDialogHost, StatusPill, type ReleaseDialog } from "./ReleaseDialogs";
import { DateDual, TeamChips } from "./ui";

interface Filters {
  q: string;
  status: string;
  team: string;
  from: string;
  to: string;
  needsUpdate: boolean;
  hidden: boolean;
}

const EMPTY_FILTERS: Filters = { q: "", status: "", team: "", from: "", to: "", needsUpdate: false, hidden: false };

export function ReleaseManager() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [releases, setReleases] = useState<ReleaseDTO[] | null>(null);
  const [overdueCount, setOverdueCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ReleaseDialog | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.status) params.set("status", filters.status);
    if (filters.team) params.set("team", filters.team);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.needsUpdate) params.set("needsUpdate", "true");
    if (filters.hidden) params.set("hidden", "true");
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.all([api<ReleaseDTO[]>(`/api/releases?${params}`), api<ReleaseDTO[]>(`/api/releases?needsUpdate=true`)])
        .then(([list, overdue]) => {
          if (cancelled) return;
          setReleases(list);
          setOverdueCount(overdue.length);
          setError(null);
        })
        .catch((e: Error) => !cancelled && setError(e.message));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters, reloadKey]);

  const close = useCallback(() => setDialog(null), []);
  const done = useCallback(() => {
    setDialog(null);
    setReloadKey((k) => k + 1);
  }, []);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h1>Release Management</h1>
          <p>Create, schedule and move releases. Every move is kept in the release’s schedule history.</p>
        </div>
        <button className="btn primary" onClick={() => setDialog({ kind: "create" })}>
          + New Release
        </button>
      </div>

      {overdueCount > 0 && !filters.needsUpdate && (
        <div className="notice info">
          {overdueCount} release{overdueCount > 1 ? "s are" : " is"} past {overdueCount > 1 ? "their" : "its"} date
          but still open. Mark as released, move or cancel them so the calendar stays accurate.{" "}
          <button className="btn link" onClick={() => set("needsUpdate", true)}>
            Show them
          </button>
        </div>
      )}

      <div className="filters">
        <label>
          Search
          <input className="input" value={filters.q} placeholder="Release title" onChange={(e) => set("q", e.target.value)} />
        </label>
        <label>
          Status
          <select className="select" value={filters.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">All</option>
            {RELEASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Team
          <select className="select" value={filters.team} onChange={(e) => set("team", e.target.value)}>
            <option value="">All</option>
            {TEAMS.map((t) => (
              <option key={t} value={t}>
                {TEAM_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input className="input" type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} />
        </label>
        <label>
          To
          <input className="input" type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.needsUpdate} onChange={(e) => set("needsUpdate", e.target.checked)} />
          Needs update (overdue)
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.hidden} onChange={(e) => set("hidden", e.target.checked)} />
          Hidden only
        </label>
        {JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS) && (
          <button className="btn small" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear
          </button>
        )}
      </div>

      {error && <div className="notice error">{error}</div>}

      {releases === null && !error ? (
        <div className="empty">Loading releases…</div>
      ) : releases && releases.length === 0 ? (
        <div className="empty">No releases match these filters.</div>
      ) : (
        releases && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Release</th>
                  <th>Teams</th>
                  <th>Current date</th>
                  <th>Status</th>
                  <th>Last schedule change</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {releases.map((r) => (
                  <tr key={r.id} className={r.status === "cancelled" ? "muted" : undefined} data-testid="release-row">
                    <td>
                      <div className="title">{r.title}</div>
                      <div className="sub">
                        {RELEASE_TYPE_LABELS[r.type]}
                        {r.dueBefore ? " · due before date" : ""}
                      </div>
                    </td>
                    <td>
                      <TeamChips teams={r.teams} />
                    </td>
                    <td>
                      <DateDual value={r.currentDate} />
                    </td>
                    <td>
                      <StatusPill release={r} />
                      {r.releasedAt && <div className="sub">Released {formatTimestamp(r.releasedAt)}</div>}
                    </td>
                    <td>
                      {r.lastScheduleChange ? (
                        <>
                          <div>Moved from {formatJalali(r.lastScheduleChange.previousDate)}</div>
                          <div className="sub">
                            {r.scheduleChangeCount} move{r.scheduleChangeCount > 1 ? "s" : ""} ·{" "}
                            {formatTimestamp(r.lastScheduleChange.changedAt)}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <ReleaseActions release={r} onAction={(kind) => setDialog({ kind, release: r })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <ReleaseDialogHost dialog={dialog} onChange={setDialog} onClose={close} onDone={done} />
    </div>
  );
}
