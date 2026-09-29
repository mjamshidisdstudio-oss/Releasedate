import type { Prisma, PrismaClient } from "@prisma/client";
import type { z } from "zod";
import { fromIsoDate, todayInTehran, toIsoDate, type IsoDate } from "@/lib/dates";
import { OPEN_STATUSES, sortTeams, type ReleaseStatus, type Team } from "@/lib/domain";
import type { ReleaseDTO, ScheduleChangeDTO } from "@/lib/calendar/types";
import { prisma as defaultPrisma } from "./db";
import { conflict, notFound } from "./errors";
import type {
  createReleaseSchema,
  listReleasesSchema,
  markReleasedSchema,
  moveReleaseSchema,
  updateReleaseSchema,
} from "./validation";

export interface Actor {
  id: string;
  username: string;
}

type Db = PrismaClient | Prisma.TransactionClient;

export const releaseInclude = {
  teams: true,
  createdBy: { select: { username: true } },
  scheduleChanges: {
    orderBy: { changedAt: "asc" },
    include: { changedBy: { select: { username: true } } },
  },
} satisfies Prisma.ReleaseInclude;

export type ReleaseWithRelations = Prisma.ReleaseGetPayload<{ include: typeof releaseInclude }>;
type ChangeWithActor = ReleaseWithRelations["scheduleChanges"][number];

export function toScheduleChangeDTO(change: ChangeWithActor): ScheduleChangeDTO {
  return {
    id: change.id,
    releaseId: change.releaseId,
    previousDate: toIsoDate(change.previousDate),
    newDate: toIsoDate(change.newDate),
    reason: change.reason,
    changedBy: change.changedBy?.username ?? change.changedByLabel ?? null,
    changedAt: change.changedAt.toISOString(),
  };
}

export function isOverdue(status: ReleaseStatus, currentDate: IsoDate, today: IsoDate): boolean {
  return OPEN_STATUSES.includes(status) && currentDate < today;
}

export function toReleaseDTO(release: ReleaseWithRelations, today: IsoDate = todayInTehran()): ReleaseDTO {
  const currentDate = toIsoDate(release.currentDate);
  const last = release.scheduleChanges.at(-1);
  return {
    id: release.id,
    title: release.title,
    description: release.description,
    type: release.type,
    status: release.status,
    currentDate,
    dueBefore: release.dueBefore,
    releasedAt: release.releasedAt?.toISOString() ?? null,
    cancelledAt: release.cancelledAt?.toISOString() ?? null,
    teams: sortTeams(release.teams.map((t) => t.team as Team)),
    createdBy: release.createdBy?.username ?? null,
    createdAt: release.createdAt.toISOString(),
    updatedAt: release.updatedAt.toISOString(),
    isOverdue: isOverdue(release.status, currentDate, today),
    scheduleChangeCount: release.scheduleChanges.length,
    lastScheduleChange: last ? toScheduleChangeDTO(last) : null,
  };
}

export class ReleaseService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async list(filters: z.output<typeof listReleasesSchema>): Promise<ReleaseDTO[]> {
    const today = todayInTehran();
    const where: Prisma.ReleaseWhereInput = {};
    if (filters.status.length) where.status = { in: filters.status };
    if (filters.team) where.teams = { some: { team: filters.team } };
    if (filters.from || filters.to) {
      where.currentDate = {
        ...(filters.from ? { gte: fromIsoDate(filters.from) } : {}),
        ...(filters.to ? { lte: fromIsoDate(filters.to) } : {}),
      };
    }
    if (filters.q) where.title = { contains: filters.q, mode: "insensitive" };
    if (filters.needsUpdate) {
      where.AND = [{ status: { in: [...OPEN_STATUSES] } }, { currentDate: { lt: fromIsoDate(today) } }];
    }

