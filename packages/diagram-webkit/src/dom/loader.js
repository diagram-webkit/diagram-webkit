// Loads the SVG into the instance. Source is { url } | { svgText } | { svg }.
import { childSignal } from "./context.js";
import { sanitizeSvg } from "./svg-sanitize.js";

/** @type {WeakMap<Window, Map<string, Promise<Element>>>} */
const parsedByWindow = new WeakMap();

export class DiagramLoadError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "DiagramLoadError";
  }
}

export function parseAspectRatio(svgEl) {
  const viewBox = svgEl.getAttribute("viewBox");
  if (!viewBox) return null;
  const parts = viewBox.split(/[\s,]+/).map(Number);
  if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3]) && parts[2] > 0 && parts[3] > 0) {
    return parts[2] / parts[3];
  }
  return null;
}

const DIAGRAM_BACKGROUND = "#ffffff";

// The diagram is drawn light and the dark theme is a filter on top. draw.io's
// "Save as SVG" writes light-dark() colours with `color-scheme: light dark`
// and a transparent background, which would follow the OS scheme and show the
// black surface behind the diagram. An opaque author background is kept.
function applyLightCanvas(svgEl) {
  svgEl.style.colorScheme = "light";
  const background = svgEl.ownerDocument.defaultView.getComputedStyle(svgEl).backgroundColor;
  if (isTransparent(background)) svgEl.style.backgroundColor = DIAGRAM_BACKGROUND;
}

function isTransparent(color) {
  return color === "transparent" || /^rgba\(.*,\s*0\)$/.test(color);
}

/** @param {import("./context").Context & Record<string, any>} ctx */
export function createLoader(ctx) {
  // requestAnimationFrame never fires in a hidden tab, so a page opened in the
  // background would sit on the loading overlay until focused. Run the
  // callback on the first of rAF, a timeout, or the tab becoming visible.
  function scheduleOnceWhenRenderable(callback) {
    const controller = childSignal(ctx.signal);
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      controller.abort();
      callback();
    };
    ctx.timers.requestAnimationFrame(run);
    ctx.timers.setTimeout(run, 250);
    ctx.doc.addEventListener(
      "visibilitychange",
      () => {
        if (!ctx.doc.hidden) run();
      },
      { signal: controller.signal },
    );
  }

  // One fetch and parse per URL and window for mounts that load at the same
  // time (Reveal print and per-slide mode mount one per slot). Not tied to an
  // instance's signal, so destroying one instance never fails the others.
  async function fetchMarkup(url) {
    let response;
    try {
      response = await ctx.win.fetch(url, { cache: "no-cache" });
    } catch (error) {
      throw new DiagramLoadError(`Network error while loading ${url}: ${error.message}`, { cause: error });
    }
    if (!response.ok) throw new DiagramLoadError(`HTTP ${response.status} while loading ${url}`);
    return response.text();
  }

  // HTML parsing (draw.io output may use HTML
  // entities), but in an inert document.
  function parseMarkup(markup) {
    const parsed = new ctx.win.DOMParser().parseFromString(`<!doctype html><body>${markup}`, "text/html");
    const svg = parsed.body.querySelector("svg");
    if (!svg) throw new DiagramLoadError("Loaded diagram is not a valid SVG");
    return svg;
  }

  function parsedFromUrl(url) {
    if (!parsedByWindow.has(ctx.win)) parsedByWindow.set(ctx.win, new Map());
    const cache = parsedByWindow.get(ctx.win);
    if (!cache.has(url)) {
      const pending = fetchMarkup(url).then(parseMarkup);
      // Only while in flight: the parsed document is released once loaded,
      // and a later mount fetches again (and sees a changed file).
      const release = () => cache.delete(url);
      pending.then(release, release);
      cache.set(url, pending);
    }
    return cache.get(url);
  }

  // source: { url } | { svgText } | { svg }, plus untrusted: true for a
  // diagram from outside the definition. That one is cleaned while still in
  // the inert document: importing first would already start <img> loads and
  // their onerror handlers.
  async function readSource(source) {
    if (source.svg) return source.svg.cloneNode(true);
    let svg = source.svgText !== undefined ? parseMarkup(source.svgText) : await parsedFromUrl(source.url);
    if (source.untrusted) svg = sanitizeSvg(/** @type {Element} */ (svg.cloneNode(true)));
    return ctx.doc.importNode(svg, true);
  }

  async function loadDiagram(source) {
    const svgEl = await readSource(source);
    if (!svgEl || svgEl.nodeName.toLowerCase() !== "svg") throw new DiagramLoadError("Loaded diagram is not a valid SVG");

    ctx.els.image.replaceChildren(svgEl);
    svgEl.setAttribute("preserveAspectRatio", "xMinYMin meet");
    svgEl.style.display = "block";
    svgEl.style.width = "100%";
    svgEl.style.height = "100%";
    svgEl.style.pointerEvents = "auto";
    applyLightCanvas(svgEl);
    return parseAspectRatio(svgEl);
  }

  return { loadDiagram, scheduleOnceWhenRenderable };
}
