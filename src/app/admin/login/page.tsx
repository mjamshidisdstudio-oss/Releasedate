import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { currentAdmin } from "@/server/auth/session";
import "@/components/admin/admin.css";

export const metadata = { title: "Login · Release Management" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only allow same-site relative redirects.
  const target = next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin/calendar";
  if (await currentAdmin()) redirect(target);
  return <LoginForm next={target} />;
}
