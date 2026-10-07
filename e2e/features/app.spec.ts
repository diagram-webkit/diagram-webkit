import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { settle } from "../helpers";

// F1-F37 on examples/direct--basic-diagram, app preset.
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

test("F6 hovering an entry rings its element without moving the camera", async ({ page }) => {
  await open(page, "?menu=true");
  const transform = () => page.locator(".dwk-main-image").evaluate((el) => getComputedStyle(el).transform);
  const before = await transform();
  const entries = page.locator(".filter-result-item:not(.is-inactive)");
  const count = await entries.count();
  let ringed = false;
  for (let index = 0; index < count && !ringed; index += 1) {
    await entries.nth(index).hover();
    ringed = (await page.locator(".mobile-go-to-indicator.dwk-pulse-hover").count()) === 1;
  }
  expect(ringed).toBe(true);
  await settle(page, 300);
  expect(await transform()).toBe(before);
  await page.mouse.move(10, 450);
  await expect(page.locator(".mobile-go-to-indicator")).toHaveCount(0);
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

const glow = (entry: ReturnType<Page["locator"]>) => entry.evaluate((element) => getComputedStyle(element, "::before").opacity);

test("F14 results (resultLocate click): hover and focus light the entry, click shows the element", async ({ page }) => {
  await open(page, "?menu=true");
  const entry = page.locator(".filter-result-item", { has: page.getByText("Load balancer", { exact: true }) });
  const before = await transform(page);
  await entry.hover();
  await settle(page, 400);
  expect(await transform(page)).toEqual(before);
  await expect(page.locator(".filter-highlight-line-layer.active")).toHaveCount(0);
  expect(await entry.evaluate((element) => getComputedStyle(element).cursor)).toBe("pointer");
  await expect.poll(() => glow(entry)).toBe("1");
  await page.mouse.move(5, 5);
  await expect.poll(() => glow(entry)).toBe("0");
  await entry.focus();
  await settle(page, 400);
  expect(await transform(page)).toEqual(before);
  await entry.click();
  await expect(page.locator(".filter-highlight-line-layer.active")).toHaveCount(1);
  expect(await page.evaluate(() => document.querySelector('[data-slug="LoadBalancer"]')!.classList.contains("help-highlight"))).toBe(true);
  // Centred at the same zoom.
  const after = await transform(page);
  expect(after).not.toEqual(before);
  expect(after[0]).toBeCloseTo(before[0], 5);
});

test("F14 result focus outline: keyboard only, no flash on a mouse press", async ({ page }) => {
  await open(page, "?menu=true");
  const entry = page.locator(".filter-result-item", { has: page.getByText("Load balancer", { exact: true }) });
  const outline = (locator: ReturnType<Page["locator"]>) => locator.evaluate((element) => getComputedStyle(element).outlineStyle);
  const box = (await entry.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 20);
  await page.mouse.down();
  expect(await page.evaluate(() => document.activeElement!.classList.contains("filter-result-item"))).toBe(true);
  expect(await outline(entry)).toBe("none");
  await page.mouse.up();
  await settle(page, 600);
  await page.locator(".dwk-filter-search-input").focus();
  let focusedOutline = "";
  for (let step = 0; step < 12 && !focusedOutline; step += 1) {
    await page.keyboard.press("Tab");
    focusedOutline = await page.evaluate(() => {
      const active = document.activeElement!;
      return active.classList.contains("filter-result-item") ? getComputedStyle(active).outlineStyle : "";
    });
  }
  expect(focusedOutline).toBe("solid");
});

test("F14 mobile: a tap on a result shows the element", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await open(page, "?menu=true");
  const before = await transform(page);
  const entry = page.locator(".filter-result-item", { has: page.getByText("Load balancer", { exact: true }) });
  expect(await glow(entry)).toBe("0");
  await entry.tap();
  await expect.poll(() => page.evaluate(() => document.querySelector(".dwk-root")!.classList.contains("filter-panel-open"))).toBe(false);
  await settle(page, 600);
  const after = await transform(page);
  expect(after).not.toEqual(before);
  expect(after[0]).toBeCloseTo(before[0], 5);
  expect(await page.evaluate(() => document.querySelector('[data-slug="LoadBalancer"]')!.classList.contains("help-highlight"))).toBe(true);
  await context.close();
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
  await expect(page.locator(".help-tab:not([hidden])")).toHaveText(["About", "Share", "URL parameters", "Controls", "Settings"]);
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
  const reset = page.locator(".tag-tree-header-row .dwk-tag-tree-reset");
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

test("F30 tag picker mode: settings, select, glow, show/hide/focus, make final", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // The menu opens later: in the dock it covers the parts hovered here.
  await open(page, "?tags=open");
  const root = page.locator(".dwk-root");
  const bar = page.locator(".dwk-tag-picker-bar");
  // The diagram itself (focus copies keep the class they were copied with; no glow there).
  const glow = page.locator(".dwk-main-image > svg:first-child .dwk-selected:visible");
  const hidden = async () => (new URLSearchParams(await search(page)).get("filter-hide-tags") || "").split(",").filter(Boolean).sort();
  await expect(bar).toBeHidden();
  await expect(page.locator(".tag-select-btn").first()).toBeHidden();

  await page.locator(".dwk-help-toggle").click();
  await expect(page.locator(".help-tab:not([hidden])").last()).toHaveText("Settings");
  await page.locator('.help-tab[data-tab="settings"]').click();
  await expect(page.locator(".dwk-setting-debug")).toContainText("Open in debug");
  await page.locator('[data-setting="tag-picker"]').check();
  expect(await search(page)).toMatch(/[?&]tag-picker-mode(&|$)/);
  await expect(root).toHaveClass(/dwk-tag-picker-mode/);
  await page.locator(".dwk-close-help-dialog").click();

  // A part's tooltip lists its topics, numbered; priorities and levels are not there.
  await page.locator("#cell-m-lb ellipse, #cell-m-lb rect").first().hover({ force: true });
  const line = page.locator(".svg-property-tooltip .tooltip-picker:visible");
  await expect(line.locator("[data-picker-tag]")).toHaveText(["Network [1]", "Network.Ingress [2]"]);
  await page.keyboard.press("2");
  await settle(page);
  expect(new URLSearchParams(await search(page)).get("tag-picker-mode")).toBe("Network.Ingress");
  await expect(line.locator('[data-picker-tag="Network.Ingress"]')).toHaveClass(/active/);
  expect(await glow.count()).toBeGreaterThan(0);
  expect(await page.locator(".dwk-highlight-target").count()).toBe(0);
  await line.locator('[data-picker-tag="Network"]').click();
  await line.locator('[data-picker-tag="Network"]').click();
  // The glow copies on top do not take the hover from the part below.
  await page.mouse.move(5, 5);
  await expect(line).toHaveCount(0);
  await page.locator("#cell-m-lb ellipse, #cell-m-lb rect").first().hover({ force: true });
  await expect(line).toHaveCount(1);
  expect(new URLSearchParams(await search(page)).get("tag-picker-mode")).toBe("Network.Ingress");

  // Hovering another part replaces the tooltip at once; parts without help
  // text get one with only the topics.
  await page.locator("#cell-logs rect").first().hover({ force: true });
  await expect(page.locator(".dwk-picker-tooltip [data-picker-tag]")).toHaveText(["Observability [1]"]);
  await expect(page.locator(".svg-property-tooltip:not(.dwk-picker-tooltip):visible")).toHaveCount(0);
  await page.mouse.move(5, 5);

  await page.locator(".dwk-floating-filter-toggle").click();
  await settle(page, 400);
  await expect(bar).toBeVisible();

  const dataRow = page.locator(".tag-tree-row", { has: page.locator('.tag-filter-btn[data-tag="Data"]') });
  await dataRow.hover();
  await dataRow.locator(".tag-select-btn").click();
  await settle(page);
  expect(new URLSearchParams(await search(page)).get("tag-picker-mode")).toBe("Network.Ingress,Data");
  await expect(bar.locator(".tag-picker-selection .tooltip-picker-tag")).toHaveText(["Network.Ingress", "Data"]);

  // Opening the menu left search without the cursor; a field that has it
  // gives it up when a tooltip opens, so the digits pick.
  const searchField = page.locator(".dwk-filter-search-input");
  await expect(searchField).not.toBeFocused();
  await searchField.focus();
  await page.locator("#cell-m-cache ellipse, #cell-m-cache rect").first().hover({ force: true });
  await expect(searchField).not.toBeFocused();
  await page.keyboard.press("2");
  await settle(page);
  expect(new URLSearchParams(await search(page)).get("tag-picker-mode")).toBe("Network.Ingress,Data,Data.Cache");
  await expect(searchField).toHaveValue("");
  await page.keyboard.press("2");
  await settle(page);
  expect(new URLSearchParams(await search(page)).get("tag-picker-mode")).toBe("Network.Ingress,Data");
  await page.mouse.move(5, 5);

  await bar.getByRole("button", { name: "Hide others" }).click();
  await settle(page, 300);
  expect(await hidden()).toEqual(["Observability"]);
  expect(await visible(page, "#cell-m-db")).toBe(true);
  expect(await visible(page, "#cell-cache")).toBe(true);

  await bar.getByRole("button", { name: "Hide selected", exact: true }).click();
  await settle(page, 300);
  expect(await hidden()).toEqual(["Data", "Network.Ingress", "Observability"]);
  expect(await visible(page, "#cell-db")).toBe(false);
  expect(await glow.count()).toBe(0);

  await bar.getByRole("button", { name: "Show selected", exact: true }).click();
  await settle(page, 300);
  expect(await hidden()).toEqual(["Observability"]);

  // Focus toggles the focus and leaves the camera alone.
  const focus = bar.locator(".tag-picker-focus");
  const before = await transform(page);
  await expect(focus).toHaveText("Focus selected");
  await focus.click();
  await settle(page, 800);
  expect((await state(page)).view.focus).toEqual({ tags: ["Network.Ingress", "Data"] });
  expect(await transform(page)).toEqual(before);
  await expect(focus).toHaveText("Unfocus selected");
  await focus.click();
  await settle(page, 300);
  expect((await state(page)).view).not.toHaveProperty("focus");
  await focus.click();
  await settle(page, 300);

  // Make final: a summary with checks first; Cancel changes nothing.
  const dialog = page.locator(".dwk-tag-picker-final-modal");
  await bar.getByRole("button", { name: "Make final" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".tag-picker-final-facts")).toContainText("Topics shown4 of 5");
  await expect(dialog.locator(".tag-picker-final-facts")).toContainText("HiddenObservability");
  await expect(dialog.locator(".tag-picker-final-checks")).toContainText("Every selected topic is in focus or hidden.");
  await expect(dialog).toContainText("cannot be undone");
  await dialog.locator(".dwk-tag-picker-copy-backup").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("tag-picker-mode=Network.Ingress,Data");
  await dialog.locator(".dwk-tag-picker-copy-final").click();
  const finalLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(finalLink).not.toContain("tag-picker-mode");
  expect(finalLink).toContain("focus=Network.Ingress,Data");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".dwk-filter-panel")).toHaveAttribute("aria-hidden", "false");
  expect(await search(page)).toContain("tag-picker-mode");

  // An idle selection is pointed out.
  await dataRow.locator("button.tag-tree-caret").click();
  const cacheRow = page.locator(".tag-tree-row", { has: page.locator('.tag-filter-btn[data-tag="Data.Cache"]') });
  await cacheRow.hover();
  await cacheRow.locator(".tag-select-btn").click();
  await bar.getByRole("button", { name: "Make final" }).click();
  await expect(dialog.locator(".tag-picker-final-checks .is-warning")).toContainText("neither in focus nor hidden: Data.Cache");

  await dialog.getByRole("button", { name: "Apply" }).click();
  await settle(page, 300);
  const final = await search(page);
  expect(final).not.toContain("tag-picker-mode");
  expect(final).toContain("focus=Network.Ingress,Data");
  expect(await hidden()).toEqual(["Observability"]);
  await expect(root).not.toHaveClass(/dwk-tag-picker-mode/);
  await expect(bar).toBeHidden();
  expect(await glow.count()).toBe(0);
  await page.locator(".dwk-help-toggle").click();
  await page.locator('.help-tab[data-tab="settings"]').click();
  await expect(page.locator('[data-setting="tag-picker"]')).not.toBeChecked();
});

