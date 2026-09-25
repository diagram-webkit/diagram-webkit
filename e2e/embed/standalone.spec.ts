import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { devices, expect, test, type Page } from "@playwright/test";

// Local mode: no diagram in the definition (e2e/pages/standalone.html).
const SVG_FILE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../examples/direct--basic-diagram/example.svg");
const SVG = fs.readFileSync(SVG_FILE, "utf8");

test.use({ viewport: { width: 1280, height: 800 } });

const cells = (page: Page) => page.evaluate(() => document.querySelectorAll(".dwk-main-image [data-tags]").length);
const loaded = (page: Page) => page.waitForFunction(() => document.querySelectorAll(".dwk-main-image [data-tags]").length > 0, null, { timeout: 15_000 });

async function dropSvg(page: Page, text: string, name = "dropped.svg") {
  await page.evaluate(
    ([svgText, fileName]) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([svgText], fileName, { type: "image/svg+xml" }));
      const root = document.querySelector(".dwk-root")!;
      for (const type of ["dragenter", "dragover", "drop"]) root.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
    },
    [text, name],
  );
}

async function embedded(page: Page, text: string) {
  return page.evaluate(async (svgText) => {
    const stream = new Blob([new TextEncoder().encode(svgText)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = "";
    bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }, text);
}

// The help dialog on its Links tab.
async function openHelp(page: Page) {
  await page.keyboard.press("?");
  await page.locator('.help-tab[data-tab="links"]').click();
  await expect(page.locator(".dwk-help-panel-links")).toBeVisible();
}

// Barely compressible filler: about 0.86 link characters per character.
const padded = (chars: number) => {
  let filler = "";
  while (filler.length < chars) filler += Math.random().toString(36).slice(2);
  return SVG.replace("</svg>", `<!-- ${filler.slice(0, chars)} --></svg>`);
};

test("picker, file, the diagram kept in the URL, and no request", async ({ page }) => {
  const requests: string[] = [];
  await page.goto("/standalone.html");
  await expect(page.locator(".dwk-local-picker-card")).toBeVisible();
  page.on("request", (request) => requests.push(request.url()));
  await page.setInputFiles(".dwk-local-picker input[type=file]", SVG_FILE);
  await loaded(page);
  expect(requests).toEqual([]);
  await expect(page.locator(".dwk-help-dialog")).toBeHidden();
  expect(await page.evaluate(() => location.hash.startsWith("#svg="))).toBe(true);

  await page.reload();
  await loaded(page);
  await expect(page.locator(".dwk-help-dialog")).toBeHidden();
  expect(await cells(page)).toBe(14);
});

test("without a definition the menu has Priority and the Tags tree", async ({ page }) => {
  await page.goto("/standalone.html");
  await page.setInputFiles(".dwk-local-picker input[type=file]", SVG_FILE);
  await loaded(page);
  await page.locator(".dwk-floating-filter-toggle").click();
  await expect(page.locator(".tag-group-title")).toHaveText(["Level", "Priority", "Tags"]);
  await expect(page.locator(".tag-group-buttons .tag-filter-btn")).toHaveText(["info", "pri-1"]);
  await expect(page.locator(".tag-tree-header")).toHaveCount(1);
  await expect(page.locator('.tag-tree .tag-filter-btn[data-tag="pri-1"]')).toHaveCount(0);
});

test("a dropped SVG replaces the diagram and its view", async ({ page }) => {
  await page.goto("/standalone.html");
  await dropSvg(page, SVG);
  await loaded(page);
  await page.evaluate(() => history.replaceState(null, "", `${location.pathname}?v=0.3,0.3,0.2,0.2&pins=Cache${location.hash}`));
  const before = await page.evaluate(() => location.hash);
  await dropSvg(page, SVG.replaceAll("Load balancer", "Replaced balancer"), "other.svg");
  await page.waitForURL((url) => url.hash !== before, { timeout: 15_000 });
  await loaded(page);
  expect(await page.evaluate(() => document.querySelector(".dwk-main-image svg")!.textContent!.includes("Replaced balancer"))).toBe(true);
  expect(await page.evaluate(() => location.search)).toBe("");
});

test("link mode: svg=<URL> is fetched, stays a link, and the link field writes it", async ({ page }) => {
  const seen: Record<string, string>[] = [];
  await page.route("https://diagrams.example/**", (route) => {
    seen.push(route.request().headers());
    route.fulfill({ body: SVG, contentType: "image/svg+xml", headers: { "access-control-allow-origin": "*" } });
  });
  for (const url of ["/standalone.html#svg=https://diagrams.example/net.svg", "/standalone.html?svg=https://diagrams.example/net.svg"]) {
    await page.goto(url);
    await loaded(page);
  }
  expect(seen.every((headers) => headers.referer === undefined && headers.cookie === undefined)).toBe(true);
  // Not converted: the address and every link keep the URL, no data.
  expect(await page.evaluate(() => location.hash)).toBe("#svg=https://diagrams.example/net.svg");
  await openHelp(page);
  await expect(page.locator(".dwk-embed-status")).toContainText("open the diagram from https://diagrams.example/net.svg");
  await expect(page.locator(".link-info-link").first()).toContainText("the diagram itself included");

  // The link field, on a fresh page: the address gets svg=<URL>.
  await page.goto("/standalone.html");
  await page.fill(".dwk-local-picker-row input", "https://diagrams.example/other.svg");
  await page.click(".dwk-local-picker-row button");
  await loaded(page);
  expect(await page.evaluate(() => location.hash)).toBe("#svg=https://diagrams.example/other.svg");
  await page.reload();
  await loaded(page);
  expect(seen.length).toBe(4);
});

test("#svg= compressed, plain base64 and ?svg=; a broken one says why", async ({ page }) => {
  await page.goto("/standalone.html?manual");
  const compressed = await embedded(page, SVG);
  const plain = Buffer.from(SVG).toString("base64");
  // ?svg= goes to the server: plain base64 of a draw.io SVG exceeds Node's 16 KB header limit (431).
  for (const url of [`/standalone.html#svg=${compressed}`, `/standalone.html#svg=${plain}`, `/standalone.html?svg=${compressed}`]) {
    await page.goto(url);
    await loaded(page);
    expect(await cells(page), url).toBe(14);
  }
  await page.goto("/standalone.html#svg=not-a-diagram");
  await expect(page.locator(".dwk-local-picker-error")).toContainText("could not be read");
});

test("embedded link: warnings at 32k and 100k, refused past 2 MiB", async ({ page }) => {
  for (const [chars, level] of [
    [1_000, "ok"],
    [40_000, "long"],
    [150_000, "very-long"],
    [3_000_000, "too-large"],
  ] as const) {
    await page.goto("/standalone.html");
    await dropSvg(page, padded(chars));
    await loaded(page);
    await openHelp(page);
    const status = page.locator(`.dwk-embed-status.is-${level}`);
    await expect(status).toBeVisible();
    // Inside the links (in the address) unless too large for that.
    expect(await page.evaluate(() => location.hash.startsWith("#svg="))).toBe(level !== "too-large");
    await expect(page.locator(".link-info-link").first()).toContainText(level === "too-large" ? "Exactly this view: position" : "the diagram itself included");
  }
});

test("an SVG from outside cannot run script or make requests", async ({ page }) => {
  const outside: string[] = [];
  await page.route("https://evil.example/**", (route) => {
    outside.push(route.request().url());
    route.abort();
  });
  const hostile = SVG.replace(
    "<svg ",
    `<svg onload="window.__x = 1" `,
  )
    .replace(
      "</svg>",
      `<script>window.__x = 2</script>
<image href="https://evil.example/a.png" width="10" height="10"/>
<foreignObject width="50" height="50"><div xmlns="http://www.w3.org/1999/xhtml"><img src="https://evil.example/b.png" onerror="window.__x = 3"/><a id="js-link" href="javascript:window.__x = 4">x</a></div></foreignObject>
<style>@import url(https://evil.example/c.css); rect { fill: url(https://evil.example/d.png); }</style>
<g data-tags="Hostile" data-slug="Hostile" data-help="Hostile&#10;&lt;img src=x onerror=&quot;window.__x = 5&quot;&gt;&lt;a href=&quot;javascript:window.__x = 6&quot;&gt;link&lt;/a&gt;"><rect x="20" y="90" width="30" height="30"/></g>
</svg>`,
    );
  await page.goto("/standalone.html");
  await dropSvg(page, hostile);
  await loaded(page);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).__x)).toBeUndefined();
  expect(outside).toEqual([]);
  const checks = await page.evaluate(() => {
    const image = document.querySelector(".dwk-main-image svg")!;
    return {
      scripts: image.querySelectorAll("script").length,
      handlers: Array.from(image.querySelectorAll("*")).filter((node) => Array.from(node.attributes).some((a) => a.name.startsWith("on"))).length,
      jsLink: document.getElementById("js-link")!.getAttribute("href"),
      tooltips: Array.from(document.querySelectorAll(".tooltip-content")).map((node) => node.innerHTML).join(" "),
    };
  });
  expect(checks.scripts).toBe(0);
  expect(checks.handlers).toBe(0);
  expect(checks.jsLink).toBeNull();
  expect(checks.tooltips).not.toContain("onerror");
  expect(checks.tooltips).not.toContain("javascript:");
});

