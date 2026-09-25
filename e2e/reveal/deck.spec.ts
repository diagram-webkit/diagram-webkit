import { expect, test, type Page } from "@playwright/test";
import { listenerCounts, settle } from "../helpers";
import { PORTS } from "../../playwright.config";

const DECKS = { via: `http://127.0.0.1:${PORTS.via}`, split: `http://127.0.0.1:${PORTS.split}` };

const OVERVIEW = { camera: { fit: true }, level: 0 };
const STEPS_BASE = { camera: { rect: [0.5, 0.5, 0.6, 0.8] } };
// [slide id, fragment index, expected getState().view]
const WALK: [string, number, object][] = [
  ["overview", -1, OVERVIEW],
  ["request-path", -1, { camera: { focus: { tags: ["Network.Ingress"] }, padding: 0.1 }, level: 1, onlyTags: ["Network"], pins: ["LoadBalancer"] }],
  ["level", -1, OVERVIEW],
  ["only-data", -1, { camera: { focus: { tags: ["Data.Cache"] }, padding: 0.3 }, onlyTags: ["Data"] }],
  [
    "pin",
    -1,
    { camera: { rect: [0.851, 0.379, 0.3, 0.75] }, hiddenTags: ["Observability"], pins: ["DbAccess"], highlight: { slugs: ["DbAccess"], mode: "pulse" } },
  ],
  ["steps", -1, STEPS_BASE],
  ["steps", 0, { ...STEPS_BASE, pins: ["LoadBalancer"] }],
  ["steps", 1, { ...STEPS_BASE, pins: ["LoadBalancer"], highlight: { slugs: ["WebApp"], mode: "outline" } }],
  [
    "steps",
    2,
    { camera: { focus: { slugs: ["Cache"] }, padding: 0.3 }, pins: ["LoadBalancer"], highlight: { slugs: ["WebApp"], mode: "outline" } },
  ],
  ["live", -1, OVERVIEW],
];

async function openDeck(page: Page, base = DECKS.via, search = "") {
  await page.goto(`${base}/${search}`);
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  await settle(page, 300);
}

async function current(page: Page) {
  await page.waitForTimeout(750);
  return page.evaluate(() => {
    const plugin = (window as any).diagramPlugin;
    const deck = (window as any).deck;
    if (plugin.lastError()) throw plugin.lastError();
    return { id: deck.getCurrentSlide().id, fragment: deck.getIndices().f ?? -1, view: plugin.instances()[0].getState().view };
  });
}

async function walk(page: Page, key: "ArrowRight" | "ArrowLeft", steps: number) {
  const seen = [];
  for (let step = 0; step < steps; step += 1) {
    seen.push(await current(page));
    await page.keyboard.press(key);
  }
  seen.push(await current(page));
  return seen;
}

function expected(id: string, fragment: number) {
  const entry = WALK.find(([slide, index]) => slide === id && index === fragment);
  if (!entry) throw new Error(`no expectation for ${id}/${fragment}`);
  return entry[2];
}

test.use({ viewport: { width: 1280, height: 720 } });

