import { formatGregorianShort, formatJalali, todayInTehran } from "@/lib/dates";
import { cardTone, STATUS_LABELS, TEAM_LABELS, type Team } from "@/lib/domain";
import type { EventItem, MovedItem, ReleaseItem } from "@/lib/calendar/build";
import type { ReleaseDTO } from "@/lib/calendar/types";

export function TeamChips({ teams }: { teams: Team[] }) {
  return (
    <div className="team-chips">
      {teams.map((team) => (
        <span key={team} className={`team-chip ${team}`}>
          {TEAM_LABELS[team]}
        </span>
      ))}
    </div>
  );
}

function StatusPill({ release }: { release: ReleaseDTO }) {
  if (release.status === "released") return <span className="status-pill released">✓ Released</span>;
  if (release.isOverdue) return <span className="status-pill overdue">Overdue</span>;
  if (release.status === "planned") return null;
  return <span className={`status-pill ${release.status}`}>{STATUS_LABELS[release.status]}</span>;
}

/** Tehran calendar date of a UTC timestamp. */
const tehranDate = (iso: string) => todayInTehran(new Date(iso));

export function ReleaseCard({ item }: { item: ReleaseItem }) {
  const { release } = item;
  const releasedOn = release.releasedAt ? tehranDate(release.releasedAt) : null;
  const last = release.lastScheduleChange;
  const classes = ["task-card", cardTone(release.teams)];
  if (release.status === "cancelled") classes.push("cancelled");

  return (
    <article className={classes.join(" ")} data-testid="release-card" data-release-id={release.id}>
      <div className="card-meta">
        <TeamChips teams={release.teams} />
        <div className="card-badges">
          {release.dueBefore && <span className="deadline-pill">Before</span>}
          <StatusPill release={release} />
        </div>
      </div>
      <h3>{release.title}</h3>
      {release.description && <p>{release.description}</p>}
      {releasedOn && releasedOn !== release.currentDate && (
        <p className="card-note">Actually released on {formatJalali(releasedOn)}.</p>
      )}
      {last && release.status !== "released" && (
        <p className="card-note">Rescheduled from {formatJalali(last.previousDate)}.</p>
      )}
    </article>
  );
}

function movedNote(item: MovedItem): string {
  const { release, previousDate, movedTo, currentDate } = item;
  const current = formatJalali(currentDate);
  if (release.status === "released") {
    return `Previous target: ${formatJalali(previousDate)}. Released ${currentDate < previousDate ? "earlier " : ""}on ${current}.`;
  }
  const via = movedTo !== currentDate ? ` (via ${formatJalali(movedTo)})` : "";
  const cancelled = release.status === "cancelled" ? " Later cancelled." : "";
  return `Previous target: ${formatJalali(previousDate)}. Moved to ${current}${via}.${cancelled}`;
}

export function MovedCard({ item }: { item: MovedItem }) {
  return (
    <article
      className={`task-card ${cardTone(item.release.teams)} moved-history`}
      data-testid="moved-card"
      data-release-id={item.release.id}
      title={item.change.reason ? `Reason: ${item.change.reason}` : undefined}
    >
      <div className="card-meta">
        <TeamChips teams={item.release.teams} />
        <div className="card-badges">
          <span className="status-pill moved">Moved</span>
        </div>
      </div>
      <h3>{item.release.title}</h3>
      <p className="moved-to">
        → {formatJalali(item.currentDate)} <span>{formatGregorianShort(item.currentDate)}</span>
      </p>
      <p className="card-note">{movedNote(item)}</p>
    </article>
  );
}

export function EventCard({ item }: { item: EventItem }) {
  return (
    <article className="task-card event" data-testid="event-card">
      <div className="card-meta">
        <div className="team-chips">
          <span className="event-pill">EVENT</span>
        </div>
      </div>
      <h3>{item.event.title}</h3>
      {item.event.description && <p>{item.event.description}</p>}
    </article>
  );
}
