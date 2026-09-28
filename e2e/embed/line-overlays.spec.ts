import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { listenerCounts, settle, waitReady } from "../helpers";

const REPO = path.resolve(import.meta.dirname, "../..");
const CLI = path.join(REPO, "packages/diagram-webkit/src/tools/cli.js");
const SOURCE = path.join(REPO, "e2e/pages/line-overlays.svg");

// e2e/pages/line-overlays.svg: legend lines define egress and ingress
// (data-overlay-definition); line "in" arrives at the box from the left, "out"
// leaves it downwards. Both carry both overlays (data-overlay).

async function bands(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGPathElement>(".dwk-line-overlays .dwk-line-overlay-band")).map((band) => ({
      overlay: (band.parentElement as HTMLElement).dataset.overlay,
      d: band.getAttribute("d"),
      display: band.style.display,
      opacity: getComputedStyle(band).opacity,
    })),
  );
}

test("line overlays: styled from the definition, to the arrow tips, joined in the box, side by side", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (message) => message.type() === "warning" && warnings.push(message.text()));
  await page.goto("/line-overlays.html");
  await waitReady(page);
  expect(warnings).toEqual([]);

  const groups = await page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGGElement>(".dwk-line-overlays > g")).map((group) => {
      const band = group.querySelector("path") as SVGPathElement;
      return {
        overlay: group.dataset.overlay,
        opacity: group.getAttribute("opacity"),
        stroke: band.getAttribute("stroke"),
        width: band.getAttribute("stroke-width"),
        dash: band.getAttribute("stroke-dasharray"),
        ownOpacity: band.getAttribute("stroke-opacity"),
        // On top of the diagram, only the cells with a slug (the box here) above it.
        above: (() => {
          const svg = document.querySelector(".dwk-main-image > svg")!;
          const layer = svg.querySelector(":scope > .dwk-line-overlays")!;
          const raised = layer.nextElementSibling!;
          return raised === svg.lastElementChild && raised.classList.contains("dwk-above-overlays") ? Array.from(raised.querySelectorAll("[data-slug]"), (cell) => cell.getAttribute("data-slug")) : null;
        })(),
      };
    }),
  );
  expect(groups).toEqual([
    { overlay: "egress", opacity: "0.2", stroke: "#6c8ebf", width: "12.5", dash: "4 2", ownOpacity: null, above: ["Box"] },
    { overlay: "ingress", opacity: "0.2", stroke: "#b85450", width: "12.5", dash: null, ownOpacity: null, above: ["Box"] },
  ]);

  // Per overlay: a band on each line and one join. Each line lays its bands in
  // its property's order, the first on the left looking along the arrow: egress
  // above "in" (heading right) and east of "out" (heading down). Bands end
  // exactly on the edges they touch: the box's left (x 150) and bottom (y 120),
  // the end box's top (y 218), whatever draw.io's translate(0.5,0.5) and its
  // arrowheads leave. The join turns as concentric arcs, one centre
  // (190.5, 110.5): egress outside (r 16), ingress inside (r 4).
  expect((await bands(page)).map(({ overlay, d }) => [overlay, d])).toEqual([
    ["egress", "M 20.5 94.5 L 150 94.5"],
    ["egress", "M 206.5 120 L 206.5 218"],
    ["egress", "M 138 94.5 L 190.5 94.5 A 16 16 0 0 1 206.5 110.5 L 206.5 132"],
    ["ingress", "M 20.5 106.5 L 150 106.5"],
    ["ingress", "M 194.5 120 L 194.5 218"],
    ["ingress", "M 138 106.5 L 190.5 106.5 A 4 4 0 0 1 194.5 110.5 L 194.5 132"],
  ]);
});

