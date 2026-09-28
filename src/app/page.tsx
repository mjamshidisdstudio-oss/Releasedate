import { ReleaseCalendar } from "@/components/calendar/ReleaseCalendar";
import { isIsoDate } from "@/lib/dates";
import "@/components/calendar/calendar.css";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const from = typeof params.from === "string" && isIsoDate(params.from) ? params.from : undefined;
  const to = typeof params.to === "string" && isIsoDate(params.to) ? params.to : undefined;
  return <ReleaseCalendar initialFrom={from && to ? from : undefined} initialTo={from && to ? to : undefined} />;
}
