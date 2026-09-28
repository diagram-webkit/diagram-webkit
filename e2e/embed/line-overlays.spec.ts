import { expect, test, type Page } from "@playwright/test";
import { settle, waitReady } from "../helpers";

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

test("lineOverlays: false draws nothing", async ({ page }) => {
  await page.goto("/line-overlays.html");
  await waitReady(page);
  const off = `const def = w.definition.extend({ features: { preset: "embed", lineOverlays: false } });`;
  expect(await mountAndRead(page, `${off} return w.mountDiagram(slot, def);`)).toMatchObject({ layers: 0 });
});

