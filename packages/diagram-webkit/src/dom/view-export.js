// "This view" as an SVG file: the diagram as it is on screen now. Cells the
// level, topics or search hide are left out, the line overlays follow them,
// and pins and the reader's notes are drawn in, all in the diagram's own
// coordinates. Always in the light theme; draw.io's model is removed, so the
// file does not open as a draw.io diagram.
import { COPY_CLASS as HIGHLIGHT_COPY_CLASS } from "./overlays/highlight.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const ARROW_DASH = { dashed: "10 6", dotted: "2 6" };
const BORDER_DASH = { dashed: "8 5", dotted: "2 4" };
// Pin rings, as runtime.css draws them (one screen pixel = one unit here).
const PIN_HALO = { stroke: "rgba(255, 255, 255, 0.9)", width: 7 };
const PIN_RING = { fill: "rgba(56, 189, 248, 0.18)", stroke: "rgb(2, 132, 199)", width: 3 };
// As .user-annotation-marker: drawn at twice its box, at 80 % opacity.
const POINT_MARKER_SCALE = 2;
const POINT_MARKER_OPACITY = 0.8;

export class ViewExportError extends Error {
  constructor(message) {
    super(message);
    this.name = "ViewExportError";
  }
}

/** @param {import("./context").Context & Record<string, any>} ctx */
export function createViewExport(ctx) {
  const s = ctx.s;
  const sv = ctx.services;

  const el = (name, attrs = {}) => {
    const node = ctx.doc.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([key, value]) => value !== null && value !== undefined && node.setAttribute(key, `${value}`));
    return node;
  };

  // Shown cells carry no inline display or opacity (help-index.js); hidden
  // and fading-out ones do.
  const hidden = (element) => element.style && (element.style.display === "none" || element.style.opacity === "0");

  function titled(group, ann) {
    const text = [ann.title, ann.description].map((part) => `${part || ""}`.trim()).filter(Boolean).join("\n\n");
    if (text) {
      const title = el("title");
      title.textContent = text;
      group.appendChild(title);
    }
    return group;
  }

  function arrow(ann, index, style, box) {
    const group = el("g", { class: "dwk-view-arrow" });
    const id = `dwk-view-arrow-head-${index}`;
    const marker = el("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse", markerUnits: "strokeWidth" });
    marker.appendChild(el("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: style.border }));
    const defs = el("defs");
    defs.appendChild(marker);
    const width = Number.parseFloat(style.strokeWidth) > 0 ? Number.parseFloat(style.strokeWidth) : 3;
    group.append(
      defs,
      el("line", {
        x1: box.x + ann.x * box.width,
        y1: box.y + ann.y * box.height,
        x2: box.x + (Number.isFinite(ann.x2) ? ann.x2 : ann.x) * box.width,
        y2: box.y + (Number.isFinite(ann.y2) ? ann.y2 : ann.y) * box.height,
        stroke: style.border,
        "stroke-width": width,
        "stroke-linecap": "round",
        "stroke-dasharray": ARROW_DASH[style.borderStyle],
        "marker-end": `url(#${id})`,
      }),
    );
    return group;
  }

  function area(ann, style, box) {
    const x = box.x + ann.x * box.width;
    const y = box.y + ann.y * box.height;
    const width = ann.widthRel * box.width;
    const height = ann.heightRel * box.height;
    const paint = {
      fill: style.bg && style.bg !== "transparent" ? style.bg : "none",
      stroke: style.border,
      "stroke-width": Number.parseFloat(style.borderWidth) || 3,
      "stroke-dasharray": BORDER_DASH[style.borderStyle],
    };
    const shape = ann.shape === "circle"
      ? el("ellipse", { cx: x + width / 2, cy: y + height / 2, rx: width / 2, ry: height / 2, ...paint })
      : el("rect", { x, y, width, height, ...paint });
    const group = el("g", { class: "dwk-view-area" });
    group.appendChild(shape);
    return group;
  }

  // A marker's size follows the diagram, as on screen (annotations/positioning.js).
  function point(ann, style, box) {
    const side = box.width * ctx.config.annotations.markerScale * (style.scale || 2) * POINT_MARKER_SCALE;
    const cx = box.x + ann.x * box.width;
    const cy = box.y + ann.y * box.height;
    const group = el("g", { class: "dwk-view-point", opacity: POINT_MARKER_OPACITY });
    group.appendChild(
      el("rect", {
        x: cx - side / 2,
        y: cy - side / 2,
        width: side,
        height: side,
        rx: ann.shape === "circle" ? side / 2 : side * 0.2,
        fill: style.bg || "none",
        stroke: style.border,
        "stroke-width": side * 0.1,
        "stroke-dasharray": BORDER_DASH[style.borderStyle],
      }),
    );
    return group;
  }

  function notes(box) {
    const group = el("g", { class: "dwk-view-annotations" });
    s.userAnnotations.forEach((ann, index) => {
      const style = ctx.annotationStyle(ann.type);
      if (!style) return;
      const kind = style.annotationType === "arrow" ? arrow(ann, index, style, box) : style.annotationType === "area" ? area(ann, style, box) : point(ann, style, box);
      group.appendChild(titled(kind, ann));
    });
    return group;
  }

  function pins() {
    const group = el("g", { class: "dwk-view-pins" });
    sv.pinRings.drawnRings().forEach(({ cx, cy, r }) => {
      group.append(
        el("circle", { cx, cy, r, fill: "none", stroke: PIN_HALO.stroke, "stroke-width": PIN_HALO.width }),
        el("circle", { cx, cy, r, fill: PIN_RING.fill, stroke: PIN_RING.stroke, "stroke-width": PIN_RING.width }),
      );
    });
    return group;
  }

  // The SVG text of this view.
  function build() {
    const svg = /** @type {SVGSVGElement | null} */ (ctx.els.image.querySelector(":scope > svg"));
    if (!svg) throw new ViewExportError("no diagram is loaded");
    const copy = /** @type {SVGSVGElement} */ (svg.cloneNode(true));
    const originals = [svg, ...svg.querySelectorAll("*")];
    const copies = [copy, ...copy.querySelectorAll("*")];
    const copyOf = new Map(originals.map((element, index) => [element, copies[index]]));

    sv.darkCanvas.lightenCopy(copyOf);
    originals.filter((element) => element !== svg && hidden(element)).forEach((element) => copyOf.get(element).remove());
    copy.querySelectorAll(`.${HIGHLIGHT_COPY_CLASS}`).forEach((element) => element.remove());
    const root = s.svgRootAttrs || {};
    ["style", "preserveAspectRatio"].forEach((name) => (root[name] === null || root[name] === undefined ? copy.removeAttribute(name) : copy.setAttribute(name, root[name])));
    [copy, ...copy.querySelectorAll("g[content]")].forEach((element) => element.removeAttribute("content"));

    const viewBox = svg.viewBox.baseVal;
    if (!viewBox || !(viewBox.width > 0) || !(viewBox.height > 0)) throw new ViewExportError("the diagram has no viewBox to place pins and notes in");
    copy.append(pins(), notes({ x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height }));

    const note = `<!-- This view of ${ctx.config.id}, saved ${new Date().toISOString()} by diagram-webkit: filters, pins and notes as on screen. Not a draw.io file. -->`;
    return `<?xml version="1.0" encoding="UTF-8"?>\n${note}\n${new ctx.win.XMLSerializer().serializeToString(copy)}\n`;
  }

  function fileName() {
    const downloads = ctx.config.content.downloads;
    return (downloads && downloads.view && downloads.view.name) || `${ctx.config.id}-view.svg`;
  }

  function download() {
    let text;
    try {
      text = build();
    } catch (error) {
      if (!(error instanceof ViewExportError)) throw error;
      if (sv.feedback) sv.feedback.showError(ctx.texts.downloadViewFailed, error.message);
      console.error(`diagram-webkit: ${ctx.texts.downloadViewFailed}:`, error);
      return;
    }
    const url = ctx.win.URL.createObjectURL(new ctx.win.Blob([text], { type: "image/svg+xml" }));
    const anchor = ctx.doc.createElement("a");
    anchor.href = url;
    anchor.download = fileName();
    anchor.hidden = true;
    ctx.root.appendChild(anchor);
    anchor.click();
    anchor.remove();
    ctx.timers.setTimeout(() => ctx.win.URL.revokeObjectURL(url), 1000);
  }

  return { build, download };
}
