import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import { ReleaseService, type Actor } from "@/server/releases";
import { createReleaseSchema, moveReleaseSchema, updateReleaseSchema } from "@/server/validation";
import { createActor, resetDatabase } from "./helpers";

const service = new ReleaseService(prisma);
let actor: Actor;

const create = (overrides: Record<string, unknown> = {}) =>
  service.create(
    createReleaseSchema.parse({ title: "HDR Service Release", teams: ["backend", "frontend"], releaseDate: "2026-09-23", ...overrides }),
    actor,
  );
const move = (id: string, newDate: string, reason?: string) => service.move(id, moveReleaseSchema.parse({ newDate, reason }), actor);

beforeEach(async () => {
  await resetDatabase();
  actor = await createActor();
});

afterAll(() => prisma.$disconnect());

describe("create release", () => {
  it("stores and returns the release with its teams and default status", async () => {
    const created = await create({ description: "HDR flow", type: "feature" });
    const loaded = await service.get(created.id);
    expect(loaded).toMatchObject({
      title: "HDR Service Release",
      description: "HDR flow",
      status: "planned",
      currentDate: "2026-09-23",
      teams: ["backend", "frontend"],
      createdBy: "tester",
      releasedAt: null,
      scheduleChangeCount: 0,
    });
  });

  it("rejects an empty title, no teams, a bad date and unknown enums", () => {
    expect(createReleaseSchema.safeParse({ title: "  ", teams: ["backend"], releaseDate: "2026-09-23" }).success).toBe(false);
    expect(createReleaseSchema.safeParse({ title: "x", teams: [], releaseDate: "2026-09-23" }).success).toBe(false);
    expect(createReleaseSchema.safeParse({ title: "x", teams: ["backend"], releaseDate: "2026-02-30" }).success).toBe(false);
    expect(createReleaseSchema.safeParse({ title: "x", teams: ["qa"], releaseDate: "2026-09-23" }).success).toBe(false);
    expect(createReleaseSchema.safeParse({ title: "x", teams: ["backend"], releaseDate: "2026-09-23", status: "released" }).success).toBe(false);
  });

  it("does not accept the date, releasedAt or released status through a normal edit", () => {
    expect(updateReleaseSchema.safeParse({ currentDate: "2026-10-01" }).success).toBe(false);
    expect(updateReleaseSchema.safeParse({ releasedAt: new Date().toISOString() }).success).toBe(false);
    expect(updateReleaseSchema.safeParse({ status: "released" }).success).toBe(false);
  });
});

describe("move release", () => {
  it("updates the current date and records A → B in history", async () => {
    const r = await create();
    const moved = await move(r.id, "2026-10-07", "Dependencies not ready");
    expect(moved.currentDate).toBe("2026-10-07");
    const history = await service.history(r.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      previousDate: "2026-09-23",
      newDate: "2026-10-07",
      reason: "Dependencies not ready",
      changedBy: "tester",
    });
  });

  it("keeps every move: A → B → C produces two history records", async () => {
    const r = await create();
    await move(r.id, "2026-10-07");
    await move(r.id, "2026-10-22");
    const history = await service.history(r.id);
    expect(history.map((h) => [h.previousDate, h.newDate])).toEqual([
      ["2026-09-23", "2026-10-07"],
      ["2026-10-07", "2026-10-22"],
    ]);
    expect((await service.get(r.id)).currentDate).toBe("2026-10-22");
  });

  it("rejects moving to the same date and moving released/cancelled releases", async () => {
    const r = await create();
    await expect(move(r.id, "2026-09-23")).rejects.toBeInstanceOf(DomainError);
    await service.markReleased(r.id, {});
    await expect(move(r.id, "2026-10-01")).rejects.toMatchObject({ status: 409 });
    expect(await service.history(r.id)).toHaveLength(0);
  });

  it("does not let history rows be edited or deleted, even directly in the database", async () => {
    const r = await create();
    await move(r.id, "2026-10-07");
    await expect(prisma.releaseScheduleChange.updateMany({ data: { reason: "rewritten" } })).rejects.toThrow(/immutable/);
    await expect(prisma.releaseScheduleChange.deleteMany({})).rejects.toThrow(/immutable/);
    expect(await service.history(r.id)).toHaveLength(1);
  });

  it("serialises concurrent moves so no previous date is lost", async () => {
    const r = await create();
    await Promise.all([move(r.id, "2026-10-01"), move(r.id, "2026-10-02")]);
    const history = await service.history(r.id);
    expect(history).toHaveLength(2);
    // The second move must start from where the first one landed.
    expect(history[1].previousDate).toBe(history[0].newDate);
  });
});

describe("mark released / cancel / reopen", () => {
  it("sets status and the actual release time without touching the scheduled date", async () => {
    const r = await create({ releaseDate: "2026-10-07" });
    const releasedAt = "2026-10-08T09:15:00.000Z";
    const released = await service.markReleased(r.id, { releasedAt }, new Date("2026-10-09T00:00:00Z"));
    expect(released).toMatchObject({ status: "released", releasedAt, currentDate: "2026-10-07" });
  });

  it("rejects a release time in the future", async () => {
    const r = await create();
    await expect(
      service.markReleased(r.id, { releasedAt: "2030-01-01T00:00:00Z" }, new Date("2026-10-01T00:00:00Z")),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("cancels without deleting the release or its history, and can reopen it", async () => {
    const r = await create();
    await move(r.id, "2026-10-07");
    const cancelled = await service.cancel(r.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelledAt).not.toBeNull();
    expect(await service.history(r.id)).toHaveLength(1);
    expect(await prisma.release.count()).toBe(1);

    const reopened = await service.reopen(r.id);
    expect(reopened).toMatchObject({ status: "planned", cancelledAt: null, currentDate: "2026-10-07" });
  });

  it("flags open releases whose date has passed as overdue", async () => {
    await create({ releaseDate: "2020-01-01" });
    const future = await create({ title: "Later", releaseDate: "2099-01-01" });
    const overdue = await service.list({ status: [], needsUpdate: true });
    expect(overdue.map((r) => r.title)).toEqual(["HDR Service Release"]);
    expect(overdue[0].isOverdue).toBe(true);
    expect((await service.get(future.id)).isOverdue).toBe(false);
  });
});

describe("list filters", () => {
  it("filters by status, team, date range and title", async () => {
    await create({ title: "Alpha", teams: ["backend"], releaseDate: "2026-09-10" });
    const beta = await create({ title: "Beta", teams: ["ai"], releaseDate: "2026-10-10" });
    await service.markReleased(beta.id, {});

    expect((await service.list({ status: ["released"], needsUpdate: false })).map((r) => r.title)).toEqual(["Beta"]);
    expect((await service.list({ status: [], team: "backend", needsUpdate: false })).map((r) => r.title)).toEqual(["Alpha"]);
    expect((await service.list({ status: [], from: "2026-10-01", to: "2026-10-31", needsUpdate: false })).map((r) => r.title)).toEqual(["Beta"]);
    expect((await service.list({ status: [], q: "alp", needsUpdate: false })).map((r) => r.title)).toEqual(["Alpha"]);
  });
});
