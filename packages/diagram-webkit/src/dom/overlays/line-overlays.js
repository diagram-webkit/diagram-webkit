// What the engine draws along lines: overlay bands (overlay=<name>, styled
// like the line with overlay-definition=<name>; drawn on top of the whole
// diagram, except the cells with a slug, which stay above them) and box
// arrows (arrow-at-each-box, box-arrows.js). Each follows the visibility,
// fade and dim of the cells it belongs to. core/line-overlays.ts has the
// geometry, svg-geometry.js reads it from attributes.
//
// drawAll() draws into an <svg>; the `render` CLI uses it to write a finished
// SVG, marked data-dwk-rendered, in which each band and arrow names its cells
// in data-lines (their ids). An instance uses those as they are and only
// connects their visibility; it never draws them again.
import { LineOverlayError, layoutOverlays, parseOverlayNames } from "../../core/line-overlays";
import { DEFAULT_TAGS_CONFIG, createTagModel } from "../../core/tags";
import { DEFAULT_METADATA_ATTRS } from "../../core/validate";
import { BOX_ARROW_CLASS, drawBoxArrows } from "./box-arrows.js";
import { CELL_TYPE_ATTR, byId, cellName, readBoxes, readLine, rootMatrix, warn } from "./svg-geometry.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const LAYER_CLASS = "dwk-line-overlays";
export const GROUP_CLASS = "dwk-line-overlay";
const BAND_CLASS = "dwk-line-overlay-band";
const TARGET_CLASS = "dwk-line-overlay-target";
const HIGHLIGHT_TARGET_CLASS = "dwk-highlight-target";
// Moved to the overlay's group, so overlapping bands never stack up darker.
const GROUP_OPACITY_ATTRS = ["opacity", "stroke-opacity"];
const OPACITY_ATTRS = [...GROUP_OPACITY_ATTRS, "fill-opacity"];
const NOT_COPIED = new Set(["d", "id", "pointer-events", ...OPACITY_ATTRS]);
const LINES_ATTR = "data-lines";
// Bands side by side meet exactly; antialiasing would leave a light seam
// along a curved meeting line. This much wider (in diagram units, half on
// each side) and they overlap instead. Their ends stay where they are.
const SEAM_OVERLAP = 0.5;
const RENDERED_ATTR = "data-dwk-rendered";
const ABOVE_CLASS = "dwk-above-overlays";
const DRAWN = `.${LAYER_CLASS}, .${BOX_ARROW_CLASS}`;

// data-lines for the cells a band or arrow follows; null when an id cannot go
// in a space-separated list.
const linesAttr = (ids) => (ids.every((id) => id && !/\s/.test(id)) ? ids.join(" ") : null);

// Definition name -> the path whose look the bands copy, in diagram order,
// and the tags the bands carry (overlay-tags on the definition line).
function readDefinitions(svg, metadata) {
  /** @type {Map<string, SVGPathElement>} */
  const definitions = new Map();
  /** @type {Map<string, string>} */
  const tags = new Map();
  svg.querySelectorAll(`[${metadata.overlayDefinitionAttr}]`).forEach((element) => {
    const value = element.getAttribute(metadata.overlayDefinitionAttr);
    const names = parseOverlayNames(value);
    const path = element.querySelector("path");
    const name = cellName(element, metadata);
    if (names.length !== 1) warn(`overlay-definition on ${name} ignored: must be one name, got "${value}"`);
    else if (!path) warn(`overlay-definition ${names[0]} on ${name} ignored: no line to take the look from`);
    else if (definitions.has(names[0])) warn(`overlay-definition ${names[0]} on ${name} ignored: already defined`);
    else {
      definitions.set(names[0], path);
      const own = (element.getAttribute(metadata.overlayTagsAttr) || "").trim();
      if (own) tags.set(names[0], own);
    }
  });
  return { definitions, tags };
}

function readLines(svg, definitions, metadata) {
  const order = Array.from(definitions.keys());
  const lines = [];
  svg.querySelectorAll(`[${metadata.overlayAttr}]`).forEach((element) => {
    const names = parseOverlayNames(element.getAttribute(metadata.overlayAttr));
    if (names.length === 0) return;
    const name = cellName(element, metadata);
    const type = element.getAttribute(CELL_TYPE_ATTR);
    if (type && type !== "edge") {
      warn(`overlay on ${name} ignored: only lines can have one (it is a ${type})`);
      return;
    }
    names.filter((overlay) => !definitions.has(overlay)).forEach((overlay) => warn(`overlay ${overlay} on ${name}: no line has overlay-definition ${overlay}`));
    // The property's order: the first band on the left, looking along the arrow.
    const overlays = names.filter((overlay) => order.includes(overlay));
    if (overlays.length === 0) return;
    try {
      const { points, arrows } = readLine(element, svg);
      lines.push({ element, line: { id: `${lines.length}`, points, arrows, overlays } });
    } catch (error) {
      if (!(error instanceof LineOverlayError)) throw error;
      warn(`overlay on ${name} left out: ${error.message}`);
    }
  });
  return lines;
}

