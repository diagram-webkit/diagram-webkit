import { expect, test } from "@playwright/test";
import { listenerCounts, settle, waitReady } from "../helpers";

test.use({ viewport: { width: 1400, height: 900 } });

const embed = "#embed";

test("custom element: shadow root, page CSS kept out, attributes set the view", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/element.html");
  await waitReady(page);
  expect(errors).toEqual([]);

  const info = await page.evaluate((selector) => {
    const element = document.querySelector(selector) as any;
    const svg = element.shadowRoot.querySelector(".dwk-main-image > svg");
    return {
      lightRoots: document.querySelectorAll(".dwk-root").length,
      svgDisplay: getComputedStyle(svg).display,
      rootBackground: getComputedStyle(element.shadowRoot.querySelector(".dwk-root")).backgroundColor,
      view: element.instance.getState().view,
      styleSheets: element.shadowRoot.adoptedStyleSheets.length,
      documentSheets: document.adoptedStyleSheets.length,
    };
  }, embed);
  expect(info.lightRoots).toBe(0);
  expect(info.svgDisplay).toBe("block");
  expect(info.rootBackground).not.toBe("rgb(255, 0, 255)");
  expect(info.view).toMatchObject({ level: 1, onlyTags: ["Network"], pins: ["LoadBalancer"] });
  expect(info.styleSheets).toBeGreaterThan(0);
  expect(info.documentSheets).toBe(0);

  const state = await page.evaluate(async (selector) => {
    const element = document.querySelector(selector) as any;
    element.setAttribute("view", "overview");
    element.setAttribute("state", '{"pins":["Cache"]}');
    await new Promise((resolve) => setTimeout(resolve, 300));
    return element.instance.getState().view;
  }, embed);
  expect(state).toMatchObject({ level: 0, pins: ["Cache"], camera: { fit: true } });
  expect(state.onlyTags).toBeUndefined();
});

test("custom element: a bad attribute shows an error, and fixing it recovers", async ({ page }) => {
  await page.goto("/element.html");
  await waitReady(page);
  const box = page.locator(`${embed} .dwk-error-box-standalone`);
  await page.evaluate((selector) => document.querySelector(selector)!.setAttribute("state", "{"), embed);
  await expect(box).toContainText("invalid attributes");
  expect(await page.evaluate(() => (window as any).errors.length)).toBe(1);
  await page.evaluate((selector) => document.querySelector(selector)!.setAttribute("view", "nope"), embed);
  await expect(box).toContainText("invalid attributes");
  await page.evaluate((selector) => {
    const element = document.querySelector(selector)!;
    element.setAttribute("view", "data");
    element.setAttribute("state", '{"level":0}');
  }, embed);
  await expect(box).toHaveCount(0);
  await settle(page, 300);
  expect(await page.evaluate((selector) => (document.querySelector(selector) as any).instance.getState().view.level, embed)).toBe(0);
});

test("custom element: typing in its search field is not a shortcut", async ({ page }) => {
  await page.goto("/element.html");
  await waitReady(page);
  await page.evaluate(() => (document.querySelector("#app") as any).instance.setState({ ui: { panelOpen: true } }));
  const input = page.locator("#app .dwk-filter-search-input");
  await input.fill("");
  await input.focus();
  await page.keyboard.type("0-+");
  await expect(input).toHaveValue("0-+");
  expect(await page.evaluate(() => (document.querySelector("#app") as any).instance.getState().view.camera)).toBeUndefined();
});

test("custom element: removing it destroys the instance and leaves nothing behind", async ({ page }) => {
  await page.goto("/element.html");
  await waitReady(page);
  await page.evaluate(() => {
    document.querySelectorAll("basic-diagram, basic-diagram-app").forEach((element) => element.remove());
  });
  const before = await listenerCounts(page);
  const after = await page.evaluate(async () => {
    const element = document.createElement("basic-diagram") as any;
    element.setAttribute("view", "overview");
    document.body.appendChild(element);
    while (!element.instance) await new Promise((resolve) => setTimeout(resolve, 20));
    await element.instance.ready;
    const mounted = element.shadowRoot.querySelectorAll(".dwk-root").length;
    element.remove();
    return { mounted, left: element.shadowRoot.querySelectorAll(".dwk-root").length, instance: element.instance };
  });
  expect(after).toEqual({ mounted: 1, left: 0, instance: null });
  expect(await listenerCounts(page)).toEqual(before);
});
