import { prisma } from "@/server/db";
import type { Actor } from "@/server/releases";

/** Empties every table. TRUNCATE is used because row-level triggers keep history rows from being deleted. */
export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE release_schedule_history, release_teams, releases, sprints, calendar_events, holidays, admin_users CASCADE`,
  );
}

export async function createActor(username = "tester"): Promise<Actor> {
  const user = await prisma.adminUser.create({
    data: { username, displayName: username, passwordHash: "scrypt$00$00" },
  });
  return { id: user.id, username: user.username };
}