function opacityOf(element) {
  return GROUP_OPACITY_ATTRS.reduce((product, name) => {
    const value = element.getAttribute(name) ?? element.style.getPropertyValue(name);
    return value === "" || value === null ? product : product * Number.parseFloat(value);
  }, 1);
}

// With tags, the group is filtered like a cell: hiding or focusing a tag
// hides or focuses every band of the overlay.
function overlayGroup(doc, name, definition, tags, tagsAttr) {
  const group = doc.createElementNS(SVG_NS, "g");
  group.classList.add(GROUP_CLASS);
  group.setAttribute("data-overlay", name);
  group.setAttribute("opacity", `${opacityOf(definition)}`);
  if (tags) group.setAttribute(tagsAttr, tags);
  return group;
}

function bandElement(doc, d, definition, lines) {
  const path = doc.createElementNS(SVG_NS, "path");
  Array.from(definition.attributes).forEach(({ name, value }) => {
    if (!NOT_COPIED.has(name) && !name.startsWith("data-")) path.setAttribute(name, value);
  });
  OPACITY_ATTRS.forEach((name) => path.style.removeProperty(name));
  const width = Number.parseFloat(definition.style.getPropertyValue("stroke-width") || definition.getAttribute("stroke-width") || "1");
  path.style.removeProperty("stroke-width");
  path.setAttribute("stroke-width", `${width + SEAM_OVERLAP}`);
  path.setAttribute("d", d);
  path.classList.add(BAND_CLASS);
  const ids = linesAttr(lines.map((line) => line.id));
  if (ids) path.setAttribute(LINES_ATTR, ids);
  return path;
}

/**
 * The bands for every line with an overlay, as one g.dwk-line-overlays
 * appended last (on top); null when no line has an overlay.
 * @returns {{ layer: SVGGElement, bands: { element: SVGPathElement, lines: Element[] }[] } | null}
 */
function drawBands(svg, metadata, boxes) {
  const doc = svg.ownerDocument;
  const { definitions, tags } = readDefinitions(svg, metadata);
  const lines = readLines(svg, definitions, metadata);
  if (lines.length === 0) return null;
  const widths = new Map(Array.from(definitions, ([name, path]) => [name, Number.parseFloat(path.getAttribute("stroke-width") || "1")]));
  const layout = layoutOverlays(lines.map(({ line }) => line), boxes.map(({ box }) => box), widths);

  const layer = /** @type {SVGGElement} */ (doc.createElementNS(SVG_NS, "g"));
  layer.classList.add(LAYER_CLASS);
  layer.setAttribute("aria-hidden", "true");
  const groups = new Map(Array.from(definitions, ([name, path]) => [name, overlayGroup(doc, name, path, tags.get(name), metadata.tagsAttr)]));
  const elementOf = new Map(lines.map(({ element, line }) => [line.id, element]));
  const bands = layout.map((band) => {
    const lineElements = band.lines.map((id) => elementOf.get(id));
    const element = /** @type {SVGPathElement} */ (bandElement(doc, band.d, definitions.get(band.overlay), lineElements));
    groups.get(band.overlay).appendChild(element);
    return { element, lines: lineElements };
  });
  groups.forEach((group) => group.childElementCount > 0 && layer.appendChild(group));
  svg.appendChild(layer);
  return { layer, bands };
}

