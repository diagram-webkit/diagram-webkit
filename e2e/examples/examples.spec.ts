import { expect, test, type Page } from "@playwright/test";
import { PORTS } from "../../playwright.config";
import { listenerCounts, waitReady } from "../helpers";

async function open(page: Page, port: number): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${port}/`);
  await waitReady(page);
  return errors;
}

test("direct--embed-minimal: a hand-written SVG with tooltips and no UI", async ({ page }) => {
  const errors = await open(page, PORTS.embedMinimal);
  expect(errors).toEqual([]);
  const info = await page.evaluate(() => ({
    ui: document.querySelectorAll(".filter-panel, .floating-filter-toggle, .footer-link").length,
    help: document.querySelectorAll(".dwk-main-image [data-help]").length,
    tags: (window as any).diagram.tags().map((tag: { tag: string }) => tag.tag).sort(),
    levels: (window as any).diagram.levels(),
    search: location.search,
  }));
  expect(info).toEqual({ ui: 0, help: 2, tags: ["Data", "Network"], levels: { max: 1 }, search: "" });
  await page.hover('.dwk-main-image [data-slug="Server"]');
  await expect(page.locator(".tooltip-box", { hasText: "Answers from its database." })).toBeVisible();
});

test("via--custom-hooks: help, tag labels, about and footer come from the hooks", async ({ page }) => {
  const errors = await open(page, PORTS.customHooks);
  expect(errors).toEqual([]);
  // First visit: the About text, through renderAbout.
  await expect(page.locator(".custom-about-note")).toBeVisible();
  await page.locator(".dwk-close-help-dialog").click();
  await page.locator('[data-slug="DbAccess"] rect').hover({ force: true });
  const tooltip = page.locator(".tooltip-box", { hasText: "Database access" });
  await expect(tooltip.locator("li")).toHaveText(["Only the web app may connect.", "Credentials come from a secret store."]);
  expect(await tooltip.locator(".annotation-tag-badge").allTextContents()).toContain("Data");
  await expect(page.locator(".custom-footer")).toContainText("diagram-webkit");
  const badges = page.locator(".tooltip-box", { hasText: "Load balancer" }).locator(".annotation-tag-badge");
  expect(await badges.allTextContents()).toEqual(expect.arrayContaining(["Info", "Network", "Ingress"]));
  const labels = await page.evaluate(() => (window as any).diagram.tags().map((tag: { tag: string; label: string }) => [tag.tag, tag.label]));
  expect(labels).toContainEqual(["Network.Ingress", "Ingress"]);
});

test("via--multi-instance: three views side by side, independent, and destroy leaves the rest", async ({ page }) => {
  const errors = await open(page, PORTS.multiInstance);
  expect(errors).toEqual([]);
  const views = await page.evaluate(() => (window as any).instances.map((instance: any) => instance.getState().view));
  expect(views[0]).toMatchObject({ level: 0 });
  expect(views[1]).toMatchObject({ level: 1, pins: ["LoadBalancer"] });
  // Level 2 is the highest, the default: not in the state.
  expect(views[2]).toMatchObject({ hiddenTags: ["Observability"] });

  const before = await listenerCounts(page);
  const after = await page.evaluate(async () => {
    const [first, second, third] = (window as any).instances;
    await second.setState({ view: { theme: "dark", level: 0 } });
    first.destroy();
    return {
      themes: [second.root.dataset.theme, third.root.dataset.theme],
      levels: [second.getState().view.level, third.getState().view.level],
      roots: document.querySelectorAll(".dwk-root").length,
    };
  });
  expect(after).toEqual({ themes: ["dark", "light"], levels: [0, undefined], roots: 2 });
  expect(await listenerCounts(page)).toEqual(before);
});
