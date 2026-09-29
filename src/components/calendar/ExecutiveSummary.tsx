import { formatGregorianShort, formatJalali } from "@/lib/dates";
import { STATUS_LABELS, TEAM_LABELS } from "@/lib/domain";
import type { SummaryRow } from "@/lib/calendar/build";
import type { ReleaseDTO } from "@/lib/calendar/types";

const summaryDate = (date: string) => `${formatGregorianShort(date, { padDay: true })} / ${formatJalali(date)}`;

function Teams({ release }: { release: ReleaseDTO }) {
  return (
    <>
      {release.teams.map((team) => (
        <span key={team} className={`summary-team ${team}`}>
          {TEAM_LABELS[team]}
        </span>
      ))}
    </>
  );
}

function ReleaseStatus({ release }: { release: ReleaseDTO }) {
  if (release.isOverdue) {
    return <span className="summary-status overdue">{STATUS_LABELS[release.status]} · Overdue</span>;
  }
  return <span className={`summary-status ${release.status}`}>{STATUS_LABELS[release.status]}</span>;
}

function Row({ row }: { row: SummaryRow }) {
  switch (row.kind) {
    case "sprint":
      return (
        <tr>
          <td>{summaryDate(row.date)}</td>
          <td><span className="summary-team milestone">Sprint</span></td>
          <td>{row.transition.label}</td>
          <td>—</td>
        </tr>
      );
    case "event":
      return (
        <tr>
          <td>{summaryDate(row.date)}</td>
          <td><span className="summary-team event">Event</span></td>
          <td>{row.event.title}</td>
          <td>—</td>
        </tr>
      );
    case "release":
      return (
        <tr>
          <td>{summaryDate(row.date)}</td>
          <td><Teams release={row.release} /></td>
          <td>{row.release.title}</td>
          <td><ReleaseStatus release={row.release} /></td>
        </tr>
      );
    case "moved":
      return (
        <tr className="summary-row-moved">
          <td>{summaryDate(row.date)}</td>
          <td><Teams release={row.item.release} /></td>
          <td>{row.item.release.title}</td>
          <td><span className="summary-status moved">Moved → {formatJalali(row.item.currentDate)}</span></td>
        </tr>
      );
  }
}

export function ExecutiveSummary({ rows }: { rows: SummaryRow[] }) {
  return (
    <section className="summary">
      <h2>Executive Summary</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Release date</th>
              <th>Team</th>
              <th>Task / Scope</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row key={row.key} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