test("F31 tag picker mode from the URL; debug from Settings; not on touch screens", async ({ page, browser }) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await open(page, "?tag-picker-mode=Data,pri-1,Bogus");
  expect(new URLSearchParams(await search(page)).get("tag-picker-mode")).toBe("Data");
  expect(warnings.some((text) => text.includes("pri-1, Bogus"))).toBe(true);
  expect(await page.locator(".dwk-main-image .dwk-selected").count()).toBeGreaterThan(0);
  expect((await state(page)).view).not.toHaveProperty("focus");

  await page.locator(".dwk-help-toggle").click();
  await page.locator('.help-tab[data-tab="settings"]').click();
  await expect(page.locator('[data-setting="tag-picker"]')).toBeChecked();
  await page.locator('[data-role="debug-toggle"]').click();
  await page.waitForURL(/[?&]debug(&|$)/);
  await page.waitForFunction(() => Boolean((window as any).diagram));
  expect(await search(page)).toContain("tag-picker-mode=Data");
  await page.locator(".dwk-help-toggle").click();
  await page.locator('.help-tab[data-tab="settings"]').click();
  await expect(page.locator('[data-role="debug-toggle"]')).toHaveText("Leave debug");

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, baseURL: test.info().project.use.baseURL });
  const mobile = await phone.newPage();
  await open(mobile, "?tag-picker-mode=Data");
  await expect(mobile.locator(".dwk-root")).not.toHaveClass(/dwk-tag-picker-mode/);
  await mobile.locator(".dwk-help-toggle").tap();
  await mobile.locator('.help-tab[data-tab="settings"]').tap();
  await expect(mobile.locator('[data-setting="tag-picker"]')).toBeDisabled();
  await expect(mobile.locator(".dwk-setting-unavailable")).toBeVisible();
  await phone.close();
});

