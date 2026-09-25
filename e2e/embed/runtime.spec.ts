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
