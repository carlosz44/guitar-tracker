import { AUTH_ERROR_NOT_ALLOWLISTED } from "@ds/shared";
import { expect, test } from "@playwright/test";
import { es } from "../../apps/web/src/i18n/es";

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("001 AC-1: a signed-out visit is sent to the login page", async ({ page }) => {
    await page.goto("/today");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: es.login.signIn })).toBeVisible();
  });

  test("001 AC-3: an account outside the allowlist sees the access denied page", async ({
    page,
  }) => {
    await page.goto(`/login?error=${AUTH_ERROR_NOT_ALLOWLISTED}`);
    await expect(page).toHaveURL(/\/access-denied$/);
    await expect(page.getByRole("heading", { name: es.accessDenied.title })).toBeVisible();
  });
});
