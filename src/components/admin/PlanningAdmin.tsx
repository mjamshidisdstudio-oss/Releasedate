"use client";

import { EVENT_TYPE_LABELS, EVENT_TYPES } from "@/lib/domain";
import type { CalendarEventDTO, HolidayDTO, SprintDTO } from "@/lib/calendar/types";
import { RecordManager, type FieldDef } from "./RecordManager";
import { DateDual } from "./ui";

const archivedPill = (row: { archivedAt: string | null }) =>
  row.archivedAt ? <span className="pill archived">Inactive</span> : <span className="pill released">Active</span>;

/** Form definitions, shared by the list screens below and the Back Office calendar. */
export const SPRINT_FORM = {
  endpoint: "/api/sprints",
  singular: "Sprint",
  fields: [
    { name: "number", label: "Sprint number", kind: "number" },
    { name: "name", label: "Name", kind: "text", optional: true },
    { name: "startDate", label: "Start date", kind: "date" },
    { name: "endDate", label: "End date", kind: "date" },
  ] satisfies FieldDef[],
  toForm: (s: SprintDTO) => ({ number: String(s.number), name: s.name ?? "", startDate: s.startDate, endDate: s.endDate }),
  emptyForm: { number: "", name: "", startDate: "", endDate: "" },
};

export const EVENT_FORM = {
  endpoint: "/api/events",
  singular: "Event",
  fields: [
    { name: "title", label: "Title", kind: "text" },
    { name: "date", label: "Date", kind: "date" },
    { name: "type", label: "Type", kind: "select", options: EVENT_TYPES.map((t) => ({ value: t, label: EVENT_TYPE_LABELS[t] })) },
    { name: "description", label: "Description", kind: "textarea", optional: true },
  ] satisfies FieldDef[],
  toForm: (e: CalendarEventDTO) => ({ title: e.title, date: e.date, type: e.type, description: e.description ?? "" }),
  emptyForm: { title: "", date: "", type: "company_event", description: "" },
};

export const HOLIDAY_FORM = {
  endpoint: "/api/holidays",
  singular: "Holiday",
  fields: [
    { name: "name", label: "Name", kind: "text" },
    { name: "date", label: "Date", kind: "date" },
  ] satisfies FieldDef[],
  toForm: (h: HolidayDTO) => ({ name: h.name, date: h.date }),
  emptyForm: { name: "", date: "" },
};

export function SprintsAdmin() {
  return (
    <RecordManager<SprintDTO>
      title="Sprints"
      description="Sprint transition markers on the calendar are generated from each sprint’s start date."
      {...SPRINT_FORM}
      columns={[
        { label: "Sprint", render: (s) => <span className="title">Sprint {s.number}{s.name ? ` — ${s.name}` : ""}</span> },
        { label: "Start", render: (s) => <DateDual value={s.startDate} /> },
        { label: "End", render: (s) => <DateDual value={s.endDate} /> },
        { label: "State", render: archivedPill },
      ]}
    />
  );
}

export function EventsAdmin() {
  return (
    <RecordManager<CalendarEventDTO>
      title="Calendar Events"
      description="Company events and milestones. Shown with their own colour, separate from releases."
      {...EVENT_FORM}
      columns={[
        { label: "Event", render: (e) => <><div className="title">{e.title}</div>{e.description && <div className="sub">{e.description}</div>}</> },
        { label: "Date", render: (e) => <DateDual value={e.date} /> },
        { label: "Type", render: (e) => EVENT_TYPE_LABELS[e.type] },
        { label: "State", render: archivedPill },
      ]}
    />
  );
}

export function HolidaysAdmin() {
  return (
    <RecordManager<HolidayDTO>
      title="Iran Official Holidays"
      description="Marked separately from Friday/Saturday weekends. Lunar holidays move every year — add next year’s dates here."
      {...HOLIDAY_FORM}
      columns={[
        { label: "Holiday", render: (h) => <span className="title">{h.name}</span> },
        { label: "Date", render: (h) => <DateDual value={h.date} /> },
        { label: "State", render: archivedPill },
      ]}
    />
  );
}
