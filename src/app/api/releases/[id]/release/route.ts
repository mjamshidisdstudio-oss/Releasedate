import { assertUuid, handle, readJson, requireAdminMutation } from "@/server/http";
import { releaseService } from "@/server/releases";
import { markReleasedSchema } from "@/server/validation";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req, { params }) => {
  await requireAdminMutation(req);
  const id = assertUuid((await params).id, "Release");
  return releaseService.markReleased(id, await readJson(req, markReleasedSchema));
});
