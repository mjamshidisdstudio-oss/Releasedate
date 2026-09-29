import { accessService } from "@/server/access";
import { assertUuid, handle, readJson, requireAdminMutation } from "@/server/http";
import { revokeTokenSchema } from "@/server/validation";

type Ctx = { params: Promise<{ id: string }> };

/** Revoke. Tokens are never deleted, so the list keeps a record of them. */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const actor = await requireAdminMutation(req);
  const id = assertUuid((await params).id, "Token");
  await readJson(req, revokeTokenSchema);
  return accessService.revokeToken(actor, id);
});
