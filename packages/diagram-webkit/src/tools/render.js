// `diagram-webkit render`: a finished SVG from a draw.io SVG. The line
// overlays and box arrows are drawn in (dom/overlays/line-overlays.js, run in headless
// Chromium through Playwright, the same code as in the page) and draw.io's
// embedded model (the `content` attributes) is removed. The result is no
// longer a draw.io file; the metadata diagram-webkit reads stays.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A made-up origin the page and the engine's dist/ are served from.
const ORIGIN = "http://render.diagram-webkit.invalid";
const DIST_DIR = fileURLToPath(new URL("../../dist/", import.meta.url));
const TYPES = { ".js": "text/javascript", ".map": "application/json", ".css": "text/css" };

export class RenderError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "RenderError";
  }
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
    throw new RenderError("render needs Playwright: npm i -D playwright && npx playwright install chromium", { cause: error });
  }
}

function serveDist(route) {
  const { pathname } = new URL(route.request().url());
  if (pathname === "/") return route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" });
  const file = path.join(DIST_DIR, pathname);
  if (!file.startsWith(DIST_DIR) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: `not in dist/: ${pathname}` });
  return route.fulfill({ path: file, contentType: TYPES[path.extname(file)] || "application/octet-stream" });
}

// Runs in the page.
async function renderInPage({ text, metadata, tags }) {
  const { renderLineOverlays } = await import("/index.js");
  // As the loader does: HTML parsing, since draw.io may write HTML entities.
  const parsed = new DOMParser().parseFromString(`<!doctype html><body>${text}`, "text/html");
  const source = parsed.body.querySelector("svg");
  if (!source) throw new Error("the file is not an SVG");
  const svg = document.importNode(source, true);
  document.body.appendChild(svg);
  const summary = renderLineOverlays(svg, { metadata, tags });
  [svg, ...svg.querySelectorAll("g[content]")].forEach((element) => element.removeAttribute("content"));
  return { svg: new XMLSerializer().serializeToString(svg), summary };
}

/**
 * @param {string} svgText a draw.io SVG
 * @param {{ metadata?: Record<string, string>, tags?: Record<string, any>, sourceName?: string }} [options]
 * @returns {Promise<{ svg: string, overlays: string[], bands: number, arrows: number }>}
 * Throws RenderError when the page reports a warning or an error: a band left
 * out must not end up unnoticed in a committed file.
 */
export async function renderSvg(svgText, options = {}) {
  if (!fs.existsSync(path.join(DIST_DIR, "index.js"))) throw new RenderError(`no engine build in ${DIST_DIR}: run npm run build in diagram-webkit`);
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const problems = [];
    page.on("console", (message) => ["warning", "error"].includes(message.type()) && problems.push(message.text()));
    page.on("pageerror", (error) => problems.push(error.message));
    await page.route(`${ORIGIN}/**`, serveDist);
    await page.goto(`${ORIGIN}/`);
    // Plain data only: the definition's tags without functions.
    const tags = JSON.parse(JSON.stringify(options.tags || {}));
    const { svg, summary } = await page.evaluate(renderInPage, { text: svgText, metadata: options.metadata || {}, tags });
    if (problems.length > 0) throw new RenderError(`render: ${problems.join("\n")}`);
    const note = `<!-- Rendered by diagram-webkit render from ${options.sourceName || "a draw.io SVG"}: line overlays and box arrows drawn in, draw.io's model removed. Edit the source in draw.io, not this file. -->`;
    return { svg: `<?xml version="1.0" encoding="UTF-8"?>\n${note}\n${svg}\n`, ...summary };
  } finally {
    await browser.close();
  }
}
