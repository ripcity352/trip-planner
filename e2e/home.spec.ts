import { test, expect } from "@playwright/test";

test("home page loads and shows app title", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Plan the trip without the group-chat chaos.",
    })
  ).toBeVisible();
});
