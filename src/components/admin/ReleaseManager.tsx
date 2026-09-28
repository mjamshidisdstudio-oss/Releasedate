"use client";

import { useCallback, useEffect, useState } from "react";
import { formatJalali, formatTimestamp, todayInTehran } from "@/lib/dates";
import {
  EDITABLE_STATUSES,
  RELEASE_STATUSES,
  RELEASE_TYPE_LABELS,
  RELEASE_TYPES,
  STATUS_LABELS,
  TEAM_LABELS,
  TEAMS,
  type ReleaseStatus,
  type ReleaseType,
  type Team,
} from "@/lib/domain";
import type { ReleaseDTO, ScheduleChangeDTO } from "@/lib/calendar/types";
import { api } from "./api";
import { DateDual, DateField, DatePreview, ErrorNotice, Modal, TeamChips, TeamPicker } from "./ui";

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; release: ReleaseDTO }
  | { kind: "move"; release: ReleaseDTO }
  | { kind: "release"; release: ReleaseDTO }
  | { kind: "cancel"; release: ReleaseDTO }
  | { kind: "reopen"; release: ReleaseDTO }
  | { kind: "history"; release: ReleaseDTO };

interface Filters {
  q: string;
  status: string;
  team: string;
  from: string;
  to: string;
  needsUpdate: boolean;
}

const EMPTY_FILTERS: Filters = { q: "", status: "", team: "", from: "", to: "", needsUpdate: false };

const isOpen = (r: ReleaseDTO) => r.status !== "released" && r.status !== "cancelled";

function StatusPill({ release }: { release: ReleaseDTO }) {
  return (
    <>
      <span className={`pill ${release.status}`}>{STATUS_LABELS[release.status]}</span>{" "}
      {release.isOverdue && <span className="pill overdue">Overdue</span>}
    </>
  );
}

export function ReleaseManager() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [releases, setReleases] = useState<ReleaseDTO[] | null>(null);
  const [overdueCount, setOverdueCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.status) params.set("status", filters.status);
    if (filters.team) params.set("team", filters.team);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.needsUpdate) params.set("needsUpdate", "true");
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
                      <div className="actions">
                        <button className="btn small" onClick={() => setDialog({ kind: "edit", release: r })}>
                          Edit
                        </button>
                        {isOpen(r) && (
                          <>
                            <button className="btn small" onClick={() => setDialog({ kind: "move", release: r })}>
                              Move
                            </button>
                            <button className="btn small" onClick={() => setDialog({ kind: "release", release: r })}>
                              Mark Released
                            </button>
                            <button className="btn small danger" onClick={() => setDialog({ kind: "cancel", release: r })}>
                              Cancel
                            </button>
                          </>
                        )}
                        {!isOpen(r) && (
                          <button className="btn small" onClick={() => setDialog({ kind: "reopen", release: r })}>
                            Reopen
                          </button>
                        )}
                        <button className="btn small" onClick={() => setDialog({ kind: "history", release: r })}>
                          History
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {dialog?.kind === "create" && <ReleaseForm onClose={close} onDone={done} />}
      {dialog?.kind === "edit" && <ReleaseForm release={dialog.release} onClose={close} onDone={done} />}
      {dialog?.kind === "move" && <MoveDialog release={dialog.release} onClose={close} onDone={done} />}
      {dialog?.kind === "release" && <MarkReleasedDialog release={dialog.release} onClose={close} onDone={done} />}
      {dialog?.kind === "cancel" && (
        <ConfirmDialog
          release={dialog.release}
          title="Cancel release"
          text="The release stays in the list and on the calendar as Cancelled. Its schedule history is kept. You can reopen it later."
          action="Cancel release"
          path="cancel"
          onClose={close}
          onDone={done}
        />
      )}
      {dialog?.kind === "reopen" && (
        <ConfirmDialog
          release={dialog.release}
          title="Reopen release"
          text="Sets the status back to Planned and clears the released/cancelled time. Use this to correct a mistake."
          action="Reopen"
          path="reopen"
          onClose={close}
          onDone={done}
        />
      )}
      {dialog?.kind === "history" && <HistoryDialog release={dialog.release} onClose={close} />}
    </div>
  );
}

