import { handle } from "@/server/http";
import { logout } from "@/server/auth/session";

export const POST = handle(async () => {
  await logout();
  return { ok: true };
});