test("F32 tag picker undo/redo: buttons, keys, tree changes, one step per level drag", async ({ page }) => {
  await open(page, "?tag-picker-mode&menu=true&tags=open");
  const bar = page.locator(".dwk-tag-picker-bar");
  const undo = bar.locator(".tag-picker-undo");
  const redo = bar.locator(".tag-picker-redo");
  const clear = bar.locator(".tag-picker-clear");
  const param = async (name: string) => new URLSearchParams(await search(page)).get(name);
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await expect(clear).toBeDisabled();

  const dataRow = page.locator(".tag-tree-row", { has: page.locator('.tag-filter-btn[data-tag="Data"]') });
  await dataRow.hover();
  await dataRow.locator(".tag-select-btn").click();
  await bar.getByRole("button", { name: "Hide selected", exact: true }).click();
  await settle(page, 300);
  expect(await param("filter-hide-tags")).toBe("Data");
  await expect(undo).toHaveAttribute("title", /hidden topics/);

  await undo.click();
  await settle(page, 300);
  expect(await param("filter-hide-tags")).toBeNull();
  expect(await param("tag-picker-mode")).toBe("Data");
  await undo.click();
  expect(await param("tag-picker-mode")).toBe("");
  await expect(undo).toBeDisabled();
  await redo.click();
  expect(await param("tag-picker-mode")).toBe("Data");
  await page.mouse.move(5, 5);
  await page.keyboard.press("Control+Shift+Z");
  await settle(page, 300);
  expect(await param("filter-hide-tags")).toBe("Data");
  await page.keyboard.press("Control+Z");
  await settle(page, 300);
  expect(await param("filter-hide-tags")).toBeNull();

  // Clear selection is a step too.
  await clear.click();
  expect(await param("tag-picker-mode")).toBe("");
  await undo.click();
  expect(await param("tag-picker-mode")).toBe("Data");

  // Changes in the tree count; a new change drops the redo.
  await page.locator('.tag-tree .tag-filter-btn[data-tag="Observability"]').click();
  await settle(page, 300);
  expect(await param("filter-hide-tags")).toBe("Observability");
  await expect(redo).toBeDisabled();
  await undo.click();
  await settle(page, 300);
  expect(await param("filter-hide-tags")).toBeNull();

  // A level drag is one step.
  const slider = page.locator(".level-filter-slider");
  await slider.fill("1");
  await slider.fill("0");
  await settle(page, 300);
  expect(await param("filter-level")).toBe("0");
  await undo.click();
  await settle(page, 300);
  expect(await param("filter-level")).toBeNull();
  await expect(slider).toHaveValue("2");
});

