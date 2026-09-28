"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { DateField, ErrorNotice, Modal } from "./ui";

/**
 * Small CRUD screen used for Sprints, Calendar Events and Holidays.
 * Records are archived (hidden from the calendar) instead of deleted.
 */

export type FieldDef =
  | { name: string; label: string; kind: "text" | "textarea"; optional?: boolean }
  | { name: string; label: string; kind: "number" }
  | { name: string; label: string; kind: "date" }
  | { name: string; label: string; kind: "select"; options: { value: string; label: string }[] };

export interface Column<T> {
  label: string;
  render: (row: T) => ReactNode;
}

interface Props<T extends { id: string; archivedAt: string | null }> {
  title: string;
  description: string;
  endpoint: string;
  singular: string;
  fields: FieldDef[];
  columns: Column<T>[];
  toForm: (row: T) => Record<string, string>;
  emptyForm: Record<string, string>;
}

function toPayload(fields: FieldDef[], form: Record<string, string>) {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const value = form[field.name] ?? "";
    if (field.kind === "number") payload[field.name] = value === "" ? undefined : Number(value);
    else if (field.kind === "text" || field.kind === "textarea") payload[field.name] = value === "" && field.optional ? null : value;
    else payload[field.name] = value;
  }
  return payload;
}

export function RecordManager<T extends { id: string; archivedAt: string | null }>(props: Props<T>) {
  const { title, description, endpoint, singular, fields, columns, toForm, emptyForm } = props;
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ row?: T } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    api<T[]>(endpoint)
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [endpoint, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const toggleArchive = async (row: T) => {
    try {
      await api(`${endpoint}/${row.id}`, { method: "PATCH", body: { archived: !row.archivedAt } });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  const visible = rows?.filter((r) => showArchived || !r.archivedAt) ?? [];
  const archivedCount = rows?.filter((r) => r.archivedAt).length ?? 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({})}>
          + New {singular}
        </button>
      </div>
      {archivedCount > 0 && (
        <div className="filters">
          <label className="check">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived ({archivedCount})
          </label>
        </div>
      )}
      {error && <div className="notice error">{error}</div>}
      {rows === null && !error ? (
        <div className="empty">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="empty">Nothing here yet.</div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.label}>{c.label}</th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className={row.archivedAt ? "muted" : undefined}>
                  {columns.map((c) => (
                    <td key={c.label}>{c.render(row)}</td>
                  ))}
                  <td>
                    <div className="actions">
                      <button className="btn small" onClick={() => setEditing({ row })}>
                        Edit
                      </button>
                      <button className={`btn small${row.archivedAt ? "" : " danger"}`} onClick={() => toggleArchive(row)}>
                        {row.archivedAt ? "Restore" : "Deactivate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <RecordForm
          title={`${editing.row ? "Edit" : "New"} ${singular.toLowerCase()}`}
          fields={fields}
          initial={editing.row ? toForm(editing.row) : emptyForm}
          onClose={() => setEditing(null)}
          onSubmit={async (form) => {
            const body = toPayload(fields, form);
            if (editing.row) await api(`${endpoint}/${editing.row.id}`, { method: "PUT", body });
            else await api(endpoint, { method: "POST", body });
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function RecordForm({
  title,
  fields,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  fields: FieldDef[];
  initial: Record<string, string>;
  onClose: () => void;
  onSubmit: (form: Record<string, string>) => Promise<void>;
}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" disabled={busy} onClick={submit}>
            Save
          </button>
        </>
      }
    >
      <ErrorNotice message={error} />
      {fields.map((field) => {
        const value = form[field.name] ?? "";
        if (field.kind === "date") {
          return <DateField key={field.name} label={field.label} value={value} onChange={(v) => set(field.name, v)} required />;
        }
        return (
          <label key={field.name} className="field">
            <span>
              {field.label}
              {"optional" in field && field.optional && <span className="hint"> (optional)</span>}
            </span>
            {field.kind === "select" ? (
              <select className="select" value={value} onChange={(e) => set(field.name, e.target.value)}>
                {field.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : field.kind === "textarea" ? (
              <textarea className="textarea" value={value} onChange={(e) => set(field.name, e.target.value)} />
            ) : (
              <input
                className="input"
                type={field.kind === "number" ? "number" : "text"}
                value={value}
                onChange={(e) => set(field.name, e.target.value)}
              />
            )}
          </label>
        );
      })}
    </Modal>
  );
}
