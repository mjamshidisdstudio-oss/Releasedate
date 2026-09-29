import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/session";
import { handle, readJson, requireAdminMutation } from "@/server/http";
import { planningService } from "@/server/planning";
import { eventSchema } from "@/server/validation";

export const GET = handle(async () => {
  await requireAdmin();
  return planningService.listEvents();
});

export const POST = handle(async (req) => {
  await requireAdminMutation(req);
  return NextResponse.json(await planningService.createEvent(await readJson(req, eventSchema)), { status: 201 });
});
