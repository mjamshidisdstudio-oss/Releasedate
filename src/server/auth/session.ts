import { cookies } from "next/headers";
import { prisma } from "../db";
import { DomainError } from "../errors";
import type { Actor } from "../releases";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from "./token";
import { verifyPassword } from "./password";

/** Returns the logged-in admin, or null. Checks the user still exists. */
export async function currentAdmin(): Promise<Actor | null> {
  const store = await cookies();
  const payload = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const user = await prisma.adminUser.findUnique({ where: { id: payload.sub }, select: { id: true, username: true } });
  return user;
}

export async function requireAdmin(): Promise<Actor> {
  const admin = await currentAdmin();
  if (!admin) throw new DomainError(401, "unauthorized", "Admin login required");
  return admin;
}

export async function login(username: string, password: string): Promise<Actor | null> {
  const user = await prisma.adminUser.findUnique({ where: { username } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession({ sub: user.id, username: user.username }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return { id: user.id, username: user.username };
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
