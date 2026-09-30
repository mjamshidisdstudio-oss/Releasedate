import { assertUuid, handle, readJson, requireAdminMutation } from "@/server/http";
import { releaseService } from "@/server/releases";
import { hideReleaseSchema } from "@/server/validation";

type Ctx = { params: Promise<{ id: string }> };

/** Hide / unhide a release. Nothing is deleted; history is kept. */
export const POST = handle<Ctx>(async (req, { params }) => {
  await requireAdminMutation(req);
  const id = assertUuid((await params).id, "Release");
  const { hidden } = await readJson(req, hideReleaseSchema);
  return releaseService.setHidden(id, hidden);
});
