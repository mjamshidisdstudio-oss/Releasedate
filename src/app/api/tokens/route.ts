import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/session";
import { accessService } from "@/server/access";
import { handle, readJson, requireAdminMutation } from "@/server/http";
import { createTokenSchema } from "@/server/validation";

/** The signed-in user's own API tokens. */
export const GET = handle(async () => accessService.listTokens(await requireAdmin()));

/** Returns the plain token once; it cannot be retrieved later. */
export const POST = handle(async (req) => {
  const actor = await requireAdminMutation(req);
  return NextResponse.json(await accessService.createToken(actor, await readJson(req, createTokenSchema)), { status: 201 });
});