test("a defined diagram has none of it", async ({ page }) => {
  await page.goto("/app.html#svg=anything");
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  await expect(page.locator(".dwk-local-picker")).toHaveCount(0);
  await page.keyboard.press("?");
  await expect(page.locator(".dwk-embed-status")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).instance.definition.id)).toBe("basic-diagram");
});

test("an embedded instance without a definition asks inside its container", async ({ page }) => {
  await page.goto("/standalone.html?manual");
  await page.evaluate(() => {
    const container = document.createElement("div");
    container.id = "box";
    container.style.cssText = "width: 600px; height: 400px; position: relative";
    document.body.appendChild(container);
    (window as any).mountDiagram(container, undefined, { features: "embed" }).then((instance: unknown) => ((window as any).embedded = instance));
  });
  await expect(page.locator("#box .dwk-local-picker-card")).toBeVisible();
  await page.setInputFiles("#box .dwk-local-picker input[type=file]", SVG_FILE);
  await page.waitForFunction(() => Boolean((window as any).embedded));
  expect(await page.evaluate(() => location.hash)).toBe("");
  expect(await page.evaluate(() => document.querySelectorAll("#box .dwk-main-image [data-tags]").length)).toBe(14);
});

test("the single-file build opens from disk and makes no request", async ({ browser }) => {
  const example = path.resolve(path.dirname(SVG_FILE), "../direct--standalone-app");
  execFileSync("npm", ["run", "-s", "build"], { cwd: example, stdio: "pipe" });
  const html = fs.readFileSync(path.join(example, "dist/index.html"), "utf8");
  expect(fs.readdirSync(path.join(example, "dist"))).toEqual(["index.html"]);
  expect(html).not.toMatch(/<script[^>]+\ssrc=|<link[^>]+stylesheet/);

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const outside: string[] = [];
  await context.route(/^(?!file:)/, (route) => {
    outside.push(route.request().url());
    route.abort();
  });
  const page = await context.newPage();
  await page.goto(`file://${path.join(example, "dist/index.html")}`);
  await page.setInputFiles(".dwk-local-picker input[type=file]", SVG_FILE);
  await loaded(page);
  await page.reload();
  await loaded(page);
  expect(outside).toEqual([]);
  await context.close();
});

