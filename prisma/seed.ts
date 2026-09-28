import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hashPassword } from "../src/server/auth/password";
import { fromIsoDate } from "../src/lib/dates";
import { SEED_EVENTS, SEED_RELEASES, SEED_SPRINTS } from "./seed-data";

/**
 * Idempotent: each table group is only seeded when it is empty, so re-running this against a
 * live database never duplicates or overwrites data that was edited in the Back Office.
 */

const prisma = new PrismaClient();

const MIGRATION_LABEL = "Initial migration";
const MIGRATION_REASON = "Imported from the static release calendar (original change time unknown)";

async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD ?? "Admin@1405!";
  const existing = await prisma.adminUser.findUnique({ where: { username } });
  if (existing) return console.log(`admin: "${username}" already exists, password unchanged`);
  await prisma.adminUser.create({
    data: { username, displayName: "Administrator", passwordHash: await hashPassword(password) },
  });
  console.log(`admin: created "${username}"`);
}

async function seedReleases() {
  if ((await prisma.release.count()) > 0) return console.log("releases: already present, skipped");

  const createdBase = Date.parse("2026-08-01T06:00:00Z");
  let moveIndex = 0;

  for (const [index, item] of SEED_RELEASES.entries()) {
    const release = await prisma.release.create({
      data: {
        title: item.title,
        description: item.description,
        type: item.type,
        status: item.status,
        currentDate: fromIsoDate(item.date),
        dueBefore: item.dueBefore ?? false,
        // Actual time unknown for migrated releases: noon Tehran on the scheduled day.
        releasedAt: item.status === "released" ? new Date(`${item.date}T12:00:00+03:30`) : null,
        createdAt: new Date(createdBase + index * 1000),
        teams: { create: item.teams.map((team) => ({ team })) },
      },
    });

    const chain = [...(item.previousDates ?? []), item.date];
    for (let i = 0; i < chain.length - 1; i++) {
      await prisma.releaseScheduleChange.create({
        data: {
          releaseId: release.id,
          previousDate: fromIsoDate(chain[i]),
          newDate: fromIsoDate(chain[i + 1]),
          reason: MIGRATION_REASON,
          changedByLabel: MIGRATION_LABEL,
          changedAt: new Date(createdBase + 86_400_000 + moveIndex++ * 60_000),
        },
      });
    }
  }
  console.log(`releases: created ${SEED_RELEASES.length} with ${moveIndex} schedule changes`);
}

async function seedSprints() {
  if ((await prisma.sprint.count()) > 0) return console.log("sprints: already present, skipped");
  await prisma.sprint.createMany({
    data: SEED_SPRINTS.map((s) => ({ number: s.number, startDate: fromIsoDate(s.startDate), endDate: fromIsoDate(s.endDate) })),
  });
  console.log(`sprints: created ${SEED_SPRINTS.length}`);
}

async function seedEvents() {
  if ((await prisma.calendarEvent.count()) > 0) return console.log("events: already present, skipped");
  await prisma.calendarEvent.createMany({ data: SEED_EVENTS.map((e) => ({ ...e, date: fromIsoDate(e.date) })) });
  console.log(`events: created ${SEED_EVENTS.length}`);
}

async function seedHolidays() {
  if ((await prisma.holiday.count()) > 0) return console.log("holidays: already present, skipped");
  const holidays = JSON.parse(
    readFileSync(join(__dirname, "data", "iran-official-holidays-1405.json"), "utf8"),
  ) as { date: string; name: string }[];
  await prisma.holiday.createMany({ data: holidays.map((h) => ({ name: h.name, date: fromIsoDate(h.date) })) });
  console.log(`holidays: created ${holidays.length}`);
}

async function main() {
  await seedAdmin();
  await seedReleases();
  await seedSprints();
  await seedEvents();
  await seedHolidays();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
