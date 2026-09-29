"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, diffDays, formatGregorianShort, formatJalali, isIsoDate } from "@/lib/dates";
import { TEAM_LABELS, TEAMS } from "@/lib/domain";
import { buildCalendarView } from "@/lib/calendar/build";
import type { CalendarData } from "@/lib/calendar/types";
import { CalendarGrid } from "./CalendarGrid";
import { ExecutiveSummary } from "./ExecutiveSummary";

type State =
  | { status: "loading"; data?: CalendarData }
  | { status: "error"; message: string; data?: CalendarData }
  | { status: "ready"; data: CalendarData };

const longDate = (date: string) =>
  `${formatJalali(date, { withYear: true })} / ${formatGregorianShort(date, { withYear: true })}`;

export function ReleaseCalendar({ initialFrom, initialTo }: { initialFrom?: string; initialTo?: string }) {
  const [range, setRange] = useState<{ from?: string; to?: string }>({ from: initialFrom, to: initialTo });
  const [state, setState] = useState<State>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ status: "loading", data: s.data }));
    const params = new URLSearchParams();
    if (range.from && range.to) {
      params.set("from", range.from);
      params.set("to", range.to);
    }
    fetch(`/api/release-calendar?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
        return body as CalendarData;
      })
      .then((data) => {
        setState({ status: "ready", data });
        const url = new URL(window.location.href);
        if (range.from && range.to) {
          url.searchParams.set("from", data.from);
          url.searchParams.set("to", data.to);
        } else {
          url.searchParams.delete("from");
          url.searchParams.delete("to");
        }
        window.history.replaceState(null, "", url);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState((s) => ({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load the calendar",
          data: s.data,
        }));
      });
    return () => controller.abort();
  }, [range, reloadKey]);

  const data = state.data;
  const view = useMemo(() => (data ? buildCalendarView(data) : null), [data]);

  const shift = useCallback(
    (days: number) => {
      if (!data) return;
      setRange({ from: addDays(data.from, days), to: addDays(data.to, days) });
    },
    [data],
  );

  const setBound = (key: "from" | "to", value: string) => {
    if (!data || !isIsoDate(value)) return;
    const next = { from: data.from, to: data.to, [key]: value };
    if (next.from > next.to || diffDays(next.from, next.to) > 370) return;
    setRange(next);
  };

  const presentTeams = TEAMS.filter((team) => data?.releases.some((r) => r.teams.includes(team)));
  const title = view?.sprintRange
    ? `Sprint ${view.sprintRange.first}–${view.sprintRange.last} Release Calendar`
    : "Release Calendar";

  return (
    <main>
      <section className="hero">
        <div className="hero-top">
          <h1>{title}</h1>
          <a className="admin-link" href="/admin/calendar">
            Back Office
          </a>
        </div>
        <p>
          {data ? `${longDate(data.from)} – ${longDate(data.to)}. ` : ""}
          Empty days are compressed. Fridays and Saturdays are marked as weekend days; Iran official holidays are
          marked separately. Sprint transition days are highlighted. Faded cards show previous planned release dates;
          the active card on the newer date shows the current schedule.
        </p>
        <div className="legend">
          {(presentTeams.length ? presentTeams : (["backend", "frontend", "ai"] as const)).map((team) => (
            <span key={team}>
              <i className={`dot ${team}`} />
              {TEAM_LABELS[team]}
            </span>
          ))}
          <span><i className="dot released" />Released</span>
          <span><i className="dot moved" />Moved / previous date</span>
          <span><i className="dot cancelled" />Cancelled</span>
          <span><i className="dot event" />Event</span>
          <span><i className="dot weekend" />Friday / Saturday</span>
          <span><i className="dot official" />Iran official holiday</span>
          <span><i className="dot start" />Sprint transition</span>
        </div>
        <div className="range-bar">
          <button type="button" onClick={() => shift(-14)} disabled={!data}>
            ← 2 weeks
          </button>
          <button type="button" onClick={() => setRange({})}>
            Current sprints
          </button>
          <button type="button" onClick={() => shift(14)} disabled={!data}>
            2 weeks →
          </button>
          <label>
            From
            <input type="date" value={data?.from ?? ""} onChange={(e) => setBound("from", e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={data?.to ?? ""} onChange={(e) => setBound("to", e.target.value)} />
          </label>
          {state.status === "loading" && data && <span className="range-label">Updating…</span>}
        </div>
      </section>

      {state.status === "error" && (
        <div className="state-card" role="alert">
          <h2>Couldn’t load the release calendar</h2>
          <p>{state.message}</p>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </button>
        </div>
      )}

      {state.status === "loading" && !data && (
        <div className="skeleton" aria-busy="true" aria-label="Loading calendar">
          {[290, 44, 44, 290, 155, 44, 330, 44, 290].map((w, i) => (
            <div key={i} style={{ width: w }} />
          ))}
        </div>
      )}

      {state.status !== "error" && view && data && (
        view.isEmpty ? (
          <div className="state-card">
            <h2>Nothing scheduled</h2>
            <p>No releases or events scheduled for this period.</p>
          </div>
        ) : (
          <>
            <CalendarGrid days={view.days} />
            <ExecutiveSummary rows={view.summary} />
          </>
        )
      )}
    </main>
  );
}
