import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { settle } from "../helpers";

// F1-F27 on examples/direct--basic-diagram, app preset.
const EXAMPLE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../examples/direct--basic-diagram");
const NS = "basic-diagram";
const ENGINE_VERSION: string = JSON.parse(fs.readFileSync(path.resolve(EXAMPLE, "../../packages/diagram-webkit/package.json"), "utf8")).version;

test.use({ viewport: { width: 1440, height: 900 } });

async function open(page: Page, search = "", { seenAbout = true } = {}) {
  if (seenAbout) await page.addInitScript((ns) => localStorage.setItem(`${ns}-about`, "seen"), NS);
  await page.goto(`/${search}`);
  await page.waitForFunction(() => Boolean((window as any).diagram));
  await settle(page, 200);
}

const transform = (page: Page) =>
  page.evaluate(() => document.querySelector<HTMLElement>(".dwk-main-image")!.style.transform.match(/matrix\(([^)]+)\)/)![1].split(",").map(Number));
const search = (page: Page) => page.evaluate(() => location.search);
const state = (page: Page) => page.evaluate(() => (window as any).diagram.getState());
const visible = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const element = document.querySelector<SVGElement>(sel);
    return Boolean(element && element.style.display !== "none" && element.style.opacity !== "0");
  }, selector);

test("F1 load, debug source and aspect ratio", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await open(page, "?debug");
  const svg = await page.evaluate(() => {
    const element = document.querySelector(".dwk-main-image svg")!;
    const image = document.querySelector<HTMLElement>(".dwk-main-image")!;
    return { par: element.getAttribute("preserveAspectRatio"), ratio: image.offsetWidth / image.offsetHeight };
  });
  expect(errors).toEqual([]);
  expect(svg.par).toBe("xMinYMin meet");
  expect(svg.ratio).toBeCloseTo(712 / 292, 2);
});

test("F2 loading and error overlays", async ({ page }) => {
  await page.route(/example-.*\.svg$/, (route) => route.fulfill({ status: 404, body: "missing" }));
  await page.goto("/");
  await expect(page.locator(".dwk-error-overlay")).toBeVisible();
  await expect(page.locator(".dwk-error-overlay")).toContainText("HTTP 404");
  await expect(page.locator(".dwk-loading")).toHaveCount(0);
  await page.locator(".dwk-error-close").click();
  await expect(page.locator(".dwk-error-overlay")).toHaveCount(0);
});

test("F3 wheel zoom at the pointer, drag", async ({ page }) => {
  await open(page);
  const pointer = { x: 600, y: 400 };
  const anchor = await page.evaluate(([x, y]) => {
    const svg = document.querySelector<SVGSVGElement>(".dwk-main-image svg")!;
    const point = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: point.x, y: point.y };
  }, [pointer.x, pointer.y]);
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.wheel(0, -300);
  await settle(page);
  const after = await page.evaluate(([x, y]) => {
    const svg = document.querySelector<SVGSVGElement>(".dwk-main-image svg")!;
    const point = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!);
    return { x: point.x, y: point.y };
  }, [anchor.x, anchor.y]);
  expect(Math.abs(after.x - pointer.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.y - pointer.y)).toBeLessThanOrEqual(2);
  const before = await transform(page);
  await page.mouse.down();
  await page.mouse.move(pointer.x - 50, pointer.y - 20, { steps: 4 });
  await page.mouse.up();
  const dragged = await transform(page);
  expect(dragged[4] - before[4]).toBeCloseTo(-50, 0);
});

