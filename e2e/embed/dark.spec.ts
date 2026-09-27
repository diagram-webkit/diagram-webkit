import { expect, test, type Page } from "@playwright/test";
import { settle, waitReady } from "../helpers";

test.use({ viewport: { width: 1300, height: 900 } });

const FORMER_FILTER = "invert(1) hue-rotate(175deg) saturate(1.5) brightness(1.4)";

async function shot(page: Page): Promise<string> {
  await settle(page, 300);
  return (await page.locator(".slot").first().screenshot()).toString("base64");
}

// Share of pixels whose channels differ by more than `tolerance`.
async function differingShare(page: Page, a: string, b: string, tolerance = 8): Promise<number> {
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
        return context.getImageData(0, 0, image.width, image.height).data;
      };
      const [x, y] = await Promise.all([read(first as string), read(second as string)]);
      let differing = 0;
      for (let index = 0; index < x.length; index += 4) {
        if ([0, 1, 2].some((channel) => Math.abs(x[index + channel] - y[index + channel]) > (limit as number))) differing += 1;
      }
      return differing / (x.length / 4);
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
  expect(await differingShare(page, former, recoloured)).toBeLessThan(0.01);

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
