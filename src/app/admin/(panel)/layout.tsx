import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { currentAdmin } from "@/server/auth/session";
import "@/components/admin/admin.css";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return (
    <div className="admin">
      <AdminNav username={admin.username} />
      {children}
    </div>
  );
}