test("F33 the selection glows in place: selected parts keep their stacking", async ({ page }) => {
  await open(page, "?tag-picker-mode&v=fit");
  const cells = () => page.evaluate(() => document.querySelectorAll(".dwk-main-image svg:first-child [data-tags]").length);
  const before = await cells();
  await page.goto("/?tag-picker-mode=Network.Ingress,Data&v=fit");
  await page.waitForFunction(() => Boolean((window as any).diagram));
  await settle(page, 300);
  // No copies anywhere: the cells themselves glow, where they are.
  expect(await cells()).toBe(before);
  await expect(page.locator(".dwk-selection-layer")).toHaveCount(0);
  await expect(page.locator("#cell-user")).toHaveClass(/dwk-selected/);
  await expect(page.locator("#cell-db")).toHaveClass(/dwk-selected/);
  await expect(page.locator("#cell-logs")).not.toHaveClass(/dwk-selected/);
  const filter = await page.evaluate(() => getComputedStyle(document.querySelector("#cell-user")!).filter);
  expect(filter).toContain("drop-shadow");
});

test("F34 help examples: marker, tabs, held tooltip, copy, search shows the matching example", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "?filter-level=2");
  await expect(page.locator(".dwk-example-marker")).toHaveCount(1);
  await expect(page.locator("#cell-m-cache .dwk-example-marker")).toHaveCount(1);

  await page.locator("#cell-m-cache rect").first().hover({ force: true });
  const tooltip = page.locator(".svg-property-tooltip.dwk-has-examples");
  await expect(tooltip.locator(".dwk-example-tab")).toHaveText(["Help", "cache log"]);
  await expect(tooltip.locator(".tooltip-content")).toBeVisible();
  const place = () => tooltip.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return [Math.round(box.x), Math.round(box.y), Math.round(box.width)];
  });
  const before = await place();
  await tooltip.locator('[data-example-tab="0"]').click();
  await expect(tooltip.locator(".tooltip-content")).toBeHidden();
  // Only the height follows the tab.
  expect(await place()).toEqual(before);
  await expect(tooltip.locator(".dwk-code-level-warn")).toHaveText("WARN");
  await tooltip.locator("[data-example-copy]").click();
  await expect(tooltip.locator("[data-example-copy]")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^2026-10-03T12:00:01Z INFO cache hit/);
  // Held open after a click in it, until a click outside.
  await page.mouse.move(10, 450);
  await settle(page, 600);
  await expect(tooltip).toBeVisible();
  await page.mouse.click(10, 450);
  await expect(tooltip).toBeHidden();

  await open(page, "?filter-level=2&menu=true&filter-query=evicted");
  const entry = page.locator(".filter-result-item", { hasText: "Cache" });
  await expect(entry.locator('[data-example-tab="0"]')).toHaveAttribute("aria-selected", "true");
  await expect(entry.locator(".dwk-example-code")).toContainText("evicted");
  await entry.locator('[data-example-tab="-1"]').click();
  await expect(entry.locator(".filter-result-content")).toBeVisible();
  // The tab is the record's: the tooltip follows the entry.
  await expect(page.locator(".svg-property-tooltip.dwk-has-examples .tooltip-content")).toHaveCount(1);
  expect(await page.locator('.svg-property-tooltip.dwk-has-examples [data-example-tab="-1"]').getAttribute("aria-selected")).toBe("true");
  // Going to the entry aims at the marker, not at its example dot.
  await entry.locator(".filter-result-head").click();
  await expect(page.locator(".mobile-go-to-indicator")).toHaveCount(1);
  const centres = await page.evaluate(() => {
    const centre = (selector: string) => {
      const box = document.querySelector(selector)!.getBoundingClientRect();
      return [box.x + box.width / 2, box.y + box.height / 2];
    };
    return { marker: centre("#cell-m-cache rect"), indicator: centre(".mobile-go-to-indicator") };
  });
  expect(centres.indicator[0]).toBeCloseTo(centres.marker[0], 0);
  expect(centres.indicator[1]).toBeCloseTo(centres.marker[1], 0);
});