test("line overlays follow the visibility of their lines", async ({ page }) => {
  await page.goto("/line-overlays.html");
  await waitReady(page);
  const displays = async () => (await bands(page)).map((band) => band.display);

  await page.evaluate(() => (window as any).instance.setState({ view: { hiddenTags: ["Flow.Out"] } }));
  await settle(page, 300);
  // The "out" bands and the joins go; the "in" bands stay.
  expect(await displays()).toEqual(["", "none", "none", "", "none", "none"]);

  await page.evaluate(() => (window as any).instance.setState({ view: { hiddenTags: [], level: 0 } }));
  await settle(page, 300);
  expect(await displays()).toEqual(["", "none", "none", "", "none", "none"]);

  await page.evaluate(() => (window as any).instance.setState({ view: { level: 1, highlight: { tags: ["Flow.Out"], mode: "dim-others" } } }));
  await settle(page, 300);
  expect((await bands(page)).map((band) => [band.display, band.opacity])).toEqual([
    ["", "0.2"],
    ["", "1"],
    ["", "0.2"],
    ["", "0.2"],
    ["", "1"],
    ["", "0.2"],
  ]);
});

// Mounts a second diagram next to the page's; returns what its line overlay layers hold.
async function mountAndRead(page: Page, script: string) {
  return page.evaluate(async (body) => {
    const w = window as any;
    const slot = document.createElement("div");
    slot.style.cssText = "width: 800px; height: 600px";
    document.body.appendChild(slot);
    const instance = await new Function("w", "slot", `return (async () => { ${body} })()`)(w, slot);
    w.second = instance;
    const layers = slot.querySelectorAll(".dwk-line-overlays");
    return {
      layers: layers.length,
      bands: Array.from(slot.querySelectorAll<SVGPathElement>(".dwk-line-overlay-band")).map((band) => band.getAttribute("d")),
    };
  }, script);
}

test("render writes a finished SVG, and an instance uses its bands without drawing them again", async ({ page }) => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dwk-render-")), "rendered.svg");
  const log = execFileSync(process.execPath, [CLI, "render", SOURCE, "--out", out], { encoding: "utf8", env: { ...process.env, DIAGRAM_WEBKIT_DIR: "" } });
  expect(log).toContain("6 bands (overlays: egress, ingress), 0 box arrows");
  const rendered = fs.readFileSync(out, "utf8");
  expect(rendered).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<!-- Rendered by diagram-webkit render from line-overlays.svg/);
  expect(rendered).not.toContain("content=");
  expect(rendered).toContain('data-overlay="egress,ingress"');
  expect(rendered.match(/data-lines="cell-in cell-out"/g)).toHaveLength(2);

  await page.goto("/line-overlays.html");
  await waitReady(page);
  const drawn = (await bands(page)).map((band) => band.d);
  const reused = await mountAndRead(page, `return w.mountDiagram(slot, w.definition, { features: "embed", source: { svgText: ${JSON.stringify(rendered)} } });`);
  // The rendered layer as it is: one layer, the same bands as drawn at runtime.
  expect(reused).toEqual({ layers: 1, bands: drawn });

  await page.evaluate(() => (window as any).second.setState({ view: { hiddenTags: ["Flow.Out"] } }));
  await settle(page, 300);
  const displays = await page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGPathElement>("body > div:last-of-type .dwk-line-overlay-band")).map((band) => band.style.display),
  );
  expect(displays).toEqual(["", "none", "none", "", "none", "none"]);
});

test("lineOverlays: false draws nothing; development mode applies definition.development", async ({ page }) => {
  await page.goto("/line-overlays.html");
  await waitReady(page);
  const extended = `const def = w.definition.extend({ features: { preset: "embed", lineOverlays: false }, development: { features: { lineOverlays: true } } });`;
  expect(await mountAndRead(page, `${extended} return w.mountDiagram(slot, def);`)).toMatchObject({ layers: 0 });
  expect(await mountAndRead(page, `${extended} return w.mountDiagram(slot, def, { mode: "development" });`)).toMatchObject({ layers: 1 });
  // The Vite plugin's dev server marks the page.
  const marked = `const meta = document.createElement("meta"); meta.name = "diagram-webkit-mode"; meta.content = "development"; document.head.appendChild(meta);`;
  expect(await mountAndRead(page, `${extended} ${marked} return w.mountDiagram(slot, def);`)).toMatchObject({ layers: 1 });
  expect(await mountAndRead(page, `${extended} return w.mountDiagram(slot, def, { mode: "production" });`)).toMatchObject({ layers: 0 });
});

