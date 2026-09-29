import { assertUuid, handle, readJson, requireAdminMutation } from "@/server/http";
import { releaseService } from "@/server/releases";
import { moveReleaseSchema } from "@/server/validation";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req, { params }) => {
  const actor = await requireAdminMutation(req);
  const id = assertUuid((await params).id, "Release");
  return releaseService.move(id, await readJson(req, moveReleaseSchema), actor);
});
