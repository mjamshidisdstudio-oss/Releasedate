import { assertUuid, handle, readJson, requireAdminMutation } from "@/server/http";
import { planningService } from "@/server/planning";
import { archiveSchema, holidaySchema } from "@/server/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle<Ctx>(async (req, { params }) => {
  await requireAdminMutation(req);
  const id = assertUuid((await params).id, "Holiday");
  return planningService.updateHoliday(id, await readJson(req, holidaySchema));
});

/** Archive / restore. Records are never hard-deleted. */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  await requireAdminMutation(req);
  const id = assertUuid((await params).id, "Holiday");
  const { archived } = await readJson(req, archiveSchema);
  return planningService.archiveHoliday(id, archived);
});