test("every slide and fragment forwards, backwards and on a jump", async ({ page }) => {
  await openDeck(page, DECKS.via, "#/overview");
  const forwards = await walk(page, "ArrowRight", 10);
  forwards.filter((entry) => entry.id !== "no-diagram").forEach((entry) => expect(entry.view, `${entry.id}/${entry.fragment}`).toEqual(expected(entry.id, entry.fragment)));
  const backwards = await walk(page, "ArrowLeft", 10);
  backwards.filter((entry) => entry.id !== "no-diagram").forEach((entry) => expect(entry.view, `${entry.id}/${entry.fragment}`).toEqual(expected(entry.id, entry.fragment)));
  for (const [id, fragment] of [["pin", -1], ["steps", 1], ["overview", -1], ["steps", 2], ["request-path", -1]] as const) {
    await page.evaluate(([slideId, index]) => {
      const deck = (window as any).deck;
      const slide = document.getElementById(slideId as string)!;
      deck.slide(deck.getIndices(slide).h, 0, index);
    }, [id, fragment]);
    const entry = await current(page);
    expect([entry.id, entry.fragment]).toEqual([id, fragment]);
    expect(entry.view).toEqual(expected(id, fragment));
  }
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 800, height: 600 },
]) {
  test(`pins and highlight land on their element at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openDeck(page, DECKS.via, "#/pin");
    await current(page);
    const offset = await page.evaluate(() => {
      const ring = document.querySelector(".pin-indicator")!.getBoundingClientRect();
      const element = document.querySelector('[data-slug="DbAccess"]')!;
      const target = Array.from(element.querySelectorAll("rect, text"))
        .map((node) => node.getBoundingClientRect())
        // A draw.io label's <text> fallback inside <switch> is not rendered (0x0).
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .sort((a, b) => a.width * a.height - b.width * b.height)[0];
      return { x: ring.left + ring.width / 2 - (target.left + target.width / 2), y: ring.top + ring.height / 2 - (target.top + target.height / 2) };
    });
    expect(Math.abs(offset.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(offset.y)).toBeLessThanOrEqual(2);
    await page.evaluate(() => {
      const deck = (window as any).deck;
      deck.slide(deck.getIndices(document.getElementById("steps")).h, 0, 1);
    });
    await current(page);
    // Leaving cells fade out first, then the highlight fades in.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const layer = document.querySelector<SVGSVGElement>(".dwk-highlight-layer")!;
          return {
            target: document.querySelector('[data-slug="WebApp"]')!.classList.contains("dwk-highlight-target"),
            copies: layer.querySelectorAll(".dwk-highlighted").length,
            opacity: getComputedStyle(layer).opacity,
          };
        }),
      )
      .toEqual({ target: true, copies: 1, opacity: "1" });
  });
}

test("Reveal owns the keys; the diagram only takes input on the live slide", async ({ page }) => {
  await openDeck(page, DECKS.via, "#/overview");
  const transform = () => page.evaluate(() => document.querySelector<HTMLElement>(".dwk-main-image")!.style.transform);
  const before = await transform();
  await page.keyboard.press("+");
  await page.keyboard.press("0");
  const box = (await page.locator("#overview [data-diagram-slot]").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  await settle(page, 300);
  expect(await transform()).toBe(before);
  await page.keyboard.press("ArrowRight");
  expect((await current(page)).id).toBe("request-path");

  await openDeck(page, DECKS.via, "#/live");
  await current(page);
  const live = (await page.locator("#live [data-diagram-slot]").boundingBox())!;
  const liveBefore = await transform();
  await page.mouse.move(live.x + live.width / 2, live.y + live.height / 2);
  await page.mouse.wheel(0, -400);
  await settle(page, 300);
  expect(await transform()).not.toBe(liveBefore);
  await page.keyboard.press("ArrowLeft");
  expect((await current(page)).id).toBe("no-diagram");
});

test("print view: one static instance per slot and fragment step", async ({ page }) => {
  await page.goto(`${DECKS.via}/?print-pdf`);
  await page.waitForSelector("[data-diagram-print-ready]");
  const result = await page.evaluate(() => {
    const plugin = (window as any).diagramPlugin;
    return {
      slots: document.querySelectorAll(".pdf-page [data-diagram-slot]").length,
      roots: document.querySelectorAll(".pdf-page [data-diagram-slot] > .dwk-root").length,
      views: plugin.instances().map((instance: any) => instance.getState().view),
      error: String(plugin.lastError()),
    };
  });
  expect(result.error).toBe("null");
  expect(result.roots).toBe(result.slots);
  const steps = result.views.filter((view: any) => JSON.stringify(view).includes("0.6,0.8") || (view.camera && view.camera.focus && view.camera.focus.slugs));
  expect(steps).toEqual([expected("steps", -1), expected("steps", 0), expected("steps", 1), expected("steps", 2)]);
});

test("speaker view receiver loads without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await openDeck(page, DECKS.via, "?receiver#/steps");
  await current(page);
  expect(errors).toEqual([]);
});

test("50 slide changes leak nothing", async ({ page }) => {
  await openDeck(page, DECKS.via, "#/overview");
  await current(page);
  const before = await listenerCounts(page);
  const nodesBefore = await page.evaluate(() => document.getElementsByTagName("*").length);
  for (let change = 0; change < 50; change += 1) {
    await page.evaluate((index) => {
      const deck = (window as any).deck;
      deck.slide(1 + (index % 8));
    }, change);
    await page.waitForTimeout(40);
  }
  await page.evaluate(() => (window as any).deck.slide(1));
  await current(page);
  await settle(page, 3500);
  expect(await listenerCounts(page)).toEqual(before);
  const nodesAfter = await page.evaluate(() => document.getElementsByTagName("*").length);
  expect(Math.abs(nodesAfter - nodesBefore)).toBeLessThanOrEqual(5);
  expect(await page.evaluate(() => (window as any).diagramPlugin.instances().length)).toBe(1);
});

test("a slide copied from the app gives the same view in the deck", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const search = "?pins=Cache&filter-level=1&filter-hide-tags=Network&v=0.6,0.45,0.35,0.5&debug";
  await page.addInitScript(() => localStorage.setItem("basic-diagram-about", "seen"));
  await page.goto(`http://127.0.0.1:${PORTS.app}/${search}`);
  await page.waitForFunction(() => Boolean((window as any).diagram));
  const appView = await page.evaluate(() => (window as any).diagram.getState().view);
  await page.keyboard.press("?");
  await page.locator('.help-tab[data-tab="links"]').click();
  await page.locator('[data-role="copy-slide"]').click();
  await expect(page.locator('[data-role="copy-slide"]')).toHaveText("Copied");
  const snippet = await page.evaluate(() => navigator.clipboard.readText());

  await openDeck(page, DECKS.via);
  await page.evaluate((html) => {
    document.querySelector(".slides")!.insertAdjacentHTML("beforeend", html.replace("<section", '<section id="pasted"'));
    const deck = (window as any).deck;
    deck.sync();
    deck.slide(deck.getIndices(document.getElementById("pasted")).h);
  }, snippet);
  const deckView = (await current(page)).view;
  expect(deckView).toEqual(appView);
});

