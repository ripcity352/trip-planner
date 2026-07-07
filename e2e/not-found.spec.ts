import { test, expect } from "@playwright/test";

// #F7 — the on-voice 404 surface. Covers both entry points that hit
// `app/not-found.tsx`: an unmatched URL, and (indirectly, same render
// path) the cross-trip `notFound()` denial on every `/trips/[tripId]/*`
// page. This spec only needs the unmatched-URL case to prove the file
// wires up — no auth required.
test("unmatched URL renders the on-voice 404 copy + back-to-trips CTA", async ({
  page,
}) => {
  await page.goto("/nonexistent");

  await expect(
    page.getByRole("heading", { name: "Nothing here." })
  ).toBeVisible();
  await expect(
    page.getByText("Whatever you were looking for isn't at this link.")
  ).toBeVisible();

  const backLink = page.getByRole("link", { name: "Back to your trips" });
  await expect(backLink).toBeVisible();
  await expect(backLink).toHaveAttribute("href", "/trips");
});
