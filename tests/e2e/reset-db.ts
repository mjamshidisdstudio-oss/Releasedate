import { PrismaClient } from "@prisma/client";

/** Empties the test database (TRUNCATE is used because history rows cannot be deleted). */
const prisma = new PrismaClient();
prisma
  .$executeRawUnsafe(
    "TRUNCATE release_schedule_history, release_teams, releases, sprints, calendar_events, holidays, admin_users CASCADE",
  )
  .finally(() => prisma.$disconnect());