test("F34 a popup that grows with its tab stays inside the diagram; its content scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 240 });
  await open(page, "?filter-level=2&v=fit");
  await page.locator("#cell-m-cache rect").first().hover({ force: true });
  const tooltip = page.locator(".svg-property-tooltip.dwk-has-examples");
  await tooltip.locator('[data-example-tab="0"]').click();
  const fit = await tooltip.evaluate((element) => {
    const root = element.closest(".dwk-root")!.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return { top: box.top - root.top, bottom: root.bottom - box.bottom, head: element.querySelector(".tooltip-head")!.getBoundingClientRect().top >= box.top };
  });
  expect(fit.top).toBeGreaterThanOrEqual(9);
  expect(fit.bottom).toBeGreaterThanOrEqual(9);
  expect(fit.head).toBe(true);
});

test("F35 examples only: the half of a priority button, filter, results, URL, pins", async ({ page }) => {
  await open(page, "?filter-level=2&menu=true");
  // Only priorities with an example get the half.
  await expect(page.locator(".dwk-examples-only-btn")).toHaveCount(1);
  const half = page.locator('[data-examples-only="info"]');
  await half.click();
  await expect(half).toHaveAttribute("aria-pressed", "true");
  await settle(page, 400);
  expect(await search(page)).toBe("?menu=true&examples-only=info");
  expect(await visible(page, "#cell-m-cache")).toBe(true);
  expect(await visible(page, "#cell-m-lb")).toBe(false);
  expect(await visible(page, "#cell-m-db")).toBe(true);
  await expect(page.locator(".filter-result-item", { hasText: "Load balancer" })).toHaveCount(0);
  expect((await state(page)).view.examplesOnly).toEqual(["info"]);

  // Hiding the priority hides those with examples too; </> brings them back.
  const info = page.locator('.tag-filter-btn[data-tag="info"]');
  await info.click();
  await expect(half).toHaveAttribute("aria-pressed", "false");
  expect(await visible(page, "#cell-m-cache")).toBe(false);
  await half.click();
  await settle(page, 400);
  await expect(info).toHaveClass(/active/);
  await expect(half).toHaveAttribute("aria-pressed", "true");
  expect(await visible(page, "#cell-m-cache")).toBe(true);
  expect(await visible(page, "#cell-m-lb")).toBe(false);
  expect(await search(page)).toBe("?menu=true&examples-only=info");

  await open(page, "?filter-level=2&examples-only=info&pins=LoadBalancer");
  expect(await visible(page, "#cell-m-lb")).toBe(true);
  expect(await visible(page, "#cell-m-app")).toBe(false);
  await page.evaluate(() => (window as any).diagram.setState({ view: { examplesOnly: null } }));
  await settle(page, 400);
  expect(await visible(page, "#cell-m-app")).toBe(true);
});