test("the picker says what this is and that nothing leaves the browser; About credits and lists users", async ({ page }) => {
  await page.goto("/standalone.html");
  const card = page.locator(".dwk-local-picker-card");
  await expect(page.locator(".dwk-close-help-dialog")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Nothing leaves this browser");
  await expect(card.locator('.dwk-local-picker-project a[href="https://github.com/diagram-webkit/diagram-webkit"]')).toHaveCount(1);
  await expect(card.locator('.dwk-local-picker-project a[href="https://github.com/diagram-webkit/diagram-webkit/blob/main/docs/user-guide.md"]')).toHaveCount(1);
  await page.setInputFiles(".dwk-local-picker input[type=file]", SVG_FILE);
  await loaded(page);
  // No first-visit About over a diagram the reader just chose.
  await expect(page.locator(".dwk-about-modal")).toBeHidden();
  // Before a diagram the dialog cannot be closed; after, the footer "?" opens it.
  await page.locator(".dwk-help-toggle").click();
  await expect(page.locator(".help-tab.active")).toHaveText("Open diagram");
  await page.locator('.help-tab[data-tab="about"]').click();
  const about = page.locator(".dwk-help-panel-about");
  await expect(about).toContainText("Nothing leaves this browser");
  await expect(about.locator('a[href="https://github.com/diagram-webkit/diagram-webkit"]')).toHaveCount(1);
  expect(await about.locator(".about-list a").count()).toBeGreaterThan(0);
  await expect(about.locator('a[href="https://github.com/diagram-webkit/diagram-webkit/blob/main/docs/user-guide.md"]')).toHaveCount(1);
  await expect(about.locator(".about-name")).toHaveText("diagram-webkit");
  await expect(about.locator(".about-facts dt")).toHaveText(["Version", "License", "Source"]);
  await expect(about.locator('.about-facts a[href="https://github.com/diagram-webkit/diagram-webkit/issues"]')).toHaveCount(1);
  await expect(page.locator(".dwk-open-another")).toHaveCount(0);
  // Footer: GitHub (issues) star, and "?" on the same line.
  const footer = page.locator(".footer-github");
  await expect(footer.locator("a")).toHaveText(["GitHub", "issues", "⭐"]);
  await expect(footer.locator('a[href="https://github.com/diagram-webkit/diagram-webkit/issues"]')).toHaveCount(1);
  await expect(footer.locator(".dwk-help-toggle")).toHaveCount(1);
});

test("the SVG can be downloaded again, cleaned, from a #svg= link", async ({ page }) => {
  const hostile = SVG.replace("</svg>", "<script>window.__x = 1</script></svg>");
  await page.goto("/standalone.html");
  await dropSvg(page, hostile, "network.svg");
  await loaded(page);
  await openHelp(page);
  const button = page.locator('.dwk-embed-status [data-role="download-svg"]');
  await expect(button).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  expect(download.suggestedFilename()).toBe("network.svg");
  const text = fs.readFileSync(await download.path(), "utf8");
  expect(text).toContain('data-slug="LoadBalancer"');
  expect(text).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(text).not.toContain("<script");
});


test("replacing a file with a link switches to link mode", async ({ page }) => {
  await page.route("https://diagrams.example/**", (route) =>
    route.fulfill({ body: SVG.replaceAll("Load balancer", "Linked balancer"), contentType: "image/svg+xml", headers: { "access-control-allow-origin": "*" } }),
  );
  await page.goto("/standalone.html");
  await page.setInputFiles(".dwk-local-picker input[type=file]", SVG_FILE);
  await loaded(page);
  expect(await page.evaluate(() => location.hash.length)).toBeGreaterThan(100);
  await page.locator(".dwk-help-toggle").click();
  await page.locator('.help-tab[data-tab="open"]').click();
  await page.fill(".dwk-local-picker-row input", "https://diagrams.example/net.svg");
  await page.click(".dwk-local-picker-row button");
  await page.waitForURL((url) => url.hash === "#svg=https://diagrams.example/net.svg", { timeout: 15_000 });
  await loaded(page);
  expect(await page.evaluate(() => document.querySelector(".dwk-main-image svg")!.textContent!.includes("Linked balancer"))).toBe(true);
});

test("help dialog: tabs that apply, arrow keys, a steady box, and a phone layout", async ({ page, browser }) => {
  await page.goto("/standalone.html");
  await page.setInputFiles(".dwk-local-picker input[type=file]", SVG_FILE);
  await loaded(page);
  await page.keyboard.press("?");
  await expect(page.locator(".help-tab.active")).toHaveText("Controls");
  await expect(page.locator(".help-tab:not([hidden])")).toHaveText(["Open diagram", "About", "Share", "URL parameters", "Controls"]);
  // Arrows switch tabs from anywhere in the dialog, focus on a tab or not.
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".help-tab.active")).toHaveText("Open diagram");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".help-tab.active")).toHaveText("About");
  await page.keyboard.press("End");
  await expect(page.locator(".help-tab.active")).toHaveText("Controls");
  // The dialog does not move or resize between tabs.
  const boxes = new Set<string>();
  for (const tab of ["open", "about", "links", "url", "shortcuts"]) {
    await page.locator(`.help-tab[data-tab="${tab}"]`).click();
    const box = (await page.locator(".help-dialog-content").boundingBox())!;
    boxes.add([box.x, box.y, box.width, box.height].map(Math.round).join(","));
  }
  expect(boxes.size).toBe(1);
  await expect(page.locator(".help-dialog-meta")).toContainText("diagram-webkit v");

  const phone = await browser.newContext({ ...devices["iPhone 13"] });
  const mobile = await phone.newPage();
  await mobile.goto(`${new URL(page.url()).origin}/standalone.html`);
  await mobile.setInputFiles(".dwk-local-picker input[type=file]", SVG_FILE);
  await loaded(mobile);
  await mobile.locator(".dwk-help-toggle").tap();
  // Controls stays (mouse and touch), without its keyboard section.
  await expect(mobile.locator(".help-tab:not([hidden])")).toHaveText(["Open diagram", "About", "Share", "URL parameters", "Controls"]);
  await mobile.locator('.help-tab[data-tab="shortcuts"]').tap();
  await expect(mobile.locator(".help-keys")).toBeHidden();
  const widths = await mobile.evaluate(() => ({
    content: document.querySelector(".help-dialog-content")!.getBoundingClientRect().width,
    viewport: window.innerWidth,
    pageScroll: document.documentElement.scrollWidth > window.innerWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
  expect(widths.pageScroll).toBe(false);
  await phone.close();
});


test("the wheel scrolls the help dialog's content, and moves nothing behind it", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 420 });
  await page.goto("/standalone.html");
  await page.setInputFiles(".dwk-local-picker input[type=file]", SVG_FILE);
  await loaded(page);
  await page.locator(".dwk-help-toggle").click();
  await page.locator('.help-tab[data-tab="about"]').click();
  const body = page.locator(".help-dialog-body");
  const transform = () => page.evaluate(() => document.querySelector<HTMLElement>(".dwk-main-image")!.style.transform);
  const before = await transform();
  expect(await body.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  const box = (await body.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  // Over the backdrop: no zoom behind the dialog.
  await page.mouse.move(5, 5);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(200);
  expect(await transform()).toBe(before);
});
