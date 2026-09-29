/** Enums and labels shared by server, admin UI and calendar. Mirrors prisma/schema.prisma. */

export const TEAMS = ["backend", "frontend", "ai", "product", "design", "marketing"] as const;
export type Team = (typeof TEAMS)[number];

export const TEAM_LABELS: Record<Team, string> = {
  backend: "Backend",
  frontend: "Frontend",
  ai: "AI",
  product: "Product",
  design: "Design",
  marketing: "Marketing",
};

export const RELEASE_STATUSES = ["planned", "ready", "released", "cancelled", "blocked"] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export const STATUS_LABELS: Record<ReleaseStatus, string> = {
  planned: "Planned",
  ready: "Ready",
  released: "Released",
  cancelled: "Cancelled",
  blocked: "Blocked",
};

/** Statuses a release can be set to through a normal edit. Released/cancelled have dedicated actions. */
export const EDITABLE_STATUSES = ["planned", "ready", "blocked"] as const satisfies readonly ReleaseStatus[];

/** Still waiting to ship: if its date has passed, it needs attention. */
export const OPEN_STATUSES: readonly ReleaseStatus[] = ["planned", "ready", "blocked"];

export const RELEASE_TYPES = [
  "feature",
  "improvement",
  "infrastructure",
  "experiment",
  "product_launch",
  "ai_model",
  "back_office",
  "other",
] as const;
export type ReleaseType = (typeof RELEASE_TYPES)[number];

export const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
  feature: "Feature",
  improvement: "Improvement",
  infrastructure: "Infrastructure",
  experiment: "Experiment",
  product_launch: "Product Launch",
  ai_model: "AI / Model",
  back_office: "Back Office",
  other: "Other",
};

export const EVENT_TYPES = ["company_event", "milestone", "other"] as const;
export type CalendarEventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  company_event: "Company event",
  milestone: "Milestone",
  other: "Other",
};

export function sortTeams(teams: readonly Team[]): Team[] {
  return [...teams].sort((a, b) => TEAMS.indexOf(a) - TEAMS.indexOf(b));
}

/** Card colour class: a single team uses its own palette, several teams use the "multi" palette. */
export function cardTone(teams: readonly Team[]): Team | "multi" {
  return teams.length === 1 ? teams[0] : "multi";
}
