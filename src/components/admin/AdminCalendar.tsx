"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import {
  addDays,
  diffDays,
  formatGregorianShort,
  formatJalali,
  isWeekend,
  todayInTehran,
  weekdayName,
  type IsoDate,
} from "@/lib/dates";
import { cardTone, STATUS_LABELS, TEAM_LABELS } from "@/lib/domain";
import { movedItems, type MovedItem } from "@/lib/calendar/build";
import {
  buildMonthGrid,
  monthOf,
  monthSubtitle,
  monthTitle,
  orderedSpan,
  shiftMonth,
  WEEK_START,
  type GridWeek,
  type MonthMode,
} from "@/lib/calendar/month";
import type { CalendarData, CalendarEventDTO, HolidayDTO, ReleaseDTO, SprintDTO } from "@/lib/calendar/types";
import { api } from "./api";
import { EVENT_FORM, HOLIDAY_FORM, SPRINT_FORM } from "./PlanningAdmin";
import { RecordForm, toPayload } from "./RecordManager";
import { isOpen, ReleaseDialogHost, type ReleaseDialog } from "./ReleaseDialogs";
import { Modal } from "./ui";

/**
 * Back Office calendar: a month grid where every item can be opened and edited in place.
 * Click (or drag across) empty days to add a release, event, sprint or holiday; drag a
 * release to another day to move it (with history), or drag an event to change its date.
 */

type RecordKind = "sprint" | "event" | "holiday";

type Dialog =
  | { kind: "add"; from: IsoDate; to: IsoDate }
  | { kind: "release"; dialog: ReleaseDialog }
  | { kind: "sprint"; row?: SprintDTO; initial: Record<string, string> }
  | { kind: "event"; row?: CalendarEventDTO; initial: Record<string, string> }
  | { kind: "holiday"; row?: HolidayDTO; initial: Record<string, string> };

type Dragged = { kind: "release"; release: ReleaseDTO } | { kind: "event"; event: CalendarEventDTO };

const FORMS = { sprint: SPRINT_FORM, event: EVENT_FORM, holiday: HOLIDAY_FORM } as const;

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekdayHeaders = Array.from({ length: 7 }, (_, i) => WEEKDAY_NAMES[(WEEK_START + i) % 7]);

const longDate = (date: IsoDate) => `${weekdayName(date)}, ${formatJalali(date, { withYear: true })} · ${formatGregorianShort(date, { withYear: true })}`;
const spanLabel = (from: IsoDate, to: IsoDate) =>
  from === to ? longDate(from) : `${formatJalali(from)} – ${formatJalali(to, { withYear: true })} · ${diffDays(from, to) + 1} days`;

function groupBy<T>(values: T[], key: (value: T) => IsoDate): Map<IsoDate, T[]> {
  const map = new Map<IsoDate, T[]>();
  for (const value of values) map.set(key(value), [...(map.get(key(value)) ?? []), value]);
  return map;
}

