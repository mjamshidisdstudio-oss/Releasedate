import { calendarService } from "@/server/calendar";
import { handle, readQuery } from "@/server/http";
import { calendarRangeSchema } from "@/server/validation";

/** Public, read-only: everything needed to render the calendar for one date range. */
export const GET = handle(async (req) => {
  const hasRange = req.nextUrl.searchParams.has("from") || req.nextUrl.searchParams.has("to");
  const { from, to } = hasRange ? readQuery(req, calendarRangeSchema) : await calendarService.defaultRange();
  return calendarService.getCalendar(from, to);
});
