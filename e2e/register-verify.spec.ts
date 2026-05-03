/**
 * Smoke test: participant registers → receives OTP via devProvider → verifies → success.
 *
 * Prerequisites:
 *   - A seeded LIVE activation with slug matching SMOKE_ACTIVATION_SLUG (default "smoke-test")
 *   - NODE_ENV !== "production" so devProvider is active and /api/dev/otp is reachable
 *   - PARTICIPANT_HOST=localhost:3000 (set by playwright.config.ts webServer env)
 *
 * For staging, set PLAYWRIGHT_BASE_URL=https://mrqlive.co.uk and ensure the
 * dev OTP route is reachable (staging must run with NODE_ENV !== "production").
 */
import { test, expect } from "@playwright/test";

const SLUG = process.env.SMOKE_ACTIVATION_SLUG ?? "smoke-test";
const EMAIL = `playwright+${Date.now()}@example.com`;

test("register → verify → success", async ({ page, request }) => {
  // 1. Land on the activation page.
  await page.goto(`/${SLUG}`);
  await expect(page.getByRole("heading")).not.toBeEmpty();

  // 2. Fill in email and accept consent.
  await page.getByLabel(/email/i).fill(EMAIL);
  const checkbox = page.getByRole("checkbox");
  await checkbox.check();

  // 3. Submit registration.
  await page.getByRole("button", { name: /send me a code/i }).click();

  // 4. Wait for redirect to verify page.
  await page.waitForURL(`/${SLUG}/verify`);

  // 5. Retrieve OTP from the dev endpoint.
  const otpRes = await request.get(`/api/dev/otp?to=${encodeURIComponent(EMAIL)}`);
  expect(otpRes.ok()).toBe(true);
  const { otp } = (await otpRes.json()) as { otp: string };
  expect(otp).toMatch(/^\d{6}$/);

  // 6. Enter OTP into the input slots (input-otp accepts a full paste).
  const otpInput = page.locator("[data-slot='input-otp']");
  await otpInput.fill(otp);

  // 7. Wait for redirect to success page.
  await page.waitForURL(`/${SLUG}/success`);
  await expect(page.getByRole("heading")).toContainText(/registered/i);
});

test("wrong OTP returns error, not a redirect", async ({ page, request }) => {
  const email = `playwright+wrong+${Date.now()}@example.com`;

  await page.goto(`/${SLUG}`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /send me a code/i }).click();
  await page.waitForURL(`/${SLUG}/verify`);

  // Enter a deliberately wrong code.
  const otpInput = page.locator("[data-slot='input-otp']");
  await otpInput.fill("000000");

  await expect(page.getByRole("alert")).toContainText(/incorrect/i);
  expect(page.url()).toContain("/verify");
});
