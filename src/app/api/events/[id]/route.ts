import { assertUuid, handle, readJson, requireAdminMutation } from "@/server/http";
import { planningService } from "@/server/planning";
import { archiveSchema, eventSchema } from "@/server/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle<Ctx>(async (req, { params }) => {
  await requireAdminMutation(req);
  const id = assertUuid((await params).id, "Event");
  return planningService.updateEvent(id, await readJson(req, eventSchema));
});

/** Archive / restore. Records are never hard-deleted. */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  await requireAdminMutation(req);
  const id = assertUuid((await params).id, "Event");
  const { archived } = await readJson(req, archiveSchema);
  return planningService.archiveEvent(id, archived);
});
