import { expect, test } from "@playwright/test";
import { listenerCounts, screenPointInSvg, settle, svgPointOnScreen, waitReady } from "../helpers";

test.use({ viewport: { width: 1300, height: 900 } });

test("embed preset renders without UI, URL or storage writes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/embed.html?layout=single");
  await waitReady(page);
  expect(errors).toEqual([]);
  const ui = await page.evaluate(() => ({
    panel: document.querySelectorAll(".filter-panel, .floating-filter-toggle, .footer-link, .modal").length,
    storage: localStorage.length,
    search: location.search,
    help: document.querySelectorAll(".dwk-main-image [data-help]").length,
  }));
  expect(ui).toEqual({ panel: 0, storage: 0, search: "?layout=single", help: 4 });

  await page.evaluate(() => (window as any).instances[0].setState({ view: { pins: ["WebApp"], level: 1 } }));
  await settle(page, 600);
  expect(await page.evaluate(() => location.search)).toBe("?layout=single");
  await page.keyboard.press("0");
  await page.mouse.move(300, 200);
  await page.mouse.wheel(0, -500);
  await settle(page);
  expect(await page.evaluate(() => (window as any).instances[0].getState().view.camera)).toBeUndefined();
});

test("two instances are independent", async ({ page }) => {
  await page.goto("/embed.html");
  await waitReady(page);
  const states = await page.evaluate(async () => {
    const [a, b] = (window as any).instances;
    await a.setState({ view: { level: 0, pins: ["Cache"], hiddenTags: ["Observability"], camera: { fit: true }, theme: "dark" } });
    return { a: a.getState(), b: b.getState(), themes: [a.root.dataset.theme, b.root.dataset.theme] };
  });
  expect(states.a.view).toMatchObject({ level: 0, pins: ["Cache"], hiddenTags: ["Observability"], camera: { fit: true }, theme: "dark" });
  expect(states.b.view).toEqual({});
  expect(states.themes).toEqual(["dark", "light"]);
  await settle(page, 300);
  const visible = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".dwk-main-image")).map(
      (image) => Array.from(image.querySelectorAll<SVGElement>("[data-tags]")).filter((el) => el.style.display !== "none").length,
    ),
  );
  expect(visible[0]).toBeLessThan(visible[1]);
});

test("destroy leaves no listeners and no nodes", async ({ page }) => {
  await page.goto("/embed.html?layout=none&input=on");
  await waitReady(page);
  const before = await listenerCounts(page);
  const nodesBefore = await page.evaluate(() => document.getElementsByTagName("*").length);
  await page.evaluate(async () => {
    const container = document.createElement("div");
    container.className = "slot";
    document.getElementById("mount")!.appendChild(container);
    const features = { preset: "embed", input: { wheel: true, drag: true, pinch: true } };
    (window as any).probe = await (window as any).mountDiagram(container, (window as any).definition, { features });
  });
  await settle(page);
  const box = await page.locator(".slot").boundingBox();
  await page.mouse.move(box!.x + 200, box!.y + 150);
  await page.mouse.down();
  await page.mouse.move(box!.x + 260, box!.y + 190, { steps: 4 });
  await page.mouse.wheel(0, -200);
  await page.mouse.up();
  await page.locator(".dwk-main-image [data-help]").first().hover({ force: true });
  await settle(page, 300);
  await page.evaluate(() => {
    (window as any).probe.destroy();
    document.querySelector(".slot")!.remove();
  });
  await settle(page, 400);
  expect(await listenerCounts(page)).toEqual(before);
  expect(await page.evaluate(() => document.getElementsByTagName("*").length)).toBe(nodesBefore);
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
});

