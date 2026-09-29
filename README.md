# Releasedate

Release Management (Back Office) + a public, data-driven **Release Calendar**.

- `/`: public, read-only release calendar (horizontal, sprint markers, holidays, moved history, Executive Summary)
- `/admin`: Back Office to create, edit, move, release, cancel and reopen releases, and manage sprints, events and Iran official holidays
- `/admin/calendar` (the Back Office home): Google Calendar–style month grid (Jalali or Gregorian months, Sunday → Saturday weeks).
  Click a day, or drag across several, to add a release, event, sprint or holiday with the dates filled in. Click any item to open,
  edit or deactivate it. Drag a release to another day to **Move** it (recorded in history, reason optional); drag an event to change its date.

The database is the only source of truth. The calendar is rebuilt from the API on every load.

## Stack

Next.js 16 (App Router, route handlers) · TypeScript · PostgreSQL · Prisma 6 · Zod · Vitest · Playwright.
Jalali dates come from the built-in `Intl` Persian calendar, with no extra date library.

## Run locally

```bash
cp .env.example .env              # set DATABASE_URL / SESSION_SECRET
npm install
npx prisma migrate deploy         # create tables (+ immutability trigger)
npx prisma db seed                # default admin + migrated roadmap (idempotent)
npm run dev                       # http://localhost:3000
```

Default admin: **`admin` / `Admin@1405!`**. Override it with `ADMIN_USERNAME` / `ADMIN_PASSWORD` before the first seed.
You can change the password at `/admin/account`.

## Deploy (Docker)

```bash
SESSION_SECRET=$(openssl rand -hex 32) docker compose up -d --build
```

On start, the container runs `prisma migrate deploy` and the idempotent seed, then `next start` on port 3000.
Put it behind HTTPS. If it is served over plain HTTP, set `COOKIE_SECURE=false`, otherwise the login cookie is not kept.

## Data model

| Table | Purpose |
|---|---|
| `releases` | A release: title, description, type, status (`planned`/`ready`/`released`/`cancelled`/`blocked`), `current_release_date` (DATE, Tehran business date), `releasedAt` (UTC, actual release), `dueBefore`, `createdBy` |
| `release_teams` | Release ↔ team (`backend`, `frontend`, `ai`, `product`, `design`, `marketing`) |
| `release_schedule_history` | **Append-only** log of every move: `previousDate`, `newDate`, `reason`, `changedBy`, `changedAt`. A DB trigger rejects `UPDATE`/`DELETE`; a CHECK forbids same-date moves. |
| `sprints` | Sprint number + start/end. Transition markers ("Sprint 87 → 88") are derived from start dates. |
| `calendar_events` | Company events (e.g. Madrid Event) |
| `holidays` | Iran official holidays (1405 seeded). Friday/Saturday weekends are computed, not stored. |
| `admin_users` | Back Office users (scrypt password hashes) |

Sprints, events and holidays are deactivated (archived), never hard-deleted. Releases are cancelled, never deleted.

## Key behaviour

- **Move** (`POST /api/releases/:id/move`) locks the row, appends `old → new` to history, then updates the current date. The only way to change a date is a move; `PATCH` rejects date fields.
- **Calendar**: each earlier date of a release gets one faded, dashed **Moved → current date** card. A date the release is scheduled on again (A → B → A) only shows the active card.
- **Mark Released** sets `status=released` and `releasedAt`. The scheduled date is never changed.
- **Overdue**: an open release (`planned`/`ready`/`blocked`) whose date has passed is flagged *Overdue* (derived, not stored) in the calendar and Back Office until someone marks it released, moves it or cancels it.
- **Reopen** undoes a mistaken release/cancel. History is untouched.

## API

| Method | Path | Auth |
|---|---|---|
| GET | `/api/release-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` | public |
| GET / POST | `/api/releases` (filters: `status`, `team`, `from`, `to`, `q`, `needsUpdate`) | admin |
| GET / PATCH | `/api/releases/:id` | admin |
| POST | `/api/releases/:id/move` · `/release` · `/cancel` · `/reopen` | admin |
| GET | `/api/releases/:id/history` | admin |
| GET / POST, PUT / PATCH(archive) | `/api/sprints`, `/api/events`, `/api/holidays` (+ `/:id`) | admin |
| POST | `/api/auth/login` · `/logout` · `/password` | – / session |

Mutations require an admin session cookie, a same-origin request and a JSON body.

## Tests

```bash
npm test                  # Vitest: calendar rules (unit) + services against a real Postgres (TEST_DATABASE_URL)
npm run test:e2e          # Playwright: seeded calendar + create → move → release flow in the browser
```

The integration and E2E tests **truncate** the database behind `TEST_DATABASE_URL`, which defaults to `releasedate_test` on localhost. Never point it at production.
If Playwright's bundled browser is missing, set `PLAYWRIGHT_CHROMIUM_PATH` to a local Chromium.

## Holidays for future years

`prisma/data/iran-official-holidays-1405.json` holds 1405 (21 Mar 2026 – 20 Mar 2027). Lunar holidays from Aban 1405 onward come from the pre-printed official calendar and can shift by a day. Add or fix dates in **Back Office → Holidays**.
