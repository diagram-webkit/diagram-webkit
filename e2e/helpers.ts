import type { Page } from "@playwright/test";

export async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => document.body.dataset.ready === "true" || Boolean(document.body.dataset.error));
  const error = await page.evaluate(() => document.body.dataset.error);
  if (error) throw new Error(`page failed: ${error}`);
  await settle(page);
}

export async function settle(page: Page, ms = 150): Promise<void> {
  await page.evaluate(
    (delay) => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, delay)))),
    ms,
  );
}

// Client position of a viewBox point in instance `index`.
export async function svgPointOnScreen(page: Page, index: number, x: number, y: number) {
  return page.evaluate(
    ([i, px, py]) => {
      const svg = document.querySelectorAll<SVGSVGElement>(".dwk-main-image > svg")[i];
      const point = new DOMPoint(px, py).matrixTransform(svg.getScreenCTM()!);
      return { x: point.x, y: point.y };
    },
    [index, x, y] as const,
  );
}

export async function screenPointInSvg(page: Page, index: number, x: number, y: number) {
  return page.evaluate(
    ([i, px, py]) => {
      const svg = document.querySelectorAll<SVGSVGElement>(".dwk-main-image > svg")[i];
      const point = new DOMPoint(px, py).matrixTransform(svg.getScreenCTM()!.inverse());
      return { x: point.x, y: point.y };
    },
    [index, x, y] as const,
  );
}

export async function listenerCounts(page: Page): Promise<{ document: number; window: number }> {
  const session = await page.context().newCDPSession(page);
  const count = async (expression: string) => {
    const { result } = await session.send("Runtime.evaluate", { expression });
    const { listeners } = await session.send("DOMDebugger.getEventListeners", { objectId: result.objectId! });
    return listeners.length;
  };
  const counts = { document: await count("document"), window: await count("window") };
  await session.detach();
  return counts;
}