test("F36 topic chips follow the tag tree; Expand all / Collapse all and tags=all", async ({ page }) => {
  const chips = (selector: string) => page.locator(`${selector} .annotation-tag-badge:visible`);
  await open(page, "?menu=true&filter-query=database&filter-level=2");
  await page.locator('[data-slug="DbAccess"] rect').hover({ force: true });
  // The tree is closed: its top level only.
  await expect(chips(".svg-property-tooltip.severity-pri-1")).toHaveText(["Priority 1", "Data"]);
  await expect(chips(".filter-result-item.severity-pri-1")).toHaveText(["Priority 1", "Data"]);
  await expect(chips(".filter-result-item.severity-info")).toHaveText(["Info", "Data"]);

  const expandAll = page.locator(".dwk-tag-tree-expand-all");
  await expect(expandAll).toHaveText("Expand all");
  await expandAll.click();
  await expect(expandAll).toHaveText("Collapse all");
  expect(await search(page)).toBe("?menu=true&filter-query=database&tags=all");
  await expect(chips(".filter-result-item.severity-info")).toHaveText(["Info", "Data", "Data.Cache"]);
  expect((await state(page)).ui).toEqual({ panelOpen: true, tagTreeExpanded: true, tagTreeAllExpanded: true });

  await expandAll.click();
  expect(await search(page)).toBe("?menu=true&filter-query=database&tags=open");
  await expect(chips(".filter-result-item.severity-info")).toHaveText(["Info", "Data"]);

  await open(page, "?menu=true&filter-query=cache&tags=all&filter-level=2");
  await expect(chips(".filter-result-item")).toHaveText(["Info", "Data", "Data.Cache"]);
  // Closing a branch by hand leaves "all".
  await page.locator(".tag-tree-row.has-children", { hasText: "Data" }).locator(".tag-tree-caret").click();
  expect(await search(page)).toContain("tags=open");
  await expect(chips(".filter-result-item")).toHaveText(["Info", "Data"]);
});

