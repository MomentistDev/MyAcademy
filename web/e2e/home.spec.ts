import { expect, test } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /corporate learning/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /verify credential/i })).toBeVisible();
});
