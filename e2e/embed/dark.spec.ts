import { expect, test, type Page } from "@playwright/test";
import { settle, waitReady } from "../helpers";

test.use({ viewport: { width: 1300, height: 900 } });

const FORMER_FILTER = "invert(1) hue-rotate(175deg) saturate(1.5) brightness(1.4)";

async function shot(page: Page): Promise<string> {
  await settle(page, 300);
  return (await page.locator(".slot").first().screenshot()).toString("base64");
}

// Share of pixels whose channels differ by more than `tolerance`, over pixels
// whose 3x3 neighbourhood is uniform in both images. Edges and text are left
// out: the filter recolours after anti-aliasing, recolouring before, and the
// filter is not linear, so edge pixels differ by platform font rendering.
async function differingShare(page: Page, a: string, b: string, tolerance = 8): Promise<{ share: number; compared: number }> {
  return page.evaluate(
    async ([first, second, limit]) => {
      const read = async (b64: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${b64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height);
      };
      const [x, y] = await Promise.all([read(first as string), read(second as string)]);
      const { width, height } = x;
      const differs = (p: Uint8ClampedArray, q: Uint8ClampedArray, i: number, j: number) =>
        [0, 1, 2].some((channel) => Math.abs(p[i + channel] - q[j + channel]) > (limit as number));
      const uniform = (data: Uint8ClampedArray, px: number, py: number) => {
        const centre = (py * width + px) * 4;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (differs(data, data, centre, ((py + dy) * width + px + dx) * 4)) return false;
          }
        }
        return true;
      };
      let compared = 0;
      let differing = 0;
      for (let py = 1; py < height - 1; py += 1) {
        for (let px = 1; px < width - 1; px += 1) {
          if (!uniform(x.data, px, py) || !uniform(y.data, px, py)) continue;
          compared += 1;
          const index = (py * width + px) * 4;
          if (differs(x.data, y.data, index, index)) differing += 1;
        }
      }
      return { share: differing / compared, compared: compared / (width * height) };
    },
    [a, b, tolerance] as const,
  );
}

test("dark theme: recoloured, no filter on the diagram, looks like the former filter, and light comes back", async ({ page }) => {
  await page.goto("/embed.html?layout=single");
  await waitReady(page);
  const svg = page.locator(".dwk-main-image > svg").first();
  const colours = () =>
    svg.evaluate((root) =>
      [root, ...root.querySelectorAll("*")].map((element) => {
        const style = getComputedStyle(element);
        return ["fill", "stroke", "color", "background-color", "stop-color"].map((prop) => style.getPropertyValue(prop)).join("|");
      }),
    );
  const lightColours = await colours();
  const styleAttributes = () => svg.evaluate((root) => root.querySelectorAll("[style]").length);
  const lightStyleAttributes = await styleAttributes();

  await page.addStyleTag({ content: `.dwk-main-image > svg { filter: ${FORMER_FILTER} !important; }` });
  const former = await shot(page);
  await page.evaluate(() => document.querySelectorAll("style:last-of-type").forEach((style) => style.remove()));

  await page.evaluate(() => (window as any).instances[0].setState({ view: { theme: "dark" } }));
  const recoloured = await shot(page);
  expect(await svg.evaluate((element) => getComputedStyle(element).filter)).toBe("none");
  const { share, compared } = await differingShare(page, former, recoloured);
  expect(compared).toBeGreaterThan(0.5);
  expect(share).toBeLessThan(0.01);

  await page.evaluate(() => (window as any).instances[0].setState({ view: { theme: "light" } }));
  await settle(page);
  expect(await colours()).toEqual(lightColours);
  expect(await styleAttributes()).toBe(lightStyleAttributes);
});

test("dark theme: highlight copies follow the theme", async ({ page }) => {
  await page.goto("/embed.html?layout=single");
  await waitReady(page);
  const fill = () => page.evaluate(() => {
    const copy = document.querySelector(".dwk-highlight-layer [style*=fill], .dwk-highlight-layer rect");
    return copy ? getComputedStyle(copy).fill : null;
  });
  await page.evaluate(() => (window as any).instances[0].setState({ view: { highlight: { slugs: ["Cache"] } } }));
  await settle(page);
  const light = await fill();
  await page.evaluate(() => (window as any).instances[0].setState({ view: { theme: "dark" } }));
  await settle(page);
  const dark = await fill();
  expect(light).not.toBeNull();
  expect(dark).not.toBe(light);
});
