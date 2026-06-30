import { expect, type Page } from "@playwright/test";

export const SMOKE_PHONE = process.env.SMOKE_PHONE || "9000000001";
export const SMOKE_PIN = process.env.SMOKE_PIN || "1234";

export async function loginAsSmokeUser(page: Page) {
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
  await page.waitForURL(/\/(shift|orders)/, { timeout: 15_000 });
}
