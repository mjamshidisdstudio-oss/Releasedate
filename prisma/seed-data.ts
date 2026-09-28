import type { ReleaseStatus, ReleaseType, Team } from "../src/lib/domain";

/**
 * Initial roadmap migrated from the static "Sprint 85–90 Release Calendar" HTML.
 * Order matters: releases are created in this order, which is also their order inside a day.
 */

export interface SeedRelease {
  title: string;
  description: string;
  teams: Team[];
  type: ReleaseType;
  status: ReleaseStatus;
  /** Current scheduled date (Gregorian ISO). */
  date: string;
  dueBefore?: boolean;
  /** Earlier scheduled dates in order, oldest first. The last move goes to `date`. */
  previousDates?: string[];
}

// Jalali → Gregorian for the dates used below (1405):
// 27 Mordad = 2026-08-18, 2 Shahrivar = 08-24, 4 Shahrivar = 08-26, 9 Shahrivar = 08-31,
// 11 Shahrivar = 09-02, 17 Shahrivar = 09-08, 18 Shahrivar = 09-09, 22 Shahrivar = 09-13,
// 24 Shahrivar = 09-15, 25 Shahrivar = 09-16, 29 Shahrivar = 09-20, 1 Mehr = 09-23,
// 15 Mehr = 10-07, 30 Mehr = 10-22, 3 Aban = 10-25.

export const SEED_RELEASES: SeedRelease[] = [
  // Past items that the static calendar still showed as planned: confirmed shipped.
  { title: "Upscale Release", description: "Dynamic upscale modes for download flow.", teams: ["backend", "frontend"], type: "feature", status: "released", date: "2026-08-18" },
  { title: "Ideation Center SEO", description: "SEO landing updates before 2 Shahrivar.", teams: ["frontend"], type: "improvement", status: "released", date: "2026-08-24", dueBefore: true },
  { title: "Region Limitation", description: "Guest flow login rule for limited-credit regions.", teams: ["backend"], type: "feature", status: "released", date: "2026-08-24", dueBefore: true },
  { title: "Dispatcher Priority for Masa", description: "Masa priority + legacy V1/V2 API handling.", teams: ["backend"], type: "infrastructure", status: "released", date: "2026-08-26" },
  { title: "Landing Pages Bundle", description: "B2B, Pricing, Home, Affiliate, Before/After.", teams: ["frontend"], type: "improvement", status: "released", date: "2026-08-26" },

  // 9 Shahrivar — released
  { title: "Sample Images", description: "Sample inputs for generate flow.", teams: ["backend"], type: "feature", status: "released", date: "2026-08-31" },
  { title: "Single-Image One-Click", description: "Run One-Click on one selected image.", teams: ["backend"], type: "feature", status: "released", date: "2026-08-31" },
  { title: "Generation / Asset Suppressor", description: "Hide selected generations or assets from users.", teams: ["backend"], type: "back_office", status: "released", date: "2026-08-31" },
  { title: "Workspace V5.0 Launch", description: "Workspace release after bug fixes and design match.", teams: ["frontend"], type: "product_launch", status: "released", date: "2026-08-31" },

  // 11 Shahrivar — released
  { title: "Back Office Updates Bundle", description: "Edit-chat prompt, process text fix, custom eval task.", teams: ["frontend"], type: "back_office", status: "released", date: "2026-09-02" },

  // 17 Shahrivar — released earlier than its 22 Shahrivar target
  { title: "Workspace V5.2 Full Rollout", description: "A/B test removed and Workspace V5.2 fully rolled out.", teams: ["frontend"], type: "product_launch", status: "released", date: "2026-09-08", previousDates: ["2026-09-13"] },

  // 24 Shahrivar
  { title: "Dynamic Registry Launch", description: "Dynamic Registry launch.", teams: ["backend"], type: "infrastructure", status: "planned", date: "2026-09-15", previousDates: ["2026-09-02"] },
  { title: "Back Office Updates for Evaluation and Dynamic Registry", description: "Back Office updates for evaluation workflows and Dynamic Registry management.", teams: ["frontend"], type: "back_office", status: "planned", date: "2026-09-15", previousDates: ["2026-09-09"] },
  { title: "Unified Login & Signup Flow", description: "Merge login and signup into one entry flow and route users to the correct next step.", teams: ["backend", "frontend"], type: "feature", status: "planned", date: "2026-09-15", previousDates: ["2026-09-16"] },

  // 29 Shahrivar — Social Pack went 29 → 25 → back to 29
  { title: "Social Pack Release", description: "Frontend release of the Social Pack.", teams: ["frontend"], type: "feature", status: "planned", date: "2026-09-20", previousDates: ["2026-09-20", "2026-09-16"] },
  { title: "Workspace V5.2 Improvements", description: "New frontend improvements for Workspace V5.2.", teams: ["frontend"], type: "improvement", status: "planned", date: "2026-09-20" },
  { title: "AIHD LAB", description: "Frontend release of AIHD LAB.", teams: ["frontend"], type: "product_launch", status: "planned", date: "2026-09-20" },

  // 15 Mehr
  { title: "HDR Service Release", description: "HDR service release, including the multi-input foundation required for the HDR flow.", teams: ["backend", "frontend"], type: "feature", status: "planned", date: "2026-10-07", previousDates: ["2026-09-13"] },
  { title: "Smart Upload Processing for Duplicate, Multi-Angle and HDR Bundling", description: "Analyze uploaded images and detect duplicates, multi-angle sets, and HDR bundles.", teams: ["backend", "frontend"], type: "feature", status: "planned", date: "2026-10-07", previousDates: ["2026-09-23"] },
  { title: "Interior Design with Reference Photo", description: "Release Interior Design generation with a reference image as an additional input.", teams: ["backend", "frontend"], type: "feature", status: "planned", date: "2026-10-07", previousDates: ["2026-09-23"] },
  { title: "Multi-Angle Service", description: "Release the Multi-Angle service for grouped views of the same space.", teams: ["backend", "frontend"], type: "feature", status: "planned", date: "2026-10-07", previousDates: ["2026-09-23"] },

  // 30 Mehr
  { title: "Auto Evaluator", description: "Release Auto Evaluator as part of the generation and evaluation workflow.", teams: ["backend", "ai"], type: "ai_model", status: "planned", date: "2026-10-22", previousDates: ["2026-09-23"] },
];

/** Two-week sprints. Transitions: 2 Shahrivar (86), 16 Shahrivar (87), 30 Shahrivar (88), 13 Mehr (89), 27 Mehr (90). */
export const SEED_SPRINTS = [
  { number: 85, startDate: "2026-08-10", endDate: "2026-08-23" },
  { number: 86, startDate: "2026-08-24", endDate: "2026-09-06" },
  { number: 87, startDate: "2026-09-07", endDate: "2026-09-20" },
  { number: 88, startDate: "2026-09-21", endDate: "2026-10-04" },
  { number: 89, startDate: "2026-10-05", endDate: "2026-10-18" },
  { number: 90, startDate: "2026-10-19", endDate: "2026-11-01" },
];

export const SEED_EVENTS = [
  { title: "Madrid Event", date: "2026-10-25", type: "company_event" as const, description: "Madrid event milestone." },
];
