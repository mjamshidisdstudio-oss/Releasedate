import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "./auth/session";
import { DomainError, invalid, notFound } from "./errors";
import type { Actor } from "./releases";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(id: string, what: string): string {
  if (!UUID_RE.test(id)) throw notFound(what);
  return id;
}

/** Wraps a route handler: maps domain/validation errors to JSON responses. */
export function handle<C>(fn: (req: NextRequest, ctx: C) => Promise<unknown>) {
  return async (req: NextRequest, ctx: C): Promise<NextResponse> => {
    try {
      const result = await fn(req, ctx);
      return result instanceof NextResponse ? result : NextResponse.json(result ?? { ok: true });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof DomainError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "invalid",
          message: error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "),
          details: error.issues,
        },
      },
      { status: 400 },
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json({ error: { code: "conflict", message: "A record with these values already exists" } }, { status: 409 });
  }
  console.error(error);
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 });
}

/**
 * Admin-only mutation guard: requires a session, a same-origin request and a JSON body.
 * SameSite=Lax cookies plus the JSON content type keep cross-site form posts out.
 */
export async function requireAdminMutation(req: NextRequest): Promise<Actor> {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && new URL(origin).host !== host) {
    throw new DomainError(403, "forbidden", "Cross-origin request rejected");
  }
  return requireAdmin();
}

export async function readJson<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.output<S>> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    throw new DomainError(415, "unsupported_media_type", "Expected application/json");
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw invalid("Request body is not valid JSON");
  }
  return schema.parse(body);
}

export function readQuery<S extends z.ZodType>(req: NextRequest, schema: S): z.output<S> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}