test("F37 view.tooltip: open a popup on an example from the URL and setState; closing it clears it", async ({ page }) => {
  const popup = page.locator(".svg-property-tooltip.dwk-has-examples");
  await open(page, "?filter-level=2&tooltip=Cache:cache_log");
  await expect(popup).toBeVisible();
  await expect(popup.locator('[data-example-tab="0"]')).toHaveAttribute("aria-selected", "true");
  expect((await state(page)).view.tooltip).toEqual({ slug: "Cache", tab: "cache_log" });
  // Held: the pointer passing by does not close it.
  await page.mouse.move(10, 450);
  await settle(page, 600);
  await expect(popup).toBeVisible();
  // A click outside closes it, and the state and URL follow.
  await page.mouse.click(10, 450);
  await expect(popup).toBeHidden();
  expect((await state(page)).view.tooltip).toBeUndefined();
  expect(await search(page)).toBe("");

  await page.evaluate(() => (window as any).diagram.setState({ view: { tooltip: { slug: "Cache" } } }));
  await expect(popup).toBeVisible();
  await expect(popup.locator('[data-example-tab="-1"]')).toHaveAttribute("aria-selected", "true");
  expect(await search(page)).toBe("?tooltip=Cache");
  await page.evaluate(() => (window as any).diagram.setState({ view: { tooltip: null } }));
  await expect(popup).toBeHidden();

  // simple: the tab's content only; it fades in, and lands in the same place
  // when the filter hides its cell.
  const simple = { slug: "Cache", tab: "cache_log", mode: "simple" };
  const place = () => popup.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return [Math.round(box.x), Math.round(box.y)];
  });
  await page.evaluate((tooltip) => (window as any).diagram.setState({ view: { tooltip } }), simple);
  await expect(popup).toHaveCSS("opacity", "1");
  const shownPlace = await place();
  await page.evaluate(() => (window as any).diagram.setState({ view: { tooltip: null } }));
  await expect(popup).toBeHidden();
  await page.evaluate((tooltip) => (window as any).diagram.setState({ view: { hiddenTags: ["info"], tooltip } }), simple);
  expect(await visible(page, "#cell-m-cache")).toBe(false);
  await expect(popup).toHaveClass(/dwk-tooltip-simple/);
  await expect(popup).toHaveCSS("opacity", "1");
  expect(await place()).toEqual(shownPlace);
  await expect(popup.locator(".dwk-example-code")).toBeVisible();
  for (const hidden of [".dwk-example-tabs", ".tooltip-actions", ".dwk-example-copy"]) await expect(popup.locator(hidden)).toBeHidden();
  await expect(popup.locator(".tooltip-head")).toHaveText("Cachecache log");
  expect(await search(page)).toBe("?filter-hide-tags=info&tooltip=Cache%3Acache_log&tooltip-mode=simple");

  // Closing it with a camera move: the popup is gone before the camera moves.
  const samples = await page.evaluate(async () => {
    const tip = document.querySelector<HTMLElement>(".svg-property-tooltip.dwk-has-examples")!;
    const image = document.querySelector<HTMLElement>(".dwk-main-image")!;
    const start = image.style.transform;
    const seen: [boolean, string][] = [];
    let running = true;
    const tick = () => {
      seen.push([image.style.transform !== start, tip.style.display]);
      if (running) requestAnimationFrame(tick);
    };
    tick();
    await (window as any).diagram.setState({ view: { tooltip: null, camera: { rect: [0.3, 0.3, 0.3, 0.3] } } }, { transition: 400 });
    running = false;
    return seen;
  });
  expect(samples.some(([moved]) => moved)).toBe(true);
  expect(samples.filter(([moved]) => moved).every(([, display]) => display === "none")).toBe(true);
});