// Cells with a slug (the markers that carry help: circles, "?") stay above
// the bands: they move, in order, into a layer after the bands, each keeping
// its place through its old parent's transform. They are the same elements,
// so hover, pins, visibility and dim work on them as before.
function raiseSlugCells(svg, metadata, layer) {
  const above = svg.ownerDocument.createElementNS(SVG_NS, "g");
  above.classList.add(ABOVE_CLASS);
  const cells = Array.from(svg.querySelectorAll(`[${metadata.slugAttr}]`))
    .map((element) => element.closest(`[${metadata.idAttr}]`) || element)
    .filter((cell, index, all) => all.indexOf(cell) === index && !all.some((other) => other !== cell && other.contains(cell)));
  cells.forEach((cell) => {
    const m = rootMatrix(cell.parentElement, svg);
    if (m.isIdentity) above.appendChild(cell);
    else {
      const place = svg.ownerDocument.createElementNS(SVG_NS, "g");
      place.setAttribute("transform", `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
      place.appendChild(cell);
      above.appendChild(place);
    }
  });
  if (above.childElementCount > 0) layer.after(above);
}

/**
 * Draws the bands and the box arrows into `svg`. Returns what was drawn, each
 * with the cells it follows.
 * @param {SVGSVGElement} svg
 * @param {import("../../core/validate").MetadataAttrs} metadata
 * @param {import("../../core/tags").TagModel} model the diagram's tags (markers: priority and info tags)
 */
export function drawAll(svg, metadata, model) {
  if (svg.hasAttribute(RENDERED_ATTR) || svg.querySelector(DRAWN)) throw new LineOverlayError("the SVG already has its line overlays and box arrows (rendered)");
  const boxes = readBoxes(svg, metadata);
  const bands = drawBands(svg, metadata, boxes);
  // Asked for every line and box pair: once per box.
  const markers = new Map();
  const isMarker = (cell) => {
    if (!markers.has(cell)) markers.set(cell, model.getPrimarySeverityTag(model.parseTags(cell.getAttribute(metadata.tagsAttr))) !== null);
    return markers.get(cell);
  };
  const arrows = drawBoxArrows(svg, metadata, boxes, linesAttr, isMarker);
  if (bands) raiseSlugCells(svg, metadata, bands.layer);
  return { layer: bands && bands.layer, bands: bands ? bands.bands : [], arrows };
}

/**
 * Public: draws the line overlays and box arrows into an SVG that is in a
 * document, and marks it rendered, for writing out a finished SVG (the
 * `render` CLI). metadata and tags: as definition.metadata and
 * definition.tags (the tag roles tell markers apart).
 * @param {SVGSVGElement} svg
 * @param {{ metadata?: Partial<import("../../core/validate").MetadataAttrs>, tags?: Record<string, any> }} [options]
 * @returns {{ overlays: string[], bands: number, arrows: number }}
 */
export function renderLineOverlays(svg, options = {}) {
  const tags = options.tags || {};
  const model = createTagModel({ ...DEFAULT_TAGS_CONFIG, ...tags, roles: { ...DEFAULT_TAGS_CONFIG.roles, ...(tags.roles || {}) } });
  const drawn = drawAll(svg, { ...DEFAULT_METADATA_ATTRS, ...(options.metadata || {}) }, model);
  svg.setAttribute(RENDERED_ATTR, "");
  const overlays = drawn.layer ? Array.from(drawn.layer.children, (group) => group.getAttribute("data-overlay") || "") : [];
  return { overlays, bands: drawn.bands.length, arrows: drawn.arrows.length };
}

// Bands and arrows already rendered into the SVG, with the cells their
// data-lines name; null when the SVG is not a rendered one.
function readRendered(svg) {
  if (!svg.hasAttribute(RENDERED_ATTR)) return null;
  return Array.from(svg.querySelectorAll(`.${BAND_CLASS}, .${BOX_ARROW_CLASS}`)).map((element) => {
    const ids = (element.getAttribute(LINES_ATTR) || "").split(/\s+/).filter(Boolean);
    const lines = ids.map((id) => byId(svg, id)).filter(Boolean);
    if (ids.length === 0 || lines.length !== ids.length) warn(`a rendered band or arrow follows no cell (${LINES_ATTR}="${ids.join(" ")}"): always shown`);
    return { element: /** @type {SVGElement} */ (element), lines };
  });
}

/** @param {import("../context").Context & Record<string, any>} ctx */
export function createLineOverlays(ctx) {
  /** @type {{ element: SVGElement, lines: Element[] }[]} */
  let marks = [];

  function diagramSvg() {
    return /** @type {SVGSVGElement | null} */ (ctx.els.image.querySelector(":scope > svg"));
  }

  // A band or arrow shows while all of its cells show, at the lowest of their
  // opacities, and counts as highlighted only when all of them are.
  function cellState(cell, svg) {
    let hidden = false;
    let opacity = 1;
    for (let node = cell; node && node !== svg; node = node.parentElement) {
      const style = /** @type {HTMLElement} */ (node).style;
      if (!style) continue;
      if (style.display === "none") hidden = true;
      if (style.opacity !== "") opacity *= Number.parseFloat(style.opacity);
    }
    return { hidden, opacity, target: Boolean(cell.closest(`.${HIGHLIGHT_TARGET_CLASS}`)) };
  }

  function sync() {
    const svg = diagramSvg();
    if (!svg) return;
    marks.forEach(({ element, lines }) => {
      if (lines.length === 0) return;
      const states = lines.map((cell) => cellState(cell, svg));
      const hidden = states.some((state) => state.hidden);
      const opacity = Math.min(...states.map((state) => state.opacity));
      const display = hidden ? "none" : "";
      const opacityValue = opacity < 1 ? `${opacity}` : "";
      if (element.style.display !== display) element.style.display = display;
      if (element.style.opacity !== opacityValue) element.style.opacity = opacityValue;
      element.classList.toggle(TARGET_CLASS, states.every((state) => state.target));
    });
  }

  function observe(svg) {
    const ours = (node) => node instanceof ctx.win.Element && Boolean(node.closest(DRAWN));
    const observer = new ctx.win.MutationObserver((records) => {
      if (records.every((record) => ours(record.target))) return;
      sync();
    });
    observer.observe(svg, { subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    ctx.signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  }

  // Once per loaded diagram, before the filter first hides anything and
  // before the dark theme reads the colours. What a rendered SVG holds is
  // used as it is; otherwise it is drawn when features.lineOverlays is on.
  function render() {
    const svg = diagramSvg();
    if (!svg) return;
    const rendered = readRendered(svg);
    if (rendered) marks = rendered;
    else if (ctx.features.lineOverlays) {
      const drawn = drawAll(svg, ctx.config.metadata, ctx.model);
      marks = [...drawn.bands, ...drawn.arrows];
    }
    if (marks.length === 0) return;
    sync();
    observe(svg);
  }

  return { render };
}