test("F3 touch pan and pinch", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await open(page);
  const cdp = await context.newCDPSession(page);
  const touch = (type: string, points: { x: number; y: number }[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((point, id) => ({ ...point, id })) });
  const zoomBefore = (await transform(page))[0];
  await touch("touchStart", [{ x: 150, y: 400 }, { x: 250, y: 400 }]);
  for (let step = 1; step <= 5; step += 1) await touch("touchMove", [{ x: 150 - step * 20, y: 400 }, { x: 250 + step * 20, y: 400 }]);
  await touch("touchEnd", []);
  await settle(page);
  expect((await transform(page))[0]).toBeGreaterThan(zoomBefore * 1.5);
  const panBefore = await transform(page);
  await touch("touchStart", [{ x: 200, y: 400 }]);
  await touch("touchMove", [{ x: 170, y: 380 }]);
  await touch("touchMove", [{ x: 140, y: 360 }]);
  await touch("touchEnd", []);
  await settle(page);
  const panAfter = await transform(page);
  expect(panAfter[4]).not.toBeCloseTo(panBefore[4], 0);
  await context.close();
});

test("F4 cover default, fit-all, overhang clamp", async ({ page }) => {
  await open(page);
  expect((await transform(page))[0]).toBe(1);
  await page.keyboard.press("0");
  await settle(page);
  expect(await page.evaluate(() => document.querySelector(".dwk-root")!.classList.contains("diagram-fit-all"))).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".dwk-root")!).backgroundColor)).toBe("rgb(0, 0, 0)");
  // A drag far past the edge stops at a bounded overhang.
  await open(page);
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.mouse.move(3000, 3000, { steps: 6 });
  await page.mouse.up();
  await settle(page);
  const box = await page.locator(".dwk-main-image").boundingBox();
  expect(box!.x).toBeLessThan(1440 / 2);
  expect(box!.y).toBeLessThan(900 / 2);
});

test("F5 pan indicators", async ({ page }) => {
  await open(page);
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, -600);
  await settle(page);
  expect(await page.locator(".pan-indicator.active").count()).toBeGreaterThan(0);
});

test("F6 go-to centres and pulses", async ({ page }) => {
  await open(page, "?menu=true");
  await page.locator(".filter-result-item", { hasText: "Cache" }).first().click();
  await expect(page.locator(".mobile-go-to-indicator")).toHaveCount(1);
  await settle(page, 300);
  const center = await page.evaluate(() => {
    const rect = document.querySelector('[data-slug="Cache"] rect')!.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  const panel = await page.locator(".filter-panel").boundingBox();
  expect(center.x).toBeGreaterThan(0);
  expect(center.x).toBeLessThan(panel!.x);
});

test("F7 v= link, arming and single-pin centering", async ({ page }) => {
  await open(page, "?pins=Cache");
  await settle(page, 600);
  expect(await search(page)).toBe("?pins=Cache");
  await page.mouse.move(400, 400);
  await page.mouse.wheel(0, -200);
  await settle(page, 700);
  expect(await search(page)).toMatch(/^\?pins=Cache&v=[\d.]+,[\d.]+,[\d.]+,[\d.]+$/);
});

test("F8 tooltips, pin button, badges, severity", async ({ page }) => {
  await open(page);
  await page.locator('[data-slug="DbAccess"] rect').hover({ force: true });
  const tooltip = page.locator(".svg-property-tooltip.severity-pri-1");
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator(".tooltip-head")).toHaveText("Database access");
  await expect(tooltip.locator(".annotation-tag-badge")).toHaveText(["Priority 1", "Data"]);
  await tooltip.locator('[data-role="tooltip-pin"]').click();
  await settle(page, 600);
  expect(await search(page)).toBe("?pins=DbAccess");
  await expect(page.locator(".pin-indicator")).toHaveCount(1);
});

test("F8 mobile tooltip sheet", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await open(page, "?v=fit");
  await page.locator('[data-slug="WebApp"] rect').tap({ force: true });
  await expect(page.locator(".tooltip-box.mobile-tooltip")).toBeVisible();
  expect(await page.evaluate(() => document.querySelector(".dwk-root")!.classList.contains("mobile-tooltip-open"))).toBe(true);
  await context.close();
});