interface DialogProps {
  onClose: () => void;
  onDone: () => void;
}

function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

function ReleaseForm({ release, onClose, onDone }: DialogProps & { release?: ReleaseDTO }) {
  const [title, setTitle] = useState(release?.title ?? "");
  const [description, setDescription] = useState(release?.description ?? "");
  const [type, setType] = useState<ReleaseType>(release?.type ?? "feature");
  const [teams, setTeams] = useState<Team[]>(release?.teams ?? []);
  const [date, setDate] = useState(release?.currentDate ?? "");
  const [dueBefore, setDueBefore] = useState(release?.dueBefore ?? false);
  const [status, setStatus] = useState<ReleaseStatus>(release?.status ?? "planned");
  const { busy, error, setError, run } = useSubmit(onDone);
  const statusEditable = !release || isOpen(release);

  const submit = () => {
    if (!title.trim()) return setError("Title cannot be empty");
    if (teams.length === 0) return setError("Pick at least one team");
    if (!release && !date) return setError("Release date is required");
    const common = { title, description: description || null, type, teams, dueBefore };
    return run(() =>
      release
        ? api(`/api/releases/${release.id}`, {
            method: "PATCH",
            body: statusEditable ? { ...common, status } : common,
          })
        : api("/api/releases", { method: "POST", body: { ...common, releaseDate: date, status } }),
    );
  };

  return (
    <Modal
      title={release ? "Edit release" : "New release"}
      subtitle={release ? "To change the date, use Move so the change is recorded in history." : undefined}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" disabled={busy} onClick={submit}>
            {release ? "Save changes" : "Create release"}
          </button>
        </>
      }
    >
      <ErrorNotice message={error} />
      <label className="field">
        <span>Release title</span>
        <input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </label>
      {release ? (
        <div className="field">
          <span>Current date</span>
          <DatePreview value={release.currentDate} />
        </div>
      ) : (
        <DateField label="Release date" value={date} onChange={setDate} required />
      )}
      <TeamPicker value={teams} onChange={setTeams} />
      <div className="field-row">
        <label className="field">
          <span>Type</span>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as ReleaseType)}>
            {RELEASE_TYPES.map((t) => (
              <option key={t} value={t}>
                {RELEASE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          {statusEditable ? (
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as ReleaseStatus)}>
              {EDITABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          ) : (
            <span className="hint">{STATUS_LABELS[release!.status]} — use Reopen to change</span>
          )}
        </label>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={dueBefore} onChange={(e) => setDueBefore(e.target.checked)} />
        Deadline: due <em>before</em> this date (shows a “Before” badge)
      </label>
      <label className="field">
        <span>
          Description <span className="hint">(optional)</span>
        </span>
        <textarea className="textarea" value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />
      </label>
    </Modal>
  );
}

function MoveDialog({ release, onClose, onDone }: DialogProps & { release: ReleaseDTO }) {
  const [newDate, setNewDate] = useState("");
  const [reason, setReason] = useState("");
  const { busy, error, setError, run } = useSubmit(onDone);

  const submit = () => {
    if (!newDate) return setError("Pick the new date");
    if (newDate === release.currentDate) return setError("The new date is the same as the current date");
    return run(() => api(`/api/releases/${release.id}/move`, { method: "POST", body: { newDate, reason: reason || null } }));
  };

  return (
    <Modal
      title="Move release"
      subtitle="The current date is kept in history and stays visible on the calendar as a faded “Moved” card."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy} onClick={submit}>
            Move release
          </button>
        </>
      }
    >
      <ErrorNotice message={error} />
      <dl className="kv">
        <dt>Release</dt>
        <dd>{release.title}</dd>
        <dt>Current date</dt>
        <dd>
          <DatePreview value={release.currentDate} />
        </dd>
      </dl>
      <DateField label="New date" value={newDate} onChange={setNewDate} required />
      <label className="field">
        <span>
          Reason <span className="hint">(optional)</span>
        </span>
        <textarea className="textarea" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
      </label>
    </Modal>
  );
}

