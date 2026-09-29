import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/session";
import { accessService } from "@/server/access";
import { handle, readJson, requireAdminMutation } from "@/server/http";
import { createUserSchema } from "@/server/validation";

export const GET = handle(async () => {
  await requireAdmin();
  return accessService.listUsers();
});

export const POST = handle(async (req) => {
  await requireAdminMutation(req);
  return NextResponse.json(await accessService.createUser(await readJson(req, createUserSchema)), { status: 201 });
});