test("F9 slug validation", () => {
  const output = execFileSync("npx", ["diagram-webkit", "validate", "example.svg", "--definition", "definition.js"], { cwd: EXAMPLE, encoding: "utf8" });
  expect(output).toContain("0 errors");
  const broken = path.join(EXAMPLE, "node_modules", ".broken.svg");
  fs.writeFileSync(broken, fs.readFileSync(path.join(EXAMPLE, "example.svg"), "utf8").replace('data-slug="Cache"', 'data-slug="WebApp"'));
  let failed = "";
  try {
    execFileSync("npx", ["diagram-webkit", "validate", broken], { cwd: EXAMPLE, encoding: "utf8" });
  } catch (error: any) {
    failed = error.stdout;
  }
  fs.rmSync(broken);
  expect(failed).toContain("duplicate-slug");
});

test("F10 tag model: groups, levels, disableHelpIfHidden", async ({ page }) => {
  await open(page, "?filter-hide-tags=Data");
  await settle(page, 300);
  expect(await visible(page, '[data-slug="DbAccess"]')).toBe(false);
  expect(await visible(page, '[data-slug="WebApp"]')).toBe(true);
  await open(page, "?filter-level=1");
  await settle(page, 300);
  expect(await visible(page, '[data-slug="Cache"]')).toBe(false);
  expect(await visible(page, '[data-slug="LoadBalancer"]')).toBe(true);
});

test("F11 tag descriptions", async ({ page }) => {
  await open(page, "?menu=true&tags=open");
  await page.locator(".tag-tree-row", { hasText: "Observability" }).hover();
  await expect(page.locator(".tag-description-tooltip")).toContainText("logs");
});

test("F12 level slider and tag tree", async ({ page }) => {
  await open(page, "?menu=true&tags=open");
  await expect(page.locator(".level-filter-value")).toHaveText("Level max");
  await page.locator(".level-filter-slider").fill("0");
  await expect(page.locator(".level-filter-value")).toHaveText("Level 0");
  await page.locator(".level-filter-slider").fill("2");
  await page.locator(".tag-tree-toggle", { hasText: "Network" }).click();
  await settle(page, 300);
  await expect(page.locator(".tag-tree-toggle", { hasText: "Ingress" })).toBeDisabled();
  await expect(page.locator(".tag-tree-header .tag-tree-meta")).toHaveText("5 tags · 1 hidden");
  await page.locator(".tag-tree-bulk-btn", { hasText: "Invert" }).click();
  await expect(page.locator(".tag-tree-header .tag-tree-meta")).toHaveText("5 tags · 4 hidden");
  await page.locator(".tag-tree-bulk-btn", { hasText: "Show all" }).click();
  await settle(page, 600);
  expect(await search(page)).toBe("?menu=true&tags=open");
  await page.locator(".tag-tree-filter").fill("cach");
  await expect(page.locator(".tag-tree-node:not([hidden]) > .tag-tree-row")).toHaveCount(2);
});

test("F13 search, keyboard cursor, pinned section, hidden reason", async ({ page }) => {
  await open(page, "?menu=true&pins=Cache");
  await page.locator(".dwk-filter-search-input").fill("stateless");
  await expect(page.locator(".dwk-filter-result-count")).toHaveText('1 match for "stateless"');
  await expect(page.locator(".pinned-results-header strong")).toHaveText("Pinned (1)");
  await page.locator(".level-filter-slider").fill("1");
  await expect(page.locator(".pinned-results-list .filter-result-state")).toBeVisible();
  const item = page.locator(".filter-result-item:not(.is-inactive)", { hasText: "Web app" });
  await item.focus();
  await page.keyboard.press("Enter");
  await expect(item).toHaveAttribute("aria-current", "true");
});

