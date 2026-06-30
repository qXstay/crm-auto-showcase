import { test, expect } from "@playwright/test";
import { loginAsSmokeUser, SMOKE_PHONE, SMOKE_PIN } from "./support";

/**
 * Smoke: login → shift page loads with backend data.
 * Validates the most basic critical path.
 */

test.describe("Login → Shift smoke", () => {
  test("login with valid credentials redirects to shift", async ({ page }) => {
    await page.goto("/login");
    const phoneInput = page.getByRole("textbox", { name: /Телефон/ });
    await expect(phoneInput).toBeVisible({
      timeout: 10_000,
    });

    await phoneInput.fill(SMOKE_PHONE);
    await page.getByRole("button", { name: "Войти" }).click();

    const pinInput = page.getByRole("textbox", { name: "PIN" });
    await expect(pinInput).toBeVisible({ timeout: 10_000 });
    await pinInput.fill(SMOKE_PIN);
    await page.getByRole("button", { name: "Войти" }).click();

    // Should redirect to /shift or dashboard
    await page.waitForURL(/\/(shift|orders)/, { timeout: 15_000 });
  });

  test("shift page renders without crash", async ({ page }) => {
    await loginAsSmokeUser(page);
    await page.goto("/shift");
    await expect(page.locator("main")).toBeVisible({ timeout: 10_000 });

    // Should not show error boundary or blank page
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Application error");
    expect(bodyText).not.toContain("Internal Server Error");
  });
});
