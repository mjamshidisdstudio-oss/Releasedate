"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { formatGregorianShort, formatJalali, isIsoDate, weekdayName } from "@/lib/dates";
import { TEAM_LABELS, TEAMS, type Team } from "@/lib/domain";

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input, textarea, select, button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </header>
        <div className="body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}

/** "15 Mehr 1405 · 7 Oct · Wednesday" */
export function DatePreview({ value }: { value: string }) {
  if (!isIsoDate(value)) return null;
  return (
    <span className="hint">
      {formatJalali(value, { withYear: true })} · {formatGregorianShort(value)} · {weekdayName(value)}
    </span>
  );
}

export function DateDual({ value }: { value: string }) {
  return (
    <div className="date-dual">
      <strong>{formatJalali(value)}</strong>
      <span>{formatGregorianShort(value, { withYear: true })}</span>
    </div>
  );
}

export function DateField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" type="date" value={value} required={required} onChange={(e) => onChange(e.target.value)} />
      <DatePreview value={value} />
    </label>
  );
}

export function TeamPicker({ value, onChange }: { value: Team[]; onChange: (teams: Team[]) => void }) {
  return (
    <div className="field">
      <span>Teams</span>
      <div className="team-picker">
        {TEAMS.map((team) => (
          <label key={team}>
            <input
              type="checkbox"
              checked={value.includes(team)}
              onChange={(e) => onChange(e.target.checked ? [...value, team] : value.filter((t) => t !== team))}
            />
            {TEAM_LABELS[team]}
          </label>
        ))}
      </div>
    </div>
  );
}

export function TeamChips({ teams }: { teams: Team[] }) {
  return (
    <>
      {teams.map((team) => (
        <span key={team} className={`chip ${team}`}>
          {TEAM_LABELS[team]}
        </span>
      ))}
    </>
  );
}

export function ErrorNotice({ message }: { message: string | null }) {
  return message ? (
    <div className="notice error" role="alert" style={{ margin: 0 }}>
      {message}
    </div>
  ) : null;
}
