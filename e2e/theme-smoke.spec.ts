import { test, expect } from "@playwright/test";

/**
 * Theme binding smoke test — asserts the bachelor design system tokens
 * are wired on the HTML element before any component code ships.
 *
 * These assertions are intentionally shallow: they verify the CSS layer
 * (data-theme binding + token values), not any component behaviour.
 */
test.describe("bachelor theme binding", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/smoke", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main h1")).toBeVisible();
  });

  test("html background-color resolves to #100c0f", async ({ page }) => {
    const bgColor = await page.evaluate(() => {
      const html = document.documentElement;
      return window.getComputedStyle(html).backgroundColor;
    });

    // getComputedStyle returns rgb(...). Convert #100c0f → rgb(16, 12, 15)
    expect(bgColor).toBe("rgb(16, 12, 15)");
  });

  test("--accent-heat resolves to #ff6a3d", async ({ page }) => {
    const accentHeat = await page.evaluate(() => {
      return window
        .getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-heat")
        .trim();
    });

    expect(accentHeat).toBe("#ff6a3d");
  });

  test("h1 font-family includes Fraunces", async ({ page }) => {
    // Use "main h1" to avoid dev overlay h1 elements (Sentry toolbar, Next.js UI)
    const fontFamily = await page.evaluate(() => {
      const h1 = document.querySelector("main h1");
      if (!h1) return "";
      return window.getComputedStyle(h1).fontFamily;
    });

    expect(fontFamily.toLowerCase()).toContain("fraunces");
  });

  test("data-theme attribute is set to bachelor on <html>", async ({ page }) => {
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );

    expect(theme).toBe("bachelor");
  });
});
