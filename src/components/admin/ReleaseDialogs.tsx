"use client";

import { useEffect, useState } from "react";
import { formatJalali, formatTimestamp, todayInTehran } from "@/lib/dates";
import {
  EDITABLE_STATUSES,
  RELEASE_TYPE_LABELS,
  RELEASE_TYPES,
  STATUS_LABELS,
  type ReleaseStatus,
  type ReleaseType,
  type Team,
} from "@/lib/domain";
import type { ReleaseDTO, ScheduleChangeDTO } from "@/lib/calendar/types";
import { api } from "./api";
import { DateField, DatePreview, ErrorNotice, Modal, TeamChips, TeamPicker } from "./ui";

/**
 * Release dialogs shared by the Releases table and the Back Office calendar.
 * `ReleaseDialogHost` renders whichever one `dialog` asks for.
 */

export type ReleaseDialog =
  | { kind: "create"; date?: string }
  | { kind: "edit"; release: ReleaseDTO }
  | { kind: "move"; release: ReleaseDTO; newDate?: string }
  | { kind: "release"; release: ReleaseDTO }
  | { kind: "cancel"; release: ReleaseDTO }
  | { kind: "reopen"; release: ReleaseDTO }
  | { kind: "hide"; release: ReleaseDTO }
  | { kind: "unhide"; release: ReleaseDTO }
  | { kind: "history"; release: ReleaseDTO };

export type ReleaseAction = Exclude<ReleaseDialog["kind"], "create">;

export const isOpen = (r: ReleaseDTO) => r.status !== "released" && r.status !== "cancelled";

export function StatusPill({ release }: { release: ReleaseDTO }) {
  return (
    <>
      <span className={`pill ${release.status}`}>{STATUS_LABELS[release.status]}</span>{" "}
      {release.isOverdue && <span className="pill overdue">Overdue</span>}
    </>
  );
}

/** Buttons for every action allowed on a release in its current status. */
export function ReleaseActions({
  release,
  onAction,
  includeHistory = true,
}: {
  release: ReleaseDTO;
  onAction: (kind: ReleaseAction) => void;
  includeHistory?: boolean;
}) {
  return (
    <div className="actions">
      <button className="btn small" onClick={() => onAction("edit")}>
        Edit
      </button>
      {isOpen(release) && (
        <>
          <button className="btn small" onClick={() => onAction("move")}>
            Move
          </button>
          <button className="btn small" onClick={() => onAction("release")}>
            Mark Released
          </button>
          <button className="btn small danger" onClick={() => onAction("cancel")}>
            Cancel
          </button>
        </>
      )}
      {!isOpen(release) && (
        <button className="btn small" onClick={() => onAction("reopen")}>
          Reopen
        </button>
      )}
      {includeHistory && (
        <button className="btn small" onClick={() => onAction("history")}>
          History
        </button>
      )}
      {release.hiddenAt ? (
        <button className="btn small" onClick={() => onAction("unhide")}>
          Unhide
        </button>
      ) : (
        <button className="btn small danger" onClick={() => onAction("hide")}>
          Hide
        </button>
      )}
    </div>
  );
}

/**
 * Renders the dialog for `dialog`. `onChange` switches to another dialog (e.g. from the
 * details view to Move); `onDone` runs after a successful change so the caller can reload.
 */
export function ReleaseDialogHost({
  dialog,
  onChange,
  onClose,
  onDone,
}: {
  dialog: ReleaseDialog | null;
  onChange: (dialog: ReleaseDialog) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  if (!dialog) return null;
  switch (dialog.kind) {
    case "create":
      return <ReleaseForm initialDate={dialog.date} onClose={onClose} onDone={onDone} />;
    case "edit":
      return <ReleaseForm release={dialog.release} onClose={onClose} onDone={onDone} />;
    case "move":
      return <MoveDialog release={dialog.release} initialDate={dialog.newDate} onClose={onClose} onDone={onDone} />;
    case "release":
      return <MarkReleasedDialog release={dialog.release} onClose={onClose} onDone={onDone} />;
    case "cancel":
      return (
        <ConfirmDialog
          release={dialog.release}
          title="Cancel release"
          text="The release stays in the list and on the calendar as Cancelled. Its schedule history is kept. You can reopen it later."
          action="Cancel release"
          path="cancel"
          onClose={onClose}
          onDone={onDone}
        />
      );
    case "reopen":
      return (
        <ConfirmDialog
          release={dialog.release}
          title="Reopen release"
          text="Sets the status back to Planned and clears the released/cancelled time. Use this to correct a mistake."
          action="Reopen"
          path="reopen"
          onClose={onClose}
          onDone={onDone}
        />
      );
    case "hide":
      return (
        <ConfirmDialog
          release={dialog.release}
          title="Hide release"
          text="The card disappears from the calendar, the Executive Summary and the release list, including its faded Moved cards. Nothing is deleted: the release and its schedule history stay in the database, and you can bring it back from the Hidden filter."
          action="Hide"
          path="visibility"
          body={{ hidden: true }}
          onClose={onClose}
          onDone={onDone}
        />
      );
    case "unhide":
      return (
        <ConfirmDialog
          release={dialog.release}
          title="Unhide release"
          text="The release shows on the calendar and in the release list again, exactly as before it was hidden."
          action="Unhide"
          path="visibility"
          body={{ hidden: false }}
          onClose={onClose}
          onDone={onDone}
        />
      );
    case "history":
      return (
        <HistoryDialog
          release={dialog.release}
          onClose={onClose}
          onAction={(kind) => onChange({ kind, release: dialog.release } as ReleaseDialog)}
        />
      );
  }
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

function ReleaseForm({
  release,
  initialDate,
  onClose,
  onDone,
}: DialogProps & { release?: ReleaseDTO; initialDate?: string }) {
  const [title, setTitle] = useState(release?.title ?? "");
  const [description, setDescription] = useState(release?.description ?? "");
  const [type, setType] = useState<ReleaseType>(release?.type ?? "feature");
  const [teams, setTeams] = useState<Team[]>(release?.teams ?? []);
  const [date, setDate] = useState(release?.currentDate ?? initialDate ?? "");
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

function MoveDialog({
  release,
  initialDate,
  onClose,
  onDone,
}: DialogProps & { release: ReleaseDTO; initialDate?: string }) {
  const [newDate, setNewDate] = useState(initialDate ?? "");
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
  body,
  onClose,
  onDone,
}: DialogProps & {
  release: ReleaseDTO;
  title: string;
  text: string;
  action: string;
  path: "cancel" | "reopen" | "visibility";
  body?: unknown;
}) {
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
            className={`btn ${path === "cancel" || action === "Hide" ? "danger" : "primary"}`}
            disabled={busy}
            onClick={() => run(() => api(`/api/releases/${release.id}/${path}`, { method: "POST", body }))}
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

/** Release details and schedule history. With `onAction`, the footer also offers the release's actions. */
function HistoryDialog({
  release,
  onClose,
  onAction,
}: {
  release: ReleaseDTO;
  onClose: () => void;
  onAction?: (kind: ReleaseAction) => void;
}) {
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
        <>
          {onAction && <ReleaseActions release={release} onAction={onAction} includeHistory={false} />}
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </>
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
        <dt>Type</dt>
        <dd>
          {RELEASE_TYPE_LABELS[release.type]}
          {release.dueBefore ? " · due before date" : ""}
        </dd>
        {release.description && (
          <>
            <dt>Description</dt>
            <dd style={{ whiteSpace: "pre-wrap" }}>{release.description}</dd>
          </>
        )}
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
