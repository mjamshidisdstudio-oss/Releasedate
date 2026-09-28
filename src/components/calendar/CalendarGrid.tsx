import type { CalendarDay } from "@/lib/calendar/build";
import { EventCard, MovedCard, ReleaseCard } from "./Cards";

function DayColumn({ day }: { day: CalendarDay }) {
  const classes = ["day"];
  if (day.items.length === 0) classes.push("empty-day");
  if (day.isWeekend) classes.push("weekend-day");
  if (day.holidays.length) classes.push("official-day");
  if (day.sprintTransition) classes.push("sprint-day");
  if (day.items.some((i) => i.kind === "event")) classes.push("event-day");
  if (day.isToday) classes.push("today");

  const hasIcons = day.isWeekend || day.holidays.length > 0;

  return (
    <section className={classes.join(" ")} data-date={day.date} aria-label={`${day.weekdayName} ${day.date}`}>
      <div className={`date-block ${day.layout}`}>
        {day.sprintTransition && <div className="sprint-ribbon">{day.sprintTransition.label}</div>}
        {hasIcons && (
          <div className="day-icons">
            {day.isWeekend && (
              <i className="holiday-icon weekend" title={day.weekdayName} aria-label={day.weekdayName} />
            )}
            {day.holidays.map((h) => (
              <i
                key={h.id}
                className="holiday-icon official"
                title={`Iran official holiday — ${h.name}`}
                aria-label={`Iran official holiday — ${h.name}`}
              />
            ))}
          </div>
        )}
        <strong>{day.primaryLabel}</strong>
        <span>{day.secondaryLabel}</span>
      </div>
      <div className="cards">
        {day.items.map((item) =>
          item.kind === "event" ? (
            <EventCard key={item.key} item={item} />
          ) : item.kind === "release" ? (
            <ReleaseCard key={item.key} item={item} />
          ) : (
            <MovedCard key={item.key} item={item} />
          ),
        )}
      </div>
    </section>
  );
}

export function CalendarGrid({ days }: { days: CalendarDay[] }) {
  return (
    <section className="calendar-wrap" aria-label="Release calendar">
      <div className="calendar" style={{ gridTemplateColumns: days.map((d) => `${d.width}px`).join(" ") }}>
        {days.map((day) => (
          <DayColumn key={day.date} day={day} />
        ))}
      </div>
    </section>
  );
}
