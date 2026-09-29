import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { prisma } from "@/server/db";
import { AccessService } from "@/server/access";
import { createMcpServer } from "@/server/mcp";
import type { Actor } from "@/server/releases";
import { createTokenSchema, createUserSchema } from "@/server/validation";
import { createActor, resetDatabase } from "./helpers";

const access = new AccessService(prisma);
let actor: Actor;

beforeEach(async () => {
  await resetDatabase();
  actor = await createActor("sara");
});

afterAll(() => prisma.$disconnect());

describe("users", () => {
  it("creates users with unique (case-insensitive) usernames", async () => {
    await access.createUser(createUserSchema.parse({ username: "omid", displayName: "Omid", password: "0123456789" }));
    await expect(
      access.createUser(createUserSchema.parse({ username: "OMID", displayName: "x", password: "0123456789" })),
    ).rejects.toMatchObject({ status: 409 });
    expect((await access.listUsers()).map((u) => u.username)).toEqual(["sara", "omid"]);
  });

  it("rejects bad usernames and short passwords", () => {
    expect(createUserSchema.safeParse({ username: "a b", displayName: "x", password: "0123456789" }).success).toBe(false);
    expect(createUserSchema.safeParse({ username: "ab", displayName: "x", password: "short" }).success).toBe(false);
  });
});

describe("API tokens", () => {
  it("stores only a hash, authenticates as the owner and stops working once revoked", async () => {
    const { token, apiToken } = await access.createToken(actor, createTokenSchema.parse({ name: "laptop" }));
    expect(token).toMatch(/^rdt_[A-Za-z0-9_-]{43}$/);
    const row = await prisma.apiToken.findUniqueOrThrow({ where: { id: apiToken.id } });
    expect(row.tokenHash).not.toContain(token.slice(4));

    expect(await access.authenticate(`Bearer ${token}`)).toEqual({ id: actor.id, username: "sara" });
    expect((await prisma.apiToken.findUniqueOrThrow({ where: { id: apiToken.id } })).lastUsedAt).not.toBeNull();
    expect(await access.authenticate(`Bearer ${token}x`)).toBeNull();
    expect(await access.authenticate(null)).toBeNull();

    await access.revokeToken(actor, apiToken.id);
    expect(await access.authenticate(`Bearer ${token}`)).toBeNull();
  });

  it("only lets owners see and revoke their own tokens", async () => {
    const other = await createActor("omid");
    const { apiToken } = await access.createToken(other, { name: "omid's" });
    expect(await access.listTokens(actor)).toEqual([]);
    await expect(access.revokeToken(actor, apiToken.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("MCP tools", () => {
  const connect = async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createMcpServer(actor).connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    return client;
  };
  const text = (result: Awaited<ReturnType<Client["callTool"]>>) => (result.content as { text: string }[])[0].text;

  it("creates, updates and moves releases as the token owner, keeping history and descriptions", async () => {
    const client = await connect();
    const created = JSON.parse(
      text(await client.callTool({ name: "create_releases", arguments: { releases: [{ title: "HDR", release_date: "2026-10-07", teams: ["backend"], description: "keep" }] } })),
    );
    const id = created.created[0].id;
    expect(created.created[0]).toMatchObject({ date: "2026-10-07", jalali: "15 Mehr 1405" });

    await client.callTool({ name: "update_release", arguments: { id, status: "ready" } });
    await client.callTool({ name: "move_release", arguments: { id, new_date: "2026-10-14", reason: "QA" } });
    const full = JSON.parse(text(await client.callTool({ name: "get_release", arguments: { id } })));
    expect(full).toMatchObject({ description: "keep", status: "ready", currentDate: "2026-10-14", createdBy: "sara" });
    expect(full.history).toEqual([expect.objectContaining({ from: "2026-10-07", to: "2026-10-14", reason: "QA", by: "sara" })]);
  });

  it("returns app rule violations as tool errors", async () => {
    const client = await connect();
    await client.callTool({ name: "save_sprint", arguments: { number: 88, start_date: "2026-09-21", end_date: "2026-10-04" } });
    const overlap = await client.callTool({ name: "save_sprint", arguments: { number: 89, start_date: "2026-10-01", end_date: "2026-10-14" } });
    expect(overlap.isError).toBe(true);
    expect(text(overlap)).toBe("Dates overlap Sprint 88");
  });

  it("updates only the given fields of a sprint", async () => {
    const client = await connect();
    const sprint = JSON.parse(
      text(await client.callTool({ name: "save_sprint", arguments: { number: 88, name: "Launch", start_date: "2026-09-21", end_date: "2026-10-04" } })),
    );
    const updated = JSON.parse(text(await client.callTool({ name: "save_sprint", arguments: { id: sprint.id, end_date: "2026-10-05" } })));
    expect(updated).toMatchObject({ number: 88, name: "Launch", startDate: "2026-09-21", endDate: "2026-10-05" });
  });
});
