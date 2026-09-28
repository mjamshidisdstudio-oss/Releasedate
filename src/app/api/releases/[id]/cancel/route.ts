import { assertUuid, handle, requireAdminMutation } from "@/server/http";
import { releaseService } from "@/server/releases";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req, { params }) => {
  await requireAdminMutation(req);
  return releaseService.cancel(assertUuid((await params).id, "Release"));
});