for (const layout of ["scaled", "zoomed"]) {
  test(`camera under an ancestor ${layout === "scaled" ? "transform: scale(0.5)" : "zoom: 1.5"}`, async ({ page }) => {
    await page.goto(`/embed.html?layout=${layout}&input=on`);
    await waitReady(page);
    const box = (await page.locator(".slot").boundingBox())!;
    const pointer = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.45 };
    const anchor = await screenPointInSvg(page, 0, pointer.x, pointer.y);
    await page.mouse.move(pointer.x, pointer.y);
    for (let step = 0; step < 4; step += 1) {
      await page.mouse.wheel(0, -120);
      await settle(page, 30);
    }
    await settle(page);
    const after = await svgPointOnScreen(page, 0, anchor.x, anchor.y);
    expect(Math.abs(after.x - pointer.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.y - pointer.y)).toBeLessThanOrEqual(2);

    // Drag moves the diagram by exactly the pointer delta on screen.
    const beforeDrag = await svgPointOnScreen(page, 0, 430, 190);
    await page.mouse.move(pointer.x, pointer.y);
    await page.mouse.down();
    await page.mouse.move(pointer.x - 40, pointer.y - 30, { steps: 5 });
    await page.mouse.up();
    await settle(page);
    const afterDrag = await svgPointOnScreen(page, 0, 430, 190);
    expect(Math.abs(afterDrag.x - beforeDrag.x + 40)).toBeLessThanOrEqual(2);
    expect(Math.abs(afterDrag.y - beforeDrag.y + 30)).toBeLessThanOrEqual(2);

    // Rings sit on their element.
    await page.evaluate(() => (window as any).instances[0].setState({ view: { pins: ["LoadBalancer"], camera: { fit: true } } }));
    await settle(page, 300);
    const offset = await page.evaluate(() => {
      const ring = document.querySelector(".pin-indicator")!.getBoundingClientRect();
      // Rings aim at the smallest drawn child of the element.
      const element = document.querySelector('[data-slug="LoadBalancer"]')!;
      const target = Array.from(element.querySelectorAll("rect, text"))
        .map((node) => node.getBoundingClientRect())
        // A draw.io label's <text> fallback inside <switch> is not rendered (0x0).
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .sort((a, b) => a.width * a.height - b.width * b.height)[0];
      return {
        x: ring.left + ring.width / 2 - (target.left + target.width / 2),
        y: ring.top + ring.height / 2 - (target.top + target.height / 2),
      };
    });
    expect(Math.abs(offset.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(offset.y)).toBeLessThanOrEqual(2);
  });
}

test("highlight copies keep the diagram's stacking", async ({ page }) => {
  await page.goto("/embed.html?layout=single");
  await waitReady(page);
  // Query order (Cache, WebApp) is the reverse of the document order.
  await page.evaluate(() => (window as any).instances[0].setState({ view: { highlight: { slugs: ["Cache", "WebApp"] } } }));
  await settle(page);
  const order = await page.evaluate(() => {
    const cell = (slug: string) => document.querySelector(`[data-slug="${slug}"]`)!;
    const copies = Array.from(document.querySelectorAll(".dwk-highlight-copy"));
    const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      afterOwnCell: copies.map((copy) => copy.previousElementSibling === cell("WebApp") || copy.previousElementSibling === cell("Cache")),
      copiesInDocumentOrder: before(copies[0], copies[1]) && copies[0].previousElementSibling === cell("WebApp"),
      laterCellAbove: before(copies[0], cell("LoadBalancer")),
      metadata: copies.flatMap((copy) => [copy, ...copy.querySelectorAll("*")]).filter((node) => Array.from(node.attributes).some(({ name }) => name === "id" || name === "type" || name.startsWith("data-"))).length,
    };
  });
  expect(order).toEqual({ afterOwnCell: [true, true], copiesInDocumentOrder: true, laterCellAbove: true, metadata: 0 });

  await page.evaluate(() => (window as any).instances[0].setState({ view: { highlight: null } }));
  await settle(page);
  expect(await page.locator(".dwk-highlight-copy").count()).toBe(0);
});

test("setState camera: rect, focus, fit and default", async ({ page }) => {
  await page.goto("/embed.html?layout=single");
  await waitReady(page);
  const result = await page.evaluate(async () => {
    const d = (window as any).instances[0];
    await d.setState({ view: { camera: { rect: [0.4, 0.5, 0.3, 0.4] } } });
    const rect = d.getState().view.camera;
    const visible = d.camera.get();
    await d.setState({ view: { camera: { focus: { slugs: ["DbAccess"] }, padding: 0.2 } } });
    const focus = d.getState().view.camera;
    const focusVisible = d.camera.get();
    await d.camera.fit();
    const fit = d.getState().view.camera;
    await d.setState({ view: { camera: null } });
    return { rect, visible, focus, focusVisible, fit, defaultCamera: d.getState().view.camera ?? null };
  });
  expect(result.rect).toEqual({ rect: [0.4, 0.5, 0.3, 0.4] });
  // Contain semantics: the requested rect fits inside what is visible.
  expect(result.visible[2]).toBeGreaterThanOrEqual(0.3);
  expect(result.visible[3]).toBeGreaterThanOrEqual(0.4);
  expect(Math.abs(result.visible[0] - 0.4)).toBeLessThan(0.02);
  expect(result.focus).toEqual({ focus: { slugs: ["DbAccess"] }, padding: 0.2 });
  expect(result.focusVisible[0]).toBeGreaterThan(0.8);
  expect(result.fit).toEqual({ fit: true });
  expect(result.defaultCamera).toBeNull();
});

