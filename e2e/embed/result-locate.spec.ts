import { expect, test } from "@playwright/test";
import { waitReady, settle } from "../helpers";

// features.resultLocate "hover" on the full app (e2e/pages/app.html); the
// default "click" is covered by F14 in e2e/features.
test.use({ viewport: { width: 1440, height: 900 } });

test('resultLocate "hover": hovering a result shows the element, and the entry does not glow', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("basic-diagram-about", "seen"));
  await page.goto("/app.html?locate=hover&menu=true");
  await waitReady(page);
  const results = page.locator(".filter-results");
  await expect(results).toHaveAttribute("data-locate", "hover");
  const entry = page.locator(".filter-result-item", { has: page.getByText("Load balancer", { exact: true }) });
  await entry.hover();
  await expect(page.locator(".filter-highlight-line-layer.active")).toHaveCount(1);
  await settle(page, 200);
  expect(await entry.evaluate((element) => getComputedStyle(element, "::before").content)).toBe("none");
});

test("resultLocate rejects unknown values", async ({ page }) => {
  await page.goto("/app.html?locate=sometimes");
  await page.waitForFunction(() => Boolean(document.body.dataset.error));
  expect(await page.evaluate(() => document.body.dataset.error)).toContain('resultLocate: expected "click" or "hover"');
});