export function AdminCalendar({ initialDate, initialMode }: { initialDate?: IsoDate; initialMode?: MonthMode }) {
  const [mode, setMode] = useState<MonthMode>(initialMode ?? "jalali");
  const [anchor, setAnchor] = useState<IsoDate>(initialDate ?? todayInTehran());
  const [showMoved, setShowMoved] = useState(false);
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [selection, setSelection] = useState<{ start: IsoDate; end: IsoDate } | null>(null);
  const [dropDate, setDropDate] = useState<IsoDate | null>(null);
  const dragged = useRef<Dragged | null>(null);

  const month = useMemo(() => monthOf(anchor, mode), [anchor, mode]);
  const range = useMemo(() => buildMonthGrid(month, mode), [month, mode]);
  const today = data?.today ?? todayInTehran();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<CalendarData>(`/api/release-calendar?from=${range.from}&to=${range.to}`)
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, reloadKey]);

  // Keep the month and mode in the URL so a reload lands on the same view.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("date", month.start);
    url.searchParams.set("mode", mode);
    window.history.replaceState(null, "", url);
  }, [month.start, mode]);

  const grid = useMemo(() => buildMonthGrid(month, mode, data?.sprints ?? []), [month, mode, data]);
  const index = useMemo(() => {
    const current = data && data.from === range.from && data.to === range.to ? data : null;
    return {
      releases: groupBy(current?.releases ?? [], (r) => r.currentDate),
      moved: groupBy(current ? movedItems(current.releases, current.releaseScheduleHistory) : [], (m) => m.previousDate),
      events: groupBy(current?.events ?? [], (e) => e.date),
      holidays: groupBy(current?.holidays ?? [], (h) => h.date),
    };
  }, [data, range.from, range.to]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const close = useCallback(() => setDialog(null), []);
  const done = useCallback(() => {
    setDialog(null);
    reload();
  }, [reload]);

  // --- Creating ---------------------------------------------------------------

  const nextSprint = (start: IsoDate, end?: IsoDate) => {
    const sprints = data?.sprints ?? [];
    const last = [...sprints].sort((a, b) => a.startDate.localeCompare(b.startDate)).at(-1);
    const length = last ? diffDays(last.startDate, last.endDate) : 13;
    return {
      ...SPRINT_FORM.emptyForm,
      number: last ? String(last.number + 1) : "",
      startDate: start,
      endDate: end && end !== start ? end : addDays(start, length),
    };
  };

  const startCreate = (kind: "release" | RecordKind, from: IsoDate, to: IsoDate) => {
    if (kind === "release") setDialog({ kind: "release", dialog: { kind: "create", date: from } });
    else if (kind === "sprint") setDialog({ kind: "sprint", initial: nextSprint(from, to) });
    else if (kind === "event") setDialog({ kind: "event", initial: { ...EVENT_FORM.emptyForm, date: from } });
    else setDialog({ kind: "holiday", initial: { ...HOLIDAY_FORM.emptyForm, date: from } });
  };

  // --- Selecting days: click one, or press and drag across several ------------

  const dateAt = (week: GridWeek, e: { clientX: number; currentTarget: HTMLElement }): IsoDate => {
    const rect = e.currentTarget.getBoundingClientRect();
    const col = Math.min(6, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * 7)));
    return week.days[col].date;
  };

  const onMouseDown = (week: GridWeek) => (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, a, [draggable='true']")) return;
    e.preventDefault();
    const date = dateAt(week, e);
    setSelection({ start: date, end: date });
  };

  const onMouseMove = (week: GridWeek) => (e: MouseEvent<HTMLDivElement>) => {
    if (!selection) return;
    const date = dateAt(week, e);
    if (date !== selection.end) setSelection({ ...selection, end: date });
  };

  useEffect(() => {
    if (!selection) return;
    const finish = () => {
      const [from, to] = orderedSpan(selection.start, selection.end);
      setSelection(null);
      setDialog({ kind: "add", from, to });
    };
    window.addEventListener("mouseup", finish);
    return () => window.removeEventListener("mouseup", finish);
  }, [selection]);

  const isSelected = (date: IsoDate) => {
    if (!selection) return false;
    const [from, to] = orderedSpan(selection.start, selection.end);
    return date >= from && date <= to;
  };

  // --- Dragging releases and events to another day ------------------------------

  const startDrag = (item: Dragged) => (e: DragEvent<HTMLElement>) => {
    dragged.current = item;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.kind === "release" ? item.release.title : item.event.title);
  };
  const endDrag = () => {
    dragged.current = null;
    setDropDate(null);
  };

  const onDragOver = (week: GridWeek) => (e: DragEvent<HTMLDivElement>) => {
    if (!dragged.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const date = dateAt(week, e);
    if (date !== dropDate) setDropDate(date);
  };

  const onDrop = (week: GridWeek) => async (e: DragEvent<HTMLDivElement>) => {
    const item = dragged.current;
    if (!item) return;
    e.preventDefault();
    const date = dateAt(week, e);
    endDrag();
    if (item.kind === "release") {
      if (date !== item.release.currentDate) {
        setDialog({ kind: "release", dialog: { kind: "move", release: item.release, newDate: date } });
      }
      return;
    }
    if (date === item.event.date) return;
    try {
      const body = toPayload(EVENT_FORM.fields, { ...EVENT_FORM.toForm(item.event), date });
      await api(`${EVENT_FORM.endpoint}/${item.event.id}`, { method: "PUT", body });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move the event");
    }
  };

  // --- Rendering ------------------------------------------------------------------

  const openRelease = (release: ReleaseDTO) => setDialog({ kind: "release", dialog: { kind: "history", release } });

  return (
    <div className="panel admin-calendar">
      <div className="panel-head cal-toolbar">
        <div className="cal-nav">
          <button className="btn small" onClick={() => setAnchor(today)}>
            Today
          </button>
          <button className="btn small arrow" aria-label="Previous month" onClick={() => setAnchor(shiftMonth(anchor, mode, -1).start)}>
            ‹
          </button>
          <button className="btn small arrow" aria-label="Next month" onClick={() => setAnchor(shiftMonth(anchor, mode, 1).start)}>
            ›
          </button>
          <div className="cal-title">
            <h1>{monthTitle(month, mode)}</h1>
            <p>
              {monthSubtitle(month, mode)}
              {loading && data ? " · Updating…" : ""}
            </p>
          </div>
        </div>
        <div className="cal-controls">
          <label className="check">
            <input type="checkbox" checked={showMoved} onChange={(e) => setShowMoved(e.target.checked)} />
            Show moved history
          </label>
          <div className="segmented" role="group" aria-label="Calendar">
            {(["jalali", "gregorian"] as const).map((m) => (
              <button
                key={m}
                className={m === mode ? "active" : undefined}
                aria-pressed={m === mode}
                onClick={() => {
                  setMode(m);
                  setAnchor(month.start);
                }}
              >
                {m === "jalali" ? "Jalali" : "Gregorian"}
              </button>
            ))}
          </div>
          <button className="btn primary" onClick={() => setDialog({ kind: "add", from: today, to: today })}>
            + Create
          </button>
        </div>
      </div>

      <p className="cal-hint">
        Click a day (or drag across several) to add a release, event, sprint or holiday. Click anything to open it. Drag a
        release to another day to move it; drag an event to change its date.
      </p>

      {error && (
        <div className="notice error" role="alert">
          {error}{" "}
          <button className="btn link" onClick={reload}>
            Retry
          </button>
        </div>
      )}

      <div className="cal-grid" aria-busy={loading}>
        <div className="cal-weekdays">
          {weekdayHeaders.map((d) => (
            <div key={d} className={d === "Fri" || d === "Sat" ? "weekend" : undefined}>
              {d}
            </div>
          ))}
        </div>
        {grid.weeks.map((week) => (
          <div
            key={week.days[0].date}
            className="cal-week"
            onMouseDown={onMouseDown(week)}
            onMouseMove={onMouseMove(week)}
            onDragOver={onDragOver(week)}
            onDrop={onDrop(week)}
          >
            {week.days.map((day, i) => {
              const holidays = index.holidays.get(day.date) ?? [];
              const classes = ["cal-cell"];
              if (!day.inMonth) classes.push("outside");
              if (isWeekend(day.date)) classes.push("weekend");
              if (holidays.length) classes.push("holiday");
              if (day.date === today) classes.push("today");
              if (isSelected(day.date)) classes.push("selected");
              if (dropDate === day.date) classes.push("drop-target");
              return <div key={day.date} className={classes.join(" ")} style={{ gridColumn: i + 1 }} data-date={day.date} />;
            })}

            {week.days.map((day, i) => (
              <div key={day.date} className={`cal-day-head${day.inMonth ? "" : " outside"}`} style={{ gridColumn: i + 1 }}>
                <span className={`cal-num${day.date === today ? " today" : ""}`}>{day.primary}</span>
                <span className="cal-sub">{day.secondary}</span>
                <button
                  className="cal-add"
                  aria-label={`Add on ${longDate(day.date)}`}
                  title="Add"
                  onClick={() => setDialog({ kind: "add", from: day.date, to: day.date })}
                >
                  +
                </button>
              </div>
            ))}

            {week.sprints.map((seg) => (
              <button
                key={seg.sprint.id}
                className={`cal-sprint${seg.startsHere ? " starts" : ""}${seg.endsHere ? " ends" : ""}`}
                style={{ gridColumn: `${seg.startCol} / ${seg.endCol + 1}` }}
                title={`Sprint ${seg.sprint.number}: ${formatJalali(seg.sprint.startDate)} – ${formatJalali(seg.sprint.endDate)}`}
                onClick={() => setDialog({ kind: "sprint", row: seg.sprint, initial: SPRINT_FORM.toForm(seg.sprint) })}
              >
                Sprint {seg.sprint.number}
                {seg.sprint.name ? ` · ${seg.sprint.name}` : ""}
              </button>
            ))}

            {week.days.map((day, i) => {
              const holidays = index.holidays.get(day.date) ?? [];
              const events = index.events.get(day.date) ?? [];
              const releases = index.releases.get(day.date) ?? [];
              const moved = showMoved ? (index.moved.get(day.date) ?? []) : [];
              return (
                <div key={day.date} className="cal-day-body" style={{ gridColumn: i + 1 }}>
                  {holidays.map((h) => (
                    <button
                      key={h.id}
                      className="cal-chip holiday"
                      title={`Iran official holiday — ${h.name}`}
                      onClick={() => setDialog({ kind: "holiday", row: h, initial: HOLIDAY_FORM.toForm(h) })}
                    >
                      {h.name}
                    </button>
                  ))}
                  {events.map((ev) => (
                    <button
                      key={ev.id}
                      className="cal-chip event"
                      draggable
                      onDragStart={startDrag({ kind: "event", event: ev })}
                      onDragEnd={endDrag}
                      title={ev.description ? `${ev.title} — ${ev.description}` : ev.title}
                      onClick={() => setDialog({ kind: "event", row: ev, initial: EVENT_FORM.toForm(ev) })}
                    >
                      {ev.title}
                    </button>
                  ))}
                  {releases.map((r) => (
                    <ReleaseChip
                      key={r.id}
                      release={r}
                      onOpen={() => openRelease(r)}
                      onDragStart={startDrag({ kind: "release", release: r })}
                      onDragEnd={endDrag}
                    />
                  ))}
                  {moved.map((m) => (
                    <MovedChip key={m.key} item={m} onOpen={() => openRelease(m.release)} />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {dialog?.kind === "add" && (
        <AddDialog from={dialog.from} to={dialog.to} onPick={(kind) => startCreate(kind, dialog.from, dialog.to)} onClose={close} />
      )}
      {dialog?.kind === "release" && (
        <ReleaseDialogHost
          dialog={dialog.dialog}
          onChange={(next) => setDialog({ kind: "release", dialog: next })}
          onClose={close}
          onDone={done}
        />
      )}
      {(dialog?.kind === "sprint" || dialog?.kind === "event" || dialog?.kind === "holiday") && (
        <RecordDialog key={`${dialog.kind}:${dialog.row?.id ?? "new"}`} dialog={dialog} onClose={close} onDone={done} />
      )}
    </div>
  );
}

function ReleaseChip({
  release,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  release: ReleaseDTO;
  onOpen: () => void;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const classes = ["cal-chip", "release", cardTone(release.teams), release.status];
  if (release.isOverdue) classes.push("overdue");
  const teams = release.teams.map((t) => TEAM_LABELS[t]).join(", ");
  const status = release.isOverdue ? "Overdue" : STATUS_LABELS[release.status];
  return (
    <button
      className={classes.join(" ")}
      draggable={isOpen(release)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      title={`${release.title}\n${teams} · ${status}${release.dueBefore ? " · due before" : ""}`}
      data-testid="calendar-release"
    >
      {release.status === "released" && <span className="mark" aria-label="Released">✓</span>}
      {release.isOverdue && <span className="mark" aria-label="Overdue">!</span>}
      {release.dueBefore && <span className="before">Before</span>}
      <span className="label">{release.title}</span>
    </button>
  );
}

function MovedChip({ item, onOpen }: { item: MovedItem; onOpen: () => void }) {
  return (
    <button
      className={`cal-chip release moved ${cardTone(item.release.teams)}`}
      onClick={onOpen}
      title={`Moved to ${formatJalali(item.currentDate)}${item.change.reason ? ` — ${item.change.reason}` : ""}`}
    >
      <span className="label">
        {item.release.title} → {formatJalali(item.currentDate)}
      </span>
    </button>
  );
}

const ADD_OPTIONS: { kind: "release" | RecordKind; label: string; text: string }[] = [
  { kind: "release", label: "Release", text: "Schedule a release on this day." },
  { kind: "event", label: "Event", text: "Company event or milestone." },
  { kind: "sprint", label: "Sprint", text: "A sprint starting here (drag across days to set its length)." },
  { kind: "holiday", label: "Holiday", text: "Iran official holiday." },
];

function AddDialog({
  from,
  to,
  onPick,
  onClose,
}: {
  from: IsoDate;
  to: IsoDate;
  onPick: (kind: "release" | RecordKind) => void;
  onClose: () => void;
}) {
  const isRange = from !== to;
  // Dragging across several days usually means a sprint, so offer it first.
  const options = isRange ? [...ADD_OPTIONS.filter((o) => o.kind === "sprint"), ...ADD_OPTIONS.filter((o) => o.kind !== "sprint")] : ADD_OPTIONS;
  return (
    <Modal
      title="Add to calendar"
      subtitle={spanLabel(from, to)}
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
      }
    >
      <div className="add-options">
        {options.map((o) => (
          <button key={o.kind} className={`add-option ${o.kind}`} onClick={() => onPick(o.kind)}>
            <strong>{o.label}</strong>
            <span>{o.text}</span>
          </button>
        ))}
      </div>
      {isRange && <p className="hint">A sprint covers the selected days; the others are added on the first day.</p>}
    </Modal>
  );
}

function RecordDialog({
  dialog,
  onClose,
  onDone,
}: {
  dialog: Extract<Dialog, { kind: RecordKind }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const form = FORMS[dialog.kind];
  const row = dialog.row;
  return (
    <RecordForm
      title={`${row ? "Edit" : "New"} ${form.singular.toLowerCase()}`}
      subtitle={row ? "Deactivate hides it from the calendar; it can be restored from its list page." : undefined}
      fields={form.fields}
      initial={dialog.initial}
      onClose={onClose}
      onSubmit={async (values) => {
        const body = toPayload(form.fields, values);
        if (row) await api(`${form.endpoint}/${row.id}`, { method: "PUT", body });
        else await api(form.endpoint, { method: "POST", body });
        onDone();
      }}
      onArchive={
        row
          ? async () => {
              await api(`${form.endpoint}/${row.id}`, { method: "PATCH", body: { archived: true } });
              onDone();
            }
          : undefined
      }
    />
  );
}