test("About lists the downloads; This view saves filters, bands, pins and notes, in the light theme", async ({ page }) => {
  await page.goto("/line-overlays.html");
  await waitReady(page);
  const setup = `
    const def = w.definition.extend({ content: { about: "<p>About</p>", downloads: {
      drawio: { url: "./line-overlays.svg", name: "d.drawio.svg" },
      full: { url: "./line-overlays.svg", name: "d.svg" },
      view: { name: "d-view.svg" },
    } } });
    return w.mountDiagram(slot, def, { features: { preset: "embed", about: true }, initialState: { view: {
      hiddenTags: ["Flow.Out"], pins: ["Box"], theme: "dark",
      annotations: [
        { x: 0.4, y: 0.3, type: "user-info", title: "Here", description: "a point" },
        { x: 0.2, y: 0.2, type: "area-important", title: "Zone", description: "", shape: "rectangle", widthRel: 0.1, heightRel: 0.08 },
        { x: 0.1, y: 0.1, x2: 0.3, y2: 0.2, type: "arrow-success", title: "", description: "" },
      ],
    } } });`;
  await mountAndRead(page, setup);
  await settle(page, 400);
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll("body > div:last-of-type .about-downloads tr")).map((row) => {
      const link = row.querySelector("a");
      return [row.querySelector("th")!.textContent, link ? link.getAttribute("download") : row.querySelector("button")!.dataset.role];
    }),
  );
  expect(rows).toEqual([
    ["draw.io original", "d.drawio.svg"],
    ["Full diagram", "d.svg"],
    ["This view", "download-view"],
  ]);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate(() => (document.querySelector("body > div:last-of-type [data-role=download-view]") as HTMLButtonElement).click()),
  ]);
  expect(download.suggestedFilename()).toBe("d-view.svg");
  const saved = fs.readFileSync(await download.path(), "utf8");
  expect(saved).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<!-- This view of line-overlays, saved /);
  expect(saved).not.toContain("content=");
  expect(saved).not.toContain('id="cell-out"');
  expect(saved).not.toContain("!important");
  expect(saved).not.toContain("width: 100%");
  const counts = await page.evaluate((text) => {
    const svg = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
    return {
      bands: svg.querySelectorAll(".dwk-line-overlay-band").length,
      pins: svg.querySelectorAll(".dwk-view-pins circle").length,
      notes: Array.from(svg.querySelectorAll(".dwk-view-annotations > g")).map((g) => g.getAttribute("class")),
      titles: Array.from(svg.querySelectorAll(".dwk-view-annotations title")).map((t) => t.textContent),
      viewBox: svg.getAttribute("viewBox"),
    };
  }, saved);
  expect(counts).toEqual({
    bands: 2,
    pins: 2,
    notes: ["dwk-view-point", "dwk-view-area", "dwk-view-arrow"],
    titles: ["Here\n\na point", "Zone"],
    viewBox: "0 0 400 300",
  });
});

// e2e/pages/box-arrows.svg: one line from box1 to box4 with arrow-at-each-box,
// under box2 (a rect) and box3 (an ellipse), both drawn after it and filled.
// No arrow: the filled container before it, a priority marker (pri-1) over it.
// An arrow though unfilled: the frame, which says arrow-at-each-box=true.
async function boxArrows(page: Page, scope = "#mount") {
  return page.evaluate((root) => {
    const svg = document.querySelector(`${root} .dwk-main-image > svg`) as SVGSVGElement;
    return Array.from(svg.querySelectorAll<SVGGElement>(".dwk-box-arrow")).map((group) => {
      const head = group.querySelector("path") as SVGPathElement;
      const m = DOMMatrix.fromMatrix((head.transform.baseVal.consolidate() as SVGTransform).matrix);
      // The copied head's tip, (418.88, 100) in its own coordinates, in the line's group.
      const tip = m.transformPoint({ x: 418.88, y: 100 });
      return {
        lines: group.getAttribute("data-lines"),
        tip: [Math.round(tip.x * 100) / 100, Math.round(tip.y * 100) / 100],
        after: (group.previousElementSibling as Element).id || (group.previousElementSibling as Element).className.baseVal,
        display: group.style.display,
      };
    });
  }, scope);
}

