import { assertUuid, handle, readJson, requireAdminMutation } from "@/server/http";
import { planningService } from "@/server/planning";
import { archiveSchema, sprintSchema } from "@/server/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle<Ctx>(async (req, { params }) => {
  await requireAdminMutation(req);
  const id = assertUuid((await params).id, "Sprint");
  return planningService.updateSprint(id, await readJson(req, sprintSchema));
});

/** Archive / restore. Records are never hard-deleted. */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  await requireAdminMutation(req);
  const id = assertUuid((await params).id, "Sprint");
  const { archived } = await readJson(req, archiveSchema);
  return planningService.archiveSprint(id, archived);
});
