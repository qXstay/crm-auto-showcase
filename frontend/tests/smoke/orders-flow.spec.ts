import { test, expect } from "@playwright/test";
import { loginAsSmokeUser } from "./support";

/**
 * Smoke: order creation flow — validates that the cashier screen loads,
 * service catalog appears, and basic interactions don't crash.
 */

test.describe("Orders flow smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSmokeUser(page);
  });

  test("orders/new page loads", async ({ page }) => {
    await page.goto("/orders/new");
    await expect(page.locator("main")).toBeVisible({ timeout: 10_000 });

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Application error");
    expect(bodyText).not.toContain("Internal Server Error");
  });

  test("orders page loads with editor", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.locator("main")).toBeVisible({ timeout: 10_000 });

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Application error");
    expect(bodyText).not.toContain("Internal Server Error");
  });

  test("complete button shows a visible reason for invalid order", async ({ page }) => {
    await page.goto("/orders?mode=anonymous");
    await expect(page.locator("main")).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("div:visible", { hasText: "Услуги ещё не выбраны" }).first(),
    ).toBeVisible({ timeout: 10_000 });

    const completeButton = page.locator("button:visible", { hasText: "Выполнить" }).last();
    await expect(completeButton).toBeVisible();
    await completeButton.dispatchEvent("click");

    await expect(
      page.getByText("Добавьте хотя бы одну услугу, чтобы выполнить заказ.").first(),
    ).toBeVisible();
  });

  test("orders list page loads", async ({ page }) => {
    await page.goto("/orders/list");
    await expect(page.locator("main")).toBeVisible({ timeout: 10_000 });

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Application error");
    expect(bodyText).not.toContain("Internal Server Error");
  });
});