test("F14 result line and highlight", async ({ page }) => {
  await open(page, "?menu=true");
  await page.locator(".filter-result-item", { has: page.getByText("Load balancer", { exact: true }) }).hover();
  await expect(page.locator(".filter-highlight-line-layer.active")).toHaveCount(1);
  expect(await page.evaluate(() => document.querySelector('[data-slug="LoadBalancer"]')!.classList.contains("help-highlight"))).toBe(true);
});

test("F15 pins, rings, normalization; constraint is no longer read", async ({ page }) => {
  await open(page, "?pins=Cache,Nope&constraint=pinned");
  await settle(page, 600);
  expect(await search(page)).toBe("?pins=Cache&constraint=pinned");
  await expect(page.locator(".pin-indicator")).toHaveCount(1);
  expect(await visible(page, '[data-slug="WebApp"]')).toBe(true);
  expect(await visible(page, '[data-slug="Cache"]')).toBe(true);
});

test("F16 panel dock, overlay, backdrop, outside click, reset", async ({ page }) => {
  await open(page);
  await page.locator(".dwk-floating-filter-toggle").click();
  await settle(page, 600);
  expect(await page.evaluate(() => document.querySelector(".dwk-root")!.className)).toContain("filter-docked-open");
  await page.locator(".dwk-filter-search-input").fill("zzz");
  await page.locator(".dwk-filter-reset-btn").click();
  await expect(page.locator(".dwk-filter-search-input")).toHaveValue("");
  await page.setViewportSize({ width: 600, height: 800 });
  await settle(page, 600);
  expect(await page.evaluate(() => document.querySelector(".dwk-root")!.className)).toContain("filter-overlay-open");
  await expect(page.locator(".filter-panel-backdrop.open")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await settle(page, 300);
  expect((await state(page)).ui.panelOpen).toBeUndefined();
});

test("F17 theme and persistence", async ({ page }) => {
  await open(page, "?menu=true");
  await page.locator(".dwk-floating-theme-toggle").click();
  expect(await page.evaluate(() => document.querySelector<HTMLElement>(".dwk-root")!.dataset.theme)).toBe("dark");
  expect(await page.evaluate((ns) => localStorage.getItem(`${ns}-theme`), NS)).toBe("dark");
  await page.reload();
  await page.waitForFunction(() => Boolean((window as any).diagram));
  expect(await page.evaluate(() => document.querySelector<HTMLElement>(".dwk-root")!.dataset.theme)).toBe("dark");
});

test("F18 user annotations", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await open(page, "?menu=true");
  await page.locator(".dwk-toggle-user-annotations").click();
  await expect(page.locator(".dwk-user-annotations-modal")).toBeVisible();
  await page.locator(".dwk-inline-title").fill("Hot path");
  await page.locator(".dwk-inline-description").fill("<b>busy</b><img src=x onerror=alert(1)>");
  await expect(page.locator(".dwk-inline-description-preview")).toContainText("busy");
  expect(await page.locator(".dwk-inline-description-preview img").count()).toBe(0);
  await page.locator(".dwk-place-annotation-btn").click();
  await page.mouse.click(300, 500);
  await settle(page, 400);
  await expect(page.locator(".area-annotation")).toHaveCount(1);
  expect(await search(page)).toContain("annotations=");
  expect((await state(page)).view.annotations[0]).toMatchObject({ title: "Hot path", type: "area-info", shape: "rectangle" });
  await expect(page.locator(".dwk-exit-edit-mode")).toBeVisible();
  await page.locator(".dwk-exit-edit-mode").click();

  await page.locator(".dwk-toggle-user-annotations").click();
  await page.locator(".dwk-mode-arrow").click();
  await page.locator(".dwk-place-annotation-btn").click();
  await page.mouse.click(300, 300);
  await page.mouse.click(420, 360);
  await settle(page, 400);
  await expect(page.locator(".arrow-annotation")).toHaveCount(1);

  await page.locator(".dwk-toggle-user-annotations").click();
  await expect(page.locator(".user-annotation-item")).toHaveCount(2);
  await page.locator(".dwk-clear-all-annotations").click();
  await settle(page, 300);
  expect(await search(page)).not.toContain("annotations=");
});