test("arrow-at-each-box: an arrowhead where the line enters each box over it, shown with that box", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (message) => message.type() === "warning" && warnings.push(message.text()));
  await page.goto("/line-overlays.html?svg=box-arrows");
  await waitReady(page);
  expect(warnings).toEqual([]);
  // As draw.io places its own arrows, the drawn tip touches the edge: the
  // outline's tip stops 0.5 / sin(atan(3.5 / 7)) = 1.12 before it, the 1 px
  // stroke's miter covering the rest. Edges: box2's left (x 150), box3's
  // ellipse (centre 300,100, rx 30, ry 20) met at y 100.5, where the line runs
  // (draw.io's translate(0.5,0.5)): x = 300 - 30 * sqrt(1 - (0.5 / 20)^2), and
  // the frame's left (x 340).
  expect(await boxArrows(page)).toEqual([
    { lines: "cell-line cell-box2", tip: [148.88, 100.5], after: "cell-line", display: "" },
    { lines: "cell-line cell-box3", tip: [268.89, 100.5], after: "dwk-box-arrow", display: "" },
    { lines: "cell-line cell-frame", tip: [338.88, 100.5], after: "dwk-box-arrow", display: "" },
  ]);

  await page.evaluate(() => (window as any).instance.setState({ view: { hiddenTags: ["B2"] } }));
  await settle(page, 300);
  expect((await boxArrows(page)).map((arrow) => arrow.display)).toEqual(["none", "", ""]);
  await page.evaluate(() => (window as any).instance.setState({ view: { hiddenTags: ["Flow"] } }));
  await settle(page, 300);
  expect((await boxArrows(page)).map((arrow) => arrow.display)).toEqual(["none", "none", "none"]);
});

test("render draws the box arrows in, and an instance does not draw them again", async ({ page }) => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dwk-render-")), "rendered.svg");
  const log = execFileSync(process.execPath, [CLI, "render", path.join(REPO, "e2e/pages/box-arrows.svg"), "--out", out], { encoding: "utf8", env: { ...process.env, DIAGRAM_WEBKIT_DIR: "" } });
  expect(log).toContain("0 bands (overlays: none), 3 box arrows");
  const rendered = fs.readFileSync(out, "utf8");
  expect(rendered).toContain("data-dwk-rendered");
  await page.goto("/line-overlays.html?svg=box-arrows");
  await waitReady(page);
  const reused = await mountAndRead(page, `return w.mountDiagram(slot, w.definition, { features: "embed", source: { svgText: ${JSON.stringify(rendered)} } });`);
  expect(reused.layers).toBe(0);
  const arrows = await page.evaluate(() => document.querySelectorAll("body > div:last-of-type .dwk-box-arrow").length);
  expect(arrows).toBe(3);
});

test("development mode: a small notice when something is logged to the console", async ({ page }) => {
  await page.goto("/line-overlays.html");
  await waitReady(page);
  const before = await listenerCounts(page);
  const broken = fs.readFileSync(SOURCE, "utf8").replace('data-overlay="egress,ingress"', 'data-overlay="nope"');
  const notice = () => page.evaluate(() => {
    const element = document.querySelector("body > div:last-of-type .dwk-dev-notice") as HTMLElement | null;
    return element ? { text: element.textContent, hidden: element.hidden } : null;
  });

  await mountAndRead(page, `return w.mountDiagram(slot, w.definition, { features: "embed", mode: "production", source: { svgText: ${JSON.stringify(broken)} } });`);
  await settle(page);
  expect(await notice()).toBeNull();

  await mountAndRead(page, `return w.mountDiagram(slot, w.definition, { features: "embed", mode: "development", source: { svgText: ${JSON.stringify(broken)} } });`);
  await settle(page);
  expect(await notice()).toEqual({ text: "Warnings in the developer console×", hidden: false });
  await page.evaluate(() => (document.querySelector("body > div:last-of-type .dwk-dev-notice button") as HTMLButtonElement).click());
  expect(await notice()).toMatchObject({ hidden: true });
  await page.evaluate(() => console.warn("something new"));
  await settle(page);
  expect(await notice()).toMatchObject({ hidden: false });

  // Gone with the instance: the console is the page's own again, no listeners left.
  const restored = await page.evaluate(() => {
    const w = window as any;
    const wrapped = console.warn;
    w.second.destroy();
    return console.warn !== wrapped;
  });
  expect(restored).toBe(true);
  expect(await listenerCounts(page)).toEqual(before);
});
