import { z } from "zod";
import { isIsoDate } from "@/lib/dates";
import { EDITABLE_STATUSES, EVENT_TYPES, RELEASE_STATUSES, RELEASE_TYPES, TEAMS } from "@/lib/domain";

export const isoDate = z.string().refine(isIsoDate, { message: "Expected a date in YYYY-MM-DD format" });

const title = z.string().trim().min(1, "Title cannot be empty").max(200);
const description = z.string().trim().max(5000).nullish().transform((v) => (v ? v : null));
const teams = z
  .array(z.enum(TEAMS))
  .min(1, "At least one team is required")
  .refine((list) => new Set(list).size === list.length, { message: "Teams must be unique" });

export const createReleaseSchema = z
  .object({
    title,
    description,
    type: z.enum(RELEASE_TYPES).default("feature"),
    teams,
    releaseDate: isoDate,
    dueBefore: z.boolean().default(false),
    status: z.enum(EDITABLE_STATUSES).default("planned"),
  })
  .strict();

/**
 * Date, releasedAt and released/cancelled status are deliberately not editable here.
 * A missing description leaves it unchanged; null or "" clears it.
 */
export const updateReleaseSchema = z
  .object({
    title: title.optional(),
    description: z
      .string()
      .trim()
      .max(5000)
      .nullish()
      .transform((v) => (v === undefined ? undefined : v || null)),
    type: z.enum(RELEASE_TYPES).optional(),
    teams: teams.optional(),
    dueBefore: z.boolean().optional(),
    status: z.enum(EDITABLE_STATUSES).optional(),
  })
  .strict();

export const moveReleaseSchema = z
  .object({
    newDate: isoDate,
    reason: z.string().trim().max(1000).nullish().transform((v) => (v ? v : null)),
  })
  .strict();

export const markReleasedSchema = z
  .object({
    releasedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export const listReleasesSchema = z.object({
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter(Boolean) : []))
    .pipe(z.array(z.enum(RELEASE_STATUSES))),
  team: z.enum(TEAMS).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(200).optional(),
  needsUpdate: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  hidden: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export const hideReleaseSchema = z.object({ hidden: z.boolean() }).strict();

const MAX_RANGE_DAYS = 370;

export const calendarRangeSchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((r) => r.from <= r.to, { message: "`from` must not be after `to`" })
  .refine(
    (r) => (new Date(r.to).getTime() - new Date(r.from).getTime()) / 86_400_000 <= MAX_RANGE_DAYS,
    { message: `Range cannot exceed ${MAX_RANGE_DAYS} days` },
  );

export const sprintSchema = z
  .object({
    number: z.number().int().positive(),
    name: z.string().trim().max(100).nullish().transform((v) => (v ? v : null)),
    startDate: isoDate,
    endDate: isoDate,
  })
  .strict()
  .refine((s) => s.startDate <= s.endDate, { message: "End date must be on or after start date", path: ["endDate"] });

export const eventSchema = z
  .object({
    title,
    date: isoDate,
    type: z.enum(EVENT_TYPES).default("company_event"),
    description,
  })
  .strict();

export const holidaySchema = z
  .object({
    date: isoDate,
    name: z.string().trim().min(1, "Name cannot be empty").max(200),
  })
  .strict();

export const archiveSchema = z.object({ archived: z.boolean() }).strict();

export const loginSchema = z.object({ username: z.string().trim().min(1), password: z.string().min(1) }).strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(10, "Use at least 10 characters").max(200),
  })
  .strict();

export const createUserSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(2, "Username needs at least 2 characters")
      .max(50)
      .regex(/^[A-Za-z0-9._-]+$/, "Use letters, digits, dot, dash or underscore"),
    displayName: z.string().trim().min(1, "Display name cannot be empty").max(100),
    password: z.string().min(10, "Use at least 10 characters").max(200),
  })
  .strict();

export const createTokenSchema = z.object({ name: z.string().trim().min(1, "Give the token a name").max(100) }).strict();

export const revokeTokenSchema = z.object({ revoked: z.literal(true) }).strict();