test("F19 hotkeys and ? modal", async ({ page }) => {
  await open(page);
  const start = await transform(page);
  await page.keyboard.press("ArrowRight");
  expect((await transform(page))[4]).toBeLessThan(start[4]);
  await page.keyboard.press("+");
  expect((await transform(page))[0]).toBeGreaterThan(1);
  await page.keyboard.press("?");
  await expect(page.locator(".dwk-help-panel-shortcuts")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".dwk-help-dialog")).toBeHidden();
  await page.keyboard.press("/");
  await expect(page.locator(".dwk-filter-search-input")).toBeFocused();
});

test("F20 link variants and URL parameter docs", async ({ page }) => {
  await open(page, "?menu=true&filter-hide-tags=Data&foo=1");
  await page.locator(".dwk-filter-search-input").blur();
  await page.keyboard.press("?");
  await expect(page.locator(".dwk-link-info-variants strong")).toHaveText(["Current", "Without hidden tags", "Clean"]);
  await expect(page.locator(".dwk-link-info-params .link-info-param-name")).toHaveText(["menu", "filter-hide-tags", "foo"]);
});

test("F21 about modal on first visit", async ({ page }) => {
  await open(page, "", { seenAbout: false });
  await expect(page.locator(".dwk-help-panel-about")).toBeVisible();
  await page.locator(".dwk-close-help-dialog").click();
  await expect(page.locator(".dwk-help-dialog")).toBeHidden();
  expect(await page.evaluate((ns) => localStorage.getItem(`${ns}-about`), NS)).toBe("seen");
});

test("F22 footer", async ({ page }) => {
  await open(page);
  await expect(page.locator(".footer-github a")).toHaveText("diagram-webkit");
  await expect(page.locator(".footer-meta .version")).toHaveCount(0);
  // The footer "?" opens the help dialog on its first tab, About here.
  await page.locator(".dwk-help-toggle").click();
  await expect(page.locator(".dwk-help-panel-about")).toBeVisible();
  await expect(page.locator(".help-tab:not([hidden])")).toHaveText(["About", "Share", "URL parameters", "Controls"]);
  // The version moved from the footer into the dialog.
  // The site's own version (footer.version in the example's definition).
  await expect(page.locator(".help-dialog-meta")).toContainText("Basic web service diagram v0.1.0");
  await expect(page.locator(".help-dialog-meta")).toContainText(`Built with diagram-webkit v${ENGINE_VERSION}`);
  // About: a header, the definition's text, then the facts it has.
  await expect(page.locator(".about-name")).toHaveText("Basic diagram");
  await expect(page.locator(".about-facts dt")).toHaveText(["Version", "Built with"]);
});

test("F23 head and noscript", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Basic diagram");
  expect(await page.locator('meta[name="description"]').getAttribute("content")).toBe("Example diagram for diagram-webkit.");
  const html = fs.readFileSync(path.join(EXAMPLE, "dist/index.html"), "utf8");
  expect(html).toContain("<title>Basic diagram</title>");
});

test("F24 readable commas", async ({ page }) => {
  await open(page, "?pins=WebApp,Cache");
  await settle(page, 600);
  expect(await search(page)).toBe("?pins=Cache,WebApp");
});

test("F25 container height variable", async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => document.querySelector<HTMLElement>(".dwk-root")!.style.getPropertyValue("--mobile-vh"))).toBe("900px");
});

test("F26 custom classes from tags", async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => document.querySelector('[data-slug="DbAccess"]')!.classList.contains("custom-pri-1"))).toBe(true);
});