test("via and split give identical states and pictures", async ({ browser }) => {
  const run = async (base: string) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await openDeck(page, base, "#/overview");
    const states = [];
    const shots = [];
    for (let step = 0; step < 9; step += 1) {
      const entry = await current(page);
      states.push(entry);
      await settle(page, 700);
      shots.push(await page.locator(".reveal").screenshot({ animations: "disabled" }));
      await page.keyboard.press("ArrowRight");
    }
    await page.close();
    return { states, shots };
  };
  const via = await run(DECKS.via);
  const split = await run(DECKS.split);
  expect(split.states).toEqual(via.states);
  const page = await browser.newPage();
  for (const [index, shot] of split.shots.entries()) {
    const ratio = await page.evaluate(
      async ([a, b]) => {
        const load = async (data: string) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = new OffscreenCanvas(image.width, image.height);
          const context = canvas.getContext("2d")!;
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, image.width, image.height).data;
        };
        const [first, second] = await Promise.all([load(a), load(b)]);
        if (first.length !== second.length) return 1;
        let differing = 0;
        for (let i = 0; i < first.length; i += 4) {
          if (Math.abs(first[i] - second[i]) + Math.abs(first[i + 1] - second[i + 1]) + Math.abs(first[i + 2] - second[i + 2]) > 30) differing += 1;
        }
        return differing / (first.length / 4);
      },
      [shot.toString("base64"), via.shots[index].toString("base64")],
    );
    expect(ratio, `slide ${via.states[index].id}`).toBeLessThan(0.005);
  }
  await page.close();
});

