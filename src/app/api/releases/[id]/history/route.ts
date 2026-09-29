import { requireAdmin } from "@/server/auth/session";
import { assertUuid, handle } from "@/server/http";
import { releaseService } from "@/server/releases";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  return releaseService.history(assertUuid((await params).id, "Release"));
});
