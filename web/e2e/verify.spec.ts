import { expect, test } from "@playwright/test";

test("verify credential page has form", async ({ page }) => {
  await page.goto("/verify");
  await expect(page.getByRole("heading", { name: /verify a credential/i })).toBeVisible();
  await expect(page.getByLabel(/credential code/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^verify$/i })).toBeVisible();
});