test("F27 copy as slide", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // An authoring tool: only offered with ?debug.
  await open(page, "?pins=Cache&filter-level=1&v=0.5,0.5,0.4,0.4");
  await page.keyboard.press("?");
  await expect(page.locator('[data-role="copy-slide"]')).toHaveCount(0);
  await open(page, "?pins=Cache&filter-level=1&v=0.5,0.5,0.4,0.4&debug");
  await page.keyboard.press("?");
  await page.locator('.help-tab[data-tab="links"]').click();
  await page.locator('[data-role="copy-slide"]').click();
  await expect(page.locator('[data-role="copy-slide"]')).toHaveText("Copied");
  const snippet = await page.evaluate(() => navigator.clipboard.readText());
  expect(snippet).toBe(
    `<section data-diagram-state='{"camera":{"rect":[0.5,0.5,0.4,0.4]},"level":1,"pins":["Cache"]}'>\n  <div data-diagram-slot data-prevent-swipe></div>\n</section>`,
  );
});

test("F28 focus on topics: row button, dim others, URL, hiding drops it, reset", async ({ page }) => {
  await open(page, "?menu=true&tags=open");
  const row = page.locator(".tag-tree-row", { has: page.locator('.tag-filter-btn[data-tag="Data"]') });
  const focusBtn = row.locator(".tag-focus-btn");
  const dim = page.locator(".tag-tree-dim-btn");
  const reset = page.locator(".tag-tree-header-row .tag-tree-link");
  await expect(dim).toBeDisabled();
  await expect(reset).toBeHidden();
  // Row actions show on hover, and stay while on.
  await expect(focusBtn).toBeHidden();
  await row.hover();
  await expect(focusBtn).toHaveText("focus");
  const before = await transform(page);
  await focusBtn.click();
  await settle(page, 1200);
  expect(await search(page)).toContain("focus=Data");
  expect(await transform(page)).not.toEqual(before);
  expect((await state(page)).view.focus).toEqual({ tags: ["Data"] });
  expect(await page.locator(".dwk-highlight-target").count()).toBeGreaterThan(0);
  await page.mouse.move(10, 10);
  await expect(focusBtn).toBeVisible();
  await expect(reset).toBeVisible();
  // Only topic tags get a focus button.
  await expect(page.locator(".tag-group-buttons .tag-focus-btn")).toHaveCount(0);

  await expect(dim).toBeEnabled();
  await dim.click();
  await settle(page, 300);
  expect(await search(page)).toContain("focus-mode=dim-others");
  await expect(page.locator(".dwk-root")).toHaveClass(/dwk-dim-others/);
  await expect(dim).toHaveClass(/active/);

  // Reset clears the focus and its effect with the rest of the tag state.
  await reset.click();
  await settle(page, 300);
  expect(await search(page)).not.toContain("focus");
  await expect(page.locator(".dwk-root")).not.toHaveClass(/dwk-dim-others/);
  await expect(dim).toBeDisabled();

  // Hiding a focused topic drops its focus.
  await row.hover();
  await focusBtn.click();
  await settle(page, 1000);
  await page.locator('.tag-tree .tag-filter-btn[data-tag="Data"]').click();
  await settle(page, 300);
  expect(await search(page)).not.toContain("focus=");
});

test("F29 focus from the URL fits the camera and writes v", async ({ page }) => {
  await open(page, "?focus=Data.Cache&focus-mode=dim-others&menu=true&tags=open");
  await settle(page, 600);
  expect((await state(page)).view.focus).toEqual({ tags: ["Data.Cache"], mode: "dim-others" });
  const written = await search(page);
  expect(written).toMatch(/v=[\d.]+,[\d.]+,[\d.]+,[\d.]+/);
  // The same as focusing after load.
  const viaApi = await page.evaluate(async () => {
    const diagram = (window as any).diagram;
    await diagram.setState({ view: { camera: { focus: { tags: ["Data.Cache"] } } } });
    return diagram.serialize("url");
  });
  expect(new URLSearchParams(written).get("v")).toBe(new URLSearchParams(viaApi).get("v"));
});
