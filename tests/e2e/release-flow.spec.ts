import { expect, test } from "@playwright/test";

test("calendar renders the seeded roadmap from the backend", async ({ page }) => {
  await page.goto("/?from=2026-08-18&to=2026-10-25");
  await expect(page.getByRole("heading", { name: "Sprint 85–90 Release Calendar" })).toBeVisible();

  const sept13 = page.locator('[data-date="2026-09-13"]');
  await expect(sept13.getByTestId("moved-card")).toHaveCount(2);
  await expect(sept13.getByTestId("release-card")).toHaveCount(0);

  await expect(page.locator('[data-date="2026-10-07"]').getByTestId("release-card")).toHaveCount(4);
  await expect(page.locator('[data-date="2026-09-21"] .sprint-ribbon')).toHaveText("Sprint 87 → 88");
  await expect(page.locator('[data-date="2026-10-25"]').getByTestId("event-card")).toContainText("Madrid Event");
  await expect(page.getByRole("heading", { name: "Executive Summary" })).toBeVisible();
});

test("create → move → mark released in the Back Office updates the calendar", async ({ page }) => {
  await page.goto("/admin/releases");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("Admin@1405!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Release Management", level: 1 })).toBeVisible();

  // Create
  await page.getByRole("button", { name: "+ New Release" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Release title").fill("E2E Release");
  await dialog.getByLabel("Release date").fill("2026-10-12");
  await dialog.getByLabel("Backend").check();
  await dialog.getByLabel("AI", { exact: true }).check();
  await dialog.getByRole("button", { name: "Create release" }).click();
  const row = page.getByTestId("release-row").filter({ hasText: "E2E Release" });
  await expect(row).toContainText("20 Mehr");

  // Move
  await row.getByRole("button", { name: "Move" }).click();
  await dialog.getByLabel("New date").fill("2026-10-14");
  await dialog.getByLabel("Reason").fill("Waiting for model eval");
  await dialog.getByRole("button", { name: "Move release" }).click();
  await expect(row).toContainText("22 Mehr");
  await expect(row).toContainText("Moved from 20 Mehr");

  // History
  await row.getByRole("button", { name: "History" }).click();
  await expect(dialog).toContainText("20 Mehr → 22 Mehr");
  await expect(dialog).toContainText("Waiting for model eval");
  await expect(dialog).toContainText("Changed by admin");
  await dialog.getByRole("button", { name: "Close" }).click();

  // Calendar: faded card on the old date, active card on the new date
  await page.goto("/?from=2026-10-10&to=2026-10-16");
  const oldCard = page.locator('[data-date="2026-10-12"]').getByTestId("moved-card");
  await expect(oldCard).toContainText("E2E Release");
  await expect(oldCard).toContainText("→ 22 Mehr");
  expect(Number(await oldCard.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.5);
  const newCard = page.locator('[data-date="2026-10-14"]').getByTestId("release-card");
  await expect(newCard).toContainText("E2E Release");
  expect(Number(await newCard.evaluate((el) => getComputedStyle(el).opacity))).toBe(1);

  // Mark released keeps the scheduled date
  await page.goto("/admin/releases");
  await row.getByRole("button", { name: "Mark Released" }).click();
  await dialog.getByRole("button", { name: "Mark released" }).click();
  await expect(row.locator(".pill.released")).toBeVisible();
  await expect(row).toContainText("22 Mehr");

  // Reload: everything is rebuilt from the backend
  await page.goto("/?from=2026-10-10&to=2026-10-16");
  await expect(page.locator('[data-date="2026-10-14"]').getByTestId("release-card")).toContainText("Released");
});

test("mutations are rejected without an admin session", async ({ request }) => {
  const res = await request.post("/api/releases", {
    data: { title: "x", teams: ["backend"], releaseDate: "2026-10-01" },
  });
  expect(res.status()).toBe(401);
});