test("the diagram stays on screen between diagram slides and fades out on text slides", async ({ page }) => {
  await openDeck(page, DECKS.via, "#/overview");
  const stage = page.locator(".dwk-reveal-stage");
  const opacities = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const element = document.querySelector<HTMLElement>(".dwk-reveal-stage")!;
        const seen: number[] = [];
        const start = performance.now();
        const frame = () => {
          seen.push(Number(getComputedStyle(element).opacity));
          if (performance.now() - start < 600) requestAnimationFrame(frame);
          else resolve(seen);
        };
        (window as any).deck.next();
        requestAnimationFrame(frame);
      }),
  );
  expect(Math.min(...opacities)).toBe(1);
  // The slot is still in Reveal's slide transition; the stage is already where it ends.
  await page.waitForTimeout(500);
  const [stageBox, slotBox] = [(await stage.boundingBox())!, (await page.locator("#request-path [data-diagram-slot]").boundingBox())!];
  (["x", "y", "width", "height"] as const).forEach((key) => expect(stageBox[key]).toBeCloseTo(slotBox[key], 0));

  await page.evaluate(() => (window as any).deck.slide(0));
  await expect(stage).toHaveCSS("visibility", "hidden");
});

test("resize at an unchanged size keeps the camera where it is", async ({ page }) => {
  await openDeck(page, DECKS.via, "#/overview");
  const [before, after] = await page.evaluate(async () => {
    const instance = (window as any).diagramPlugin.instances()[0];
    await instance.camera.showRect([0.3, 0.4, 0.5, 0.5]);
    const rect = instance.camera.get();
    instance.resize();
    return [rect, instance.camera.get()];
  });
  expect(after).toEqual(before);
});

test("data-diagram-state-url: a pasted page URL, merged under the JSON state", async ({ page }) => {
  await openDeck(page, DECKS.via, "#/overview");
  await page.evaluate(() => {
    const slide = document.getElementById("level")!;
    // Host, path, hash, unknown and UI-only parameters are ignored.
    slide.setAttribute("data-diagram-state-url", "https://example.org/app/?v=0.4,0.5,0.3,0.3&pins=WebApp&filter-level=2&menu=true&utm=x#/somewhere");
    const deck = (window as any).deck;
    deck.slide(deck.getIndices(slide).h);
  });
  const entry = await current(page);
  expect(entry.id).toBe("level");
  // data-diagram-state='{"level":0}' on the slide wins over filter-level=2.
  expect(entry.view).toEqual({ camera: { rect: [0.4, 0.5, 0.3, 0.3] }, level: 0, pins: ["WebApp"] });
});

for (const [name, base] of Object.entries(DECKS)) {
  test(`the example URL slide (${name})`, async ({ page }) => {
    await openDeck(page, base, "#/from-url");
    const entry = await current(page);
    expect(entry.id).toBe("from-url");
    expect(entry.view).toEqual({ camera: { rect: [0.75, 0.45, 0.4, 0.5] }, onlyTags: ["Data"], pins: ["Cache"] });
  });
}

test("a broken slide shows its error over the slot and the deck keeps going", async ({ page }) => {
  await openDeck(page, DECKS.via, "#/overview");
  await page.evaluate(() => {
    document.getElementById("level")!.setAttribute("data-diagram-state", '{"level":0,}');
    const deck = (window as any).deck;
    deck.slide(deck.getIndices(document.getElementById("level")).h);
  });
  const box = page.locator(".dwk-reveal-stage .dwk-error-box-standalone");
  await expect(box).toBeVisible();
  await expect(box).toContainText("#level");
  await expect(box).toContainText("invalid JSON");
  await page.keyboard.press("ArrowRight");
  await expect(box).toHaveCount(0);
  // lastError() keeps the reported error, so read the slide directly.
  expect(await page.evaluate(() => (window as any).deck.getCurrentSlide().id)).toBe("only-data");
});
