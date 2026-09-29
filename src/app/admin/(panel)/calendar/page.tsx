import { AdminCalendar } from "@/components/admin/AdminCalendar";
import { isIsoDate } from "@/lib/dates";

export const metadata = { title: "Calendar · Release Management" };

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const date = typeof params.date === "string" && isIsoDate(params.date) ? params.date : undefined;
  const mode = params.mode === "gregorian" || params.mode === "jalali" ? params.mode : undefined;
  return <AdminCalendar initialDate={date} initialMode={mode} />;
}