test("transitions animate and land on the target", async ({ page }) => {
  await page.goto("/embed.html?layout=single");
  await waitReady(page);
  const frames = await page.evaluate(async () => {
    const d = (window as any).instances[0];
    const seen: number[] = [];
    const image = document.querySelector<HTMLElement>(".dwk-main-image")!;
    const observer = new MutationObserver(() => seen.push(Number(image.style.transform.match(/matrix\(([^,]+)/)![1])));
    observer.observe(image, { attributes: true, attributeFilter: ["style"] });
    // Long enough for several frames even when headless software raster
    // takes ~60 ms per frame at this zoom.
    await d.setState({ view: { camera: { rect: [0.5, 0.5, 0.2, 0.2] } } }, { transition: 600 });
    observer.disconnect();
    return { count: new Set(seen).size, camera: d.getState().view.camera };
  });
  expect(frames.count).toBeGreaterThan(5);
  expect(frames.camera).toEqual({ rect: [0.5, 0.5, 0.2, 0.2] });
});

test("bad mount options show their error in the container, then reject", async ({ page }) => {
  await page.goto("/embed.html?layout=none");
  await waitReady(page);
  const message = await page.evaluate(async () => {
    const container = document.createElement("div");
    container.className = "slot";
    document.getElementById("mount")!.appendChild(container);
    try {
      await (window as any).mountDiagram(container, (window as any).definition, { initialState: { view: { level: "high" } } });
      return "resolved";
    } catch (error) {
      return (error as Error).message;
    }
  });
  expect(message).toContain("level");
  const box = page.locator(".slot .dwk-error-box-standalone");
  await expect(box).toBeVisible();
  await expect(box).toContainText("level");
});

test("view.tooltip takes its defaults from definition.ui.tooltipDefaults: mode, marker, width, scale", async ({ page }) => {
  await page.goto("/embed.html?layout=none");
  await waitReady(page);
  await page.evaluate(async () => {
    const container = document.createElement("div");
    container.className = "slot";
    container.style.cssText = "width: 1000px; height: 600px";
    document.getElementById("mount")!.appendChild(container);
    const definition = (window as any).definition.extend({ ui: { tooltipDefaults: { mode: "simple", marker: true, width: 0.5, scale: 2 } } });
    (window as any).probe = await (window as any).mountDiagram(container, definition, { initialState: { view: { level: 2, hiddenTags: ["info"] } } });
  });
  await settle(page);
  const popup = page.locator(".slot .svg-property-tooltip.dwk-has-examples");
  const cacheShown = () =>
    page.evaluate(() => {
      const cell = document.querySelector<SVGElement>(".slot #cell-m-cache")!;
      return cell.style.display !== "none" && cell.style.opacity !== "0";
    });
  expect(await cacheShown()).toBe(false);

  await page.evaluate(() => (window as any).probe.setState({ view: { tooltip: { slug: "Cache", tab: "cache_log" } } }));
  await expect(popup).toHaveCSS("opacity", "1");
  await expect(popup).toHaveClass(/dwk-tooltip-simple/);
  // marker: true shows the hidden cell while its popup is open.
  expect(await cacheShown()).toBe(true);
  // Title with the example's name; no tabs or buttons.
  await expect(popup.locator(".tooltip-head")).toHaveText("Cachecache log");
  await expect(popup.locator(".dwk-example-tabs")).toBeHidden();
  const size = await popup.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    code: getComputedStyle(element.querySelector(".dwk-example-code")!).fontSize,
  }));
  // Half of the width inside the 10px margins.
  expect(size.width).toBeCloseTo(490, 0);
  expect(size.code).toBe("24px");

  // The state overrides the defaults.
  await page.evaluate(() => (window as any).probe.setState({ view: { tooltip: { slug: "Cache", tab: "cache_log", mode: "full", marker: false, scale: 1 } } }));
  await expect(popup.locator(".dwk-example-tabs")).toBeVisible();
  expect(await popup.evaluate((element) => getComputedStyle(element.querySelector(".dwk-example-code")!).fontSize)).toBe("12px");
  await settle(page, 300);
  expect(await cacheShown()).toBe(false);

  // position center with the full width: equal margins on all sides it can.
  await page.evaluate(() => (window as any).probe.setState({ view: { tooltip: { slug: "Cache", tab: "cache_log", width: 1, position: "center" } } }));
  await settle(page, 300);
  const gaps = await page.evaluate(() => {
    const root = document.querySelector(".slot .dwk-root")!.getBoundingClientRect();
    const box = document.querySelector(".slot .svg-property-tooltip.dwk-has-examples")!.getBoundingClientRect();
    return { left: box.left - root.left, right: root.right - box.right, top: box.top - root.top, bottom: root.bottom - box.bottom };
  });
  expect(gaps.left).toBeCloseTo(10, 0);
  expect(gaps.right).toBeCloseTo(10, 0);
  expect(Math.abs(gaps.top - gaps.bottom)).toBeLessThan(2);

  // Away from its cell: a line from the popup to the cell, ending on it.
  const connector = page.locator(".slot .dwk-tooltip-connector");
  await expect(connector).toHaveClass(/is-shown/);
  await expect(connector).toHaveCSS("opacity", "1");
  const end = await page.evaluate(() => {
    const dot = document.querySelector(".slot .dwk-tooltip-connector-dot")!.getBoundingClientRect();
    const cell = document.querySelector(".slot #cell-m-cache rect")!.getBoundingClientRect();
    return Math.hypot(dot.x + dot.width / 2 - (cell.x + cell.width / 2), dot.y + dot.height / 2 - (cell.y + cell.height / 2));
  });
  expect(end).toBeLessThan(3);
  // connector: false, per state.
  await page.evaluate(() => (window as any).probe.setState({ view: { tooltip: { slug: "Cache", tab: "cache_log", position: "center", connector: false } } }));
  await expect(connector).not.toHaveClass(/is-shown/);

  // Taller than the diagram: the popup stays inside it and its code scrolls.
  await page.evaluate(() => {
    document.querySelector<HTMLElement>(".slot")!.style.height = "220px";
    return (window as any).probe.setState({ view: { tooltip: { slug: "Cache", tab: "cache_log", width: 0.6, scale: 5, position: "top" } } });
  });
  await settle(page, 400);
  const fit = await page.evaluate(() => {
    const root = document.querySelector(".slot .dwk-root")!.getBoundingClientRect();
    const tip = document.querySelector<HTMLElement>(".slot .svg-property-tooltip.dwk-has-examples")!;
    const box = tip.getBoundingClientRect();
    const code = tip.querySelector<HTMLElement>(".dwk-example-panel:not([hidden]) .dwk-example-code")!;
    return { top: box.top - root.top, bottom: root.bottom - box.bottom, scrolls: code.scrollHeight > code.clientHeight, head: tip.querySelector(".tooltip-head")!.getBoundingClientRect().top >= box.top };
  });
  expect(fit.top).toBeGreaterThanOrEqual(9);
  expect(fit.bottom).toBeGreaterThanOrEqual(9);
  expect(fit.scrolls).toBe(true);
  expect(fit.head).toBe(true);

  // Closed: the filter decides again, and no line is left.
  await page.evaluate(() => (window as any).probe.setState({ view: { tooltip: { slug: "Cache", position: "bottom" } } }));
  await expect(connector).toHaveClass(/is-shown/);
  await page.evaluate(() => (window as any).probe.setState({ view: { tooltip: null, hiddenTags: [] } }));
  await expect(connector).toHaveCSS("opacity", "0");
  await expect(popup).toBeHidden();
  await settle(page, 300);
  expect(await cacheShown()).toBe(true);
  await page.evaluate(() => (window as any).probe.destroy());
});
