// Rings on pinned elements. Drawn in an <svg>
// layer with the diagram's viewBox inside the transformed image, like the
// highlight layer, so a ring moves and scales with the map instead of
// following it a frame late. Stroke widths are set per zoom (--dwk-pin-px,
// one screen pixel in diagram units): vector-effect ignores the CSS
// transform on the image.
import { getScale } from "../context.js";

// Smallest ring on screen, for markers too small to see at a far zoom.
export const RING_MIN_SIZE_PX = 16;
// Ring diameter relative to the element it marks.
export const RING_SIZE_RATIO = 1.15;
const LAYER_CLASS = "dwk-pin-indicator-layer";
const SVG_NS = "http://www.w3.org/2000/svg";

/** @param {import("../context").Context & Record<string, any>} ctx */
export function createPinRings(ctx) {
  let layer = null;
  // element -> { ring, cx, cy, r } in diagram user units.
  let rings = new Map();
  let frameId = 0;

  function diagramSvg() {
    return /** @type {SVGSVGElement | null} */ (ctx.els.image.querySelector("svg"));
  }

  function ensureLayer() {
    const svg = diagramSvg();
    if (!svg) return null;
    if (!layer) {
      layer = /** @type {SVGSVGElement} */ (ctx.doc.createElementNS(SVG_NS, "svg"));
      layer.classList.add(LAYER_CLASS);
      layer.setAttribute("aria-hidden", "true");
    }
    ["viewBox", "preserveAspectRatio"].forEach((name) => {
      const value = svg.getAttribute(name);
      if (value === null) layer.removeAttribute(name);
      else layer.setAttribute(name, value);
    });
    if (layer.parentNode !== ctx.els.image) ctx.els.image.appendChild(layer);
    return layer;
  }

  function circle(className) {
    const node = ctx.doc.createElementNS(SVG_NS, "circle");
    node.setAttribute("class", className);
    return node;
  }

  function createRing() {
    const ring = ctx.doc.createElementNS(SVG_NS, "g");
    ring.setAttribute("class", "pin-indicator");
    // Halo under the ring so it reads on any fill; the ping runs once.
    ring.append(circle("pin-indicator-halo"), circle("pin-indicator-glow"), circle("pin-indicator-ping"));
    return ring;
  }

  // The element's focus target (its smallest drawn part) in user units.
  function measure(element) {
    const svg = diagramSvg();
    const rect = ctx.services.camera.getElementFocusRect(element);
    const ctm = svg ? svg.getScreenCTM() : null;
    if (!rect || !ctm) return null;
    const toUser = ctm.inverse();
    const a = new DOMPoint(rect.left, rect.top).matrixTransform(toUser);
    const b = new DOMPoint(rect.right, rect.bottom).matrixTransform(toUser);
    const width = Math.abs(b.x - a.x);
    const height = Math.abs(b.y - a.y);
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, r: (Math.max(width, height) / 2) * RING_SIZE_RATIO };
  }

  function visible(element) {
    if (typeof element.checkVisibility === "function") return element.checkVisibility();
    return element.getClientRects().length > 0;
  }

  // Only the minimum size depends on the zoom; position and size otherwise
  // come from the layer's transform.
  function place(entry, element) {
    const svg = diagramSvg();
    const ctm = svg ? svg.getScreenCTM() : null;
    if (!ctm || !visible(element)) {
      entry.ring.style.display = "none";
      return;
    }
    const pxPerUnit = Math.hypot(ctm.a, ctm.b) / getScale(ctx.root);
    if (layer) layer.style.setProperty("--dwk-pin-px", `${1 / pxPerUnit}`);
    const r = Math.max(entry.r, RING_MIN_SIZE_PX / 2 / pxPerUnit);
    entry.ring.style.removeProperty("display");
    entry.ring.querySelectorAll("circle").forEach((node) => {
      node.setAttribute("cx", `${entry.cx}`);
      node.setAttribute("cy", `${entry.cy}`);
      node.setAttribute("r", `${r}`);
    });
  }

  // Rebuild only when the set of pinned elements changes, so the ping does
  // not restart on every pan.
  function render() {
    const pinned = ctx.services.pins.getPinnedElements();
    // No pins, no layer: the image holds only the diagram (and the highlight).
    if (pinned.length === 0) {
      if (layer) layer.remove();
      rings.forEach((entry) => entry.ring.remove());
      rings = new Map();
      return;
    }
    const next = new Map();
    const parent = ensureLayer();
    if (!parent) return;
    pinned.forEach((element) => {
      const existing = rings.get(element);
      const geometry = existing && existing.r > 0 ? existing : measure(element);
      if (!geometry) return;
      const ring = existing ? existing.ring : createRing();
      if (!existing) parent.appendChild(ring);
      const entry = { ring, cx: geometry.cx, cy: geometry.cy, r: geometry.r };
      next.set(element, entry);
      place(entry, element);
    });
    rings.forEach((entry, element) => {
      if (!next.has(element)) entry.ring.remove();
    });
    rings = next;
  }

  // Also picks up a pinned element that was hidden (so unmeasured) before.
  function reposition() {
    if (rings.size !== ctx.services.pins.getPinnedElements().length) {
      render();
      return;
    }
    rings.forEach((entry, element) => place(entry, element));
  }

  function scheduleReposition() {
    if (frameId) return;
    frameId = ctx.timers.requestAnimationFrame(() => {
      frameId = 0;
      reposition();
    });
  }

  return {
    render,
    reposition,
    scheduleReposition,
    hasIndicatorFor: (element) => rings.has(element),
  };
}
