import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { settle, waitReady } from "../helpers";

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

