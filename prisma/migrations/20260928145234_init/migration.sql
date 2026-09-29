-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('planned', 'ready', 'released', 'cancelled', 'blocked');

-- CreateEnum
CREATE TYPE "ReleaseType" AS ENUM ('feature', 'improvement', 'infrastructure', 'experiment', 'product_launch', 'ai_model', 'back_office', 'other');

-- CreateEnum
CREATE TYPE "Team" AS ENUM ('backend', 'frontend', 'ai', 'product', 'design', 'marketing');

-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('company_event', 'milestone', 'other');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releases" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ReleaseType" NOT NULL DEFAULT 'feature',
    "status" "ReleaseStatus" NOT NULL DEFAULT 'planned',
    "current_release_date" DATE NOT NULL,
    "dueBefore" BOOLEAN NOT NULL DEFAULT false,
    "releasedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_teams" (
    "releaseId" UUID NOT NULL,
    "team" "Team" NOT NULL,

    CONSTRAINT "release_teams_pkey" PRIMARY KEY ("releaseId","team")
);

-- CreateTable
CREATE TABLE "release_schedule_history" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "previousDate" DATE NOT NULL,
    "newDate" DATE NOT NULL,
    "reason" TEXT,
    "changedById" UUID,
    "changedByLabel" TEXT,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_schedule_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sprints" (
    "id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "CalendarEventType" NOT NULL DEFAULT 'company_event',
    "description" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");

-- CreateIndex
CREATE INDEX "releases_current_release_date_idx" ON "releases"("current_release_date");

-- CreateIndex
CREATE INDEX "release_schedule_history_releaseId_changedAt_idx" ON "release_schedule_history"("releaseId", "changedAt");

-- CreateIndex
CREATE INDEX "release_schedule_history_previousDate_idx" ON "release_schedule_history"("previousDate");

-- CreateIndex
CREATE UNIQUE INDEX "sprints_number_key" ON "sprints"("number");

-- CreateIndex
CREATE INDEX "sprints_startDate_idx" ON "sprints"("startDate");

-- CreateIndex
CREATE INDEX "calendar_events_date_idx" ON "calendar_events"("date");

-- CreateIndex
CREATE INDEX "holidays_date_idx" ON "holidays"("date");

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_teams" ADD CONSTRAINT "release_teams_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_schedule_history" ADD CONSTRAINT "release_schedule_history_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_schedule_history" ADD CONSTRAINT "release_schedule_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Schedule history is append-only: never allow rows to be changed or removed.
CREATE OR REPLACE FUNCTION prevent_schedule_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'release_schedule_history is immutable (% not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER release_schedule_history_immutable
  BEFORE UPDATE OR DELETE ON "release_schedule_history"
  FOR EACH ROW EXECUTE FUNCTION prevent_schedule_history_mutation();

-- A move must always change the date.
ALTER TABLE "release_schedule_history"
  ADD CONSTRAINT "release_schedule_history_dates_differ" CHECK ("previousDate" <> "newDate");

ALTER TABLE "sprints"
  ADD CONSTRAINT "sprints_end_after_start" CHECK ("endDate" >= "startDate");