    const rows = await this.db.release.findMany({
      where,
      include: releaseInclude,
      orderBy: [{ currentDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((r) => toReleaseDTO(r, today));
  }

  async get(id: string): Promise<ReleaseDTO> {
    return toReleaseDTO(await this.load(this.db, id));
  }

  async history(id: string): Promise<ScheduleChangeDTO[]> {
    const release = await this.load(this.db, id);
    return release.scheduleChanges.map(toScheduleChangeDTO);
  }

  async create(input: z.output<typeof createReleaseSchema>, actor: Actor): Promise<ReleaseDTO> {
    const release = await this.db.release.create({
      data: {
        title: input.title,
        description: input.description,
        type: input.type,
        status: input.status,
        currentDate: fromIsoDate(input.releaseDate),
        dueBefore: input.dueBefore,
        createdById: actor.id,
        teams: { create: input.teams.map((team) => ({ team })) },
      },
      include: releaseInclude,
    });
    return toReleaseDTO(release);
  }

  async update(id: string, input: z.output<typeof updateReleaseSchema>): Promise<ReleaseDTO> {
    return this.db.$transaction(async (tx) => {
      const existing = await this.load(tx, id, true);
      if (input.status && (existing.status === "released" || existing.status === "cancelled")) {
        throw conflict(`Release is ${existing.status}; reopen it before changing its status`);
      }
      if (input.teams) {
        await tx.releaseTeam.deleteMany({ where: { releaseId: id } });
        await tx.releaseTeam.createMany({ data: input.teams.map((team) => ({ releaseId: id, team })) });
      }
      await tx.release.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description === undefined ? undefined : input.description,
          type: input.type,
          dueBefore: input.dueBefore,
          status: input.status,
        },
      });
      return toReleaseDTO(await this.load(tx, id));
    });
  }

  /**
   * Moves a release: records the old → new date as an immutable history row, then updates the
   * current date. The row lock keeps concurrent moves from reading the same "previous" date.
   */
  async move(id: string, input: z.output<typeof moveReleaseSchema>, actor: Actor): Promise<ReleaseDTO> {
    return this.db.$transaction(async (tx) => {
      const release = await this.load(tx, id, true);
      if (release.status === "released" || release.status === "cancelled") {
        throw conflict(`A ${release.status} release cannot be moved; reopen it first`);
      }
      const previousDate = toIsoDate(release.currentDate);
      if (previousDate === input.newDate) throw conflict("The release is already scheduled on that date");

      await tx.releaseScheduleChange.create({
        data: {
          releaseId: id,
          previousDate: release.currentDate,
          newDate: fromIsoDate(input.newDate),
          reason: input.reason,
          changedById: actor.id,
        },
      });
      await tx.release.update({ where: { id }, data: { currentDate: fromIsoDate(input.newDate) } });
      return toReleaseDTO(await this.load(tx, id));
    });
  }

  /** Records the actual release moment. The scheduled date is left untouched. */
  async markReleased(id: string, input: z.output<typeof markReleasedSchema>, now = new Date()): Promise<ReleaseDTO> {
    const releasedAt = input.releasedAt ? new Date(input.releasedAt) : now;
    if (releasedAt.getTime() > now.getTime() + 5 * 60_000) throw conflict("Release time cannot be in the future");
    return this.db.$transaction(async (tx) => {
      const release = await this.load(tx, id, true);
      if (release.status === "released") throw conflict("Release is already marked as released");
      if (release.status === "cancelled") throw conflict("A cancelled release cannot be released; reopen it first");
      await tx.release.update({ where: { id }, data: { status: "released", releasedAt } });
      return toReleaseDTO(await this.load(tx, id));
    });
  }

  async cancel(id: string, now = new Date()): Promise<ReleaseDTO> {
    return this.db.$transaction(async (tx) => {
      const release = await this.load(tx, id, true);
      if (release.status === "cancelled") throw conflict("Release is already cancelled");
      if (release.status === "released") throw conflict("A released release cannot be cancelled");
      await tx.release.update({ where: { id }, data: { status: "cancelled", cancelledAt: now } });
      return toReleaseDTO(await this.load(tx, id));
    });
  }

  /** Undo a release/cancel decision made by mistake. History is untouched. */
  async reopen(id: string): Promise<ReleaseDTO> {
    return this.db.$transaction(async (tx) => {
      const release = await this.load(tx, id, true);
      if (release.status !== "released" && release.status !== "cancelled") {
        throw conflict("Only released or cancelled releases can be reopened");
      }
      await tx.release.update({ where: { id }, data: { status: "planned", releasedAt: null, cancelledAt: null } });
      return toReleaseDTO(await this.load(tx, id));
    });
  }

  private async load(db: Db, id: string, lock = false): Promise<ReleaseWithRelations> {
    if (lock) await db.$queryRaw`SELECT id FROM releases WHERE id = ${id}::uuid FOR UPDATE`;
    const release = await db.release.findUnique({ where: { id }, include: releaseInclude });
    if (!release) throw notFound("Release");
    return release;
  }
}

export const releaseService = new ReleaseService();
