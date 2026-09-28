import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/session";
import { handle, readJson, readQuery, requireAdminMutation } from "@/server/http";
import { releaseService } from "@/server/releases";
import { createReleaseSchema, listReleasesSchema } from "@/server/validation";

export const GET = handle(async (req) => {
  await requireAdmin();
  return releaseService.list(readQuery(req, listReleasesSchema));
});

export const POST = handle(async (req) => {
  const actor = await requireAdminMutation(req);
  const release = await releaseService.create(await readJson(req, createReleaseSchema), actor);
  return NextResponse.json(release, { status: 201 });
});
