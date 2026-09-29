import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import { handle, readJson, requireAdminMutation } from "@/server/http";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { changePasswordSchema } from "@/server/validation";

export const POST = handle(async (req) => {
  const actor = await requireAdminMutation(req);
  const { currentPassword, newPassword } = await readJson(req, changePasswordSchema);
  const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new DomainError(400, "invalid_credentials", "Current password is wrong");
  }
  await prisma.adminUser.update({ where: { id: actor.id }, data: { passwordHash: await hashPassword(newPassword) } });
  return { ok: true };
});
