import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/session";
import { handle, readJson, requireAdminMutation } from "@/server/http";
import { planningService } from "@/server/planning";
import { sprintSchema } from "@/server/validation";

export const GET = handle(async () => {
  await requireAdmin();
  return planningService.listSprints();
});

export const POST = handle(async (req) => {
  await requireAdminMutation(req);
  return NextResponse.json(await planningService.createSprint(await readJson(req, sprintSchema)), { status: 201 });
});