/** Value for <input type="datetime-local"> in the browser's local time. */
function localDateTimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function MarkReleasedDialog({ release, onClose, onDone }: DialogProps & { release: ReleaseDTO }) {
  const [when, setWhen] = useState(() => localDateTimeValue(new Date()));
  const { busy, error, setError, run } = useSubmit(onDone);
  const releasedDay = when ? todayInTehran(new Date(when)) : null;

  const submit = () => {
    const at = new Date(when);
    if (Number.isNaN(at.getTime())) return setError("Pick when it was released");
    return run(() => api(`/api/releases/${release.id}/release`, { method: "POST", body: { releasedAt: at.toISOString() } }));
  };

  return (
    <Modal
      title="Mark as released"
      subtitle="The scheduled date stays as is; the actual release time is stored separately."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy} onClick={submit}>
            Mark released
          </button>
        </>
      }
    >
      <ErrorNotice message={error} />
      <dl className="kv">
        <dt>Release</dt>
        <dd>{release.title}</dd>
        <dt>Scheduled</dt>
        <dd>
          <DatePreview value={release.currentDate} />
        </dd>
      </dl>
      <label className="field">
        <span>Actually released at</span>
        <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        {releasedDay && <DatePreview value={releasedDay} />}
      </label>
    </Modal>
  );
}

function ConfirmDialog({
  release,
  title,
  text,
  action,
  path,
  onClose,
  onDone,
}: DialogProps & { release: ReleaseDTO; title: string; text: string; action: string; path: "cancel" | "reopen" }) {
  const { busy, error, run } = useSubmit(onDone);
  return (
    <Modal
      title={title}
      subtitle={release.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Back
          </button>
          <button
            className={`btn ${path === "cancel" ? "danger" : "primary"}`}
            disabled={busy}
            onClick={() => run(() => api(`/api/releases/${release.id}/${path}`, { method: "POST" }))}
          >
            {action}
          </button>
        </>
      }
    >
      <ErrorNotice message={error} />
      <p style={{ margin: 0, fontSize: 14 }}>{text}</p>
    </Modal>
  );
}

function HistoryDialog({ release, onClose }: { release: ReleaseDTO; onClose: () => void }) {
  const [history, setHistory] = useState<ScheduleChangeDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ScheduleChangeDTO[]>(`/api/releases/${release.id}/history`)
      .then(setHistory)
      .catch((e: Error) => setError(e.message));
  }, [release.id]);

  return (
    <Modal
      title={release.title}
      subtitle="Release details and schedule history"
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <dl className="kv">
        <dt>Current date</dt>
        <dd>
          <DatePreview value={release.currentDate} />
        </dd>
        <dt>Status</dt>
        <dd>
          <StatusPill release={release} />
        </dd>
        <dt>Teams</dt>
        <dd>
          <TeamChips teams={release.teams} />
        </dd>
        {release.releasedAt && (
          <>
            <dt>Released at</dt>
            <dd>{formatTimestamp(release.releasedAt)}</dd>
          </>
        )}
        {release.cancelledAt && (
          <>
            <dt>Cancelled at</dt>
            <dd>{formatTimestamp(release.cancelledAt)}</dd>
          </>
        )}
        <dt>Created</dt>
        <dd>
          {formatTimestamp(release.createdAt)}
          {release.createdBy ? ` by ${release.createdBy}` : ""}
        </dd>
      </dl>
      <div className="field">
        <span>Schedule history (newest first)</span>
        <ErrorNotice message={error} />
        {history === null && !error && <span className="hint">Loading…</span>}
        {history?.length === 0 && <span className="hint">Never moved.</span>}
        {history && history.length > 0 && (
          <ol className="timeline">
            {[...history].reverse().map((h) => (
              <li key={h.id}>
                <div className="move">
                  {formatJalali(h.previousDate)} → {formatJalali(h.newDate)}
                </div>
                <div className="meta">
                  {h.previousDate} → {h.newDate} · Changed by {h.changedBy ?? "unknown"} · {formatTimestamp(h.changedAt)}
                </div>
                {h.reason && <div className="meta">Reason: {h.reason}</div>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  );
}
