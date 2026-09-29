import { requireAdmin } from "@/server/auth/session";
import { assertUuid, handle, readJson, requireAdminMutation } from "@/server/http";
import { releaseService } from "@/server/releases";
import { updateReleaseSchema } from "@/server/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  return releaseService.get(assertUuid((await params).id, "Release"));
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  await requireAdminMutation(req);
  const id = assertUuid((await params).id, "Release");
  return releaseService.update(id, await readJson(req, updateReleaseSchema));
});
