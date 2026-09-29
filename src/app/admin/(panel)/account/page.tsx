import { ApiTokens } from "@/components/admin/ApiTokens";
import { ChangePassword } from "@/components/admin/ChangePassword";

export const metadata = { title: "Account · Release Management" };

export default function AccountPage() {
  return (
    <div className="stack">
      <ChangePassword />
      <ApiTokens />
    </div>
  );
}
