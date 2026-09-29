import { createHash, randomBytes } from "node:crypto";
import type { ApiToken, AdminUser, PrismaClient } from "@prisma/client";
import type { z } from "zod";
import { prisma as defaultPrisma } from "./db";
import { conflict, notFound } from "./errors";
import { hashPassword } from "./auth/password";
import type { Actor } from "./releases";
import type { createTokenSchema, createUserSchema } from "./validation";

/**
 * Back Office users and their personal API tokens (used by the MCP endpoint).
 * A token acts as its owner, so moves and new releases made through it are recorded under that user.
 */

export const TOKEN_PREFIX = "rdt_";
/** Only refresh lastUsedAt once a minute, so busy clients don't write on every call. */
const LAST_USED_RESOLUTION_MS = 60_000;

export interface AdminUserDTO {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
}

export interface ApiTokenDTO {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const toUserDTO = (u: AdminUser): AdminUserDTO => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  createdAt: u.createdAt.toISOString(),
});

const toTokenDTO = (t: ApiToken): ApiTokenDTO => ({
  id: t.id,
  name: t.name,
  prefix: t.prefix,
  createdAt: t.createdAt.toISOString(),
  lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
  revokedAt: t.revokedAt?.toISOString() ?? null,
});

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export class AccessService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  // --- Users ---------------------------------------------------------------

  async listUsers(): Promise<AdminUserDTO[]> {
    const rows = await this.db.adminUser.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map(toUserDTO);
  }

  async createUser(input: z.output<typeof createUserSchema>): Promise<AdminUserDTO> {
    const taken = await this.db.adminUser.findFirst({ where: { username: { equals: input.username, mode: "insensitive" } } });
    if (taken) throw conflict(`Username "${input.username}" is taken`);
    const user = await this.db.adminUser.create({
      data: { username: input.username, displayName: input.displayName, passwordHash: await hashPassword(input.password) },
    });
    return toUserDTO(user);
  }

  // --- API tokens ----------------------------------------------------------

  async listTokens(owner: Actor): Promise<ApiTokenDTO[]> {
    const rows = await this.db.apiToken.findMany({ where: { adminUserId: owner.id }, orderBy: { createdAt: "desc" } });
    return rows.map(toTokenDTO);
  }

  /** Returns the plain token once; only its hash is stored. */
  async createToken(owner: Actor, input: z.output<typeof createTokenSchema>): Promise<{ token: string; apiToken: ApiTokenDTO }> {
    const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
    const row = await this.db.apiToken.create({
      data: { name: input.name, tokenHash: hashToken(token), prefix: token.slice(0, TOKEN_PREFIX.length + 6), adminUserId: owner.id },
    });
    return { token, apiToken: toTokenDTO(row) };
  }

  async revokeToken(owner: Actor, id: string): Promise<ApiTokenDTO> {
    const row = await this.db.apiToken.findFirst({ where: { id, adminUserId: owner.id } });
    if (!row) throw notFound("Token");
    if (row.revokedAt) return toTokenDTO(row);
    return toTokenDTO(await this.db.apiToken.update({ where: { id }, data: { revokedAt: new Date() } }));
  }

  /** Resolves an `Authorization: Bearer rdt_…` header to the token's owner, or null. */
  async authenticate(authorization: string | null, now = new Date()): Promise<Actor | null> {
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);
    if (!match || !match[1].startsWith(TOKEN_PREFIX)) return null;
    const row = await this.db.apiToken.findUnique({
      where: { tokenHash: hashToken(match[1]) },
      include: { adminUser: { select: { id: true, username: true } } },
    });
    if (!row || row.revokedAt) return null;
    if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
      await this.db.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
    }
    return { id: row.adminUser.id, username: row.adminUser.username };
  }
}

export const accessService = new AccessService();
