// Per-instance plumbing shared by every dom/ and ui/ module: the owner
// document, one AbortController for all listeners, tracked timers, and the
// geometry helpers that turn client coordinates into container-local ones.

/**
 * @typedef {object} Context
 * @property {Document} doc
 * @property {Document | ShadowRoot} scope the container's root node: focus and adopted styles live here
 * @property {Window & typeof globalThis} win
 * @property {HTMLElement} root
 * @property {AbortSignal} signal
 * @property {Record<string, any>} s mutable runtime state
 * @property {Record<string, any>} config
 * @property {import("../core/presets").Features} features
 * @property {import("../core/texts").Texts} texts
 * @property {import("../core/tags").TagModel} model
 * @property {import("../core/definition").DefinitionMode} mode the definition's mode in use
 * @property {Record<string, any>} services
 * @property {(name: string) => HTMLElement} el
 * @property {(name: string) => HTMLElement | null} maybeEl
 */

const CLASS_PREFIX = "dwk-";

// A mouse or trackpad: hover exists and pointing is precise.
export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

export function scopedClass(name) {
  return `${CLASS_PREFIX}${name}`;
}

export function createTimers(win) {
  const timeouts = new Set();
  const frames = new Set();
  let stopped = false;
  return {
    setTimeout(callback, ms) {
      if (stopped) return 0;
      const id = win.setTimeout(() => {
        timeouts.delete(id);
        callback();
      }, ms);
      timeouts.add(id);
      return id;
    },
    clearTimeout(id) {
      if (!id) return;
      win.clearTimeout(id);
      timeouts.delete(id);
    },
    requestAnimationFrame(callback) {
      if (stopped) return 0;
      const id = win.requestAnimationFrame((time) => {
        frames.delete(id);
        callback(time);
      });
      frames.add(id);
      return id;
    },
    cancelAnimationFrame(id) {
      if (!id) return;
      win.cancelAnimationFrame(id);
      frames.delete(id);
    },
    stop() {
      stopped = true;
      timeouts.forEach((id) => win.clearTimeout(id));
      frames.forEach((id) => win.cancelAnimationFrame(id));
      timeouts.clear();
      frames.clear();
    },
  };
}

// Ancestor transform: scale() or zoom make client pixels differ from the
// layout pixels that style.left/transform are written in.
export function getScale(element) {
  const rect = element.getBoundingClientRect();
  const layoutWidth = element.offsetWidth;
  if (!(rect.width > 0) || !(layoutWidth > 0)) return 1;
  const scale = rect.width / layoutWidth;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

// viewBox -> client px for an outer <svg>, built from its client rect.
// Safari's getScreenCTM() leaves out CSS transforms on HTML ancestors (the
// camera's matrix on the image, Reveal's scale), so it is off by the zoom.
// The client rect includes them: its content box, the viewBox and
// preserveAspectRatio give the same matrix in every browser. null when the
// SVG has no viewBox or no layout.
/** @param {SVGSVGElement} svg */
export function svgScreenMatrix(svg) {
  const viewBox = svg.viewBox && svg.viewBox.baseVal;
  const rect = svg.getBoundingClientRect();
  const borderBoxWidth = svg.clientWidth;
  if (!viewBox || !(viewBox.width > 0) || !(viewBox.height > 0) || !(rect.width > 0) || !(rect.height > 0) || !(borderBoxWidth > 0)) return null;
  const style = svg.ownerDocument.defaultView.getComputedStyle(svg);
  const px = (name) => Number.parseFloat(style[name]) || 0;
  const left = px("borderLeftWidth") + px("paddingLeft");
  const right = px("borderRightWidth") + px("paddingRight");
  const top = px("borderTopWidth") + px("paddingTop");
  const bottom = px("borderBottomWidth") + px("paddingBottom");
  const layoutWidth = svg.clientWidth + px("borderLeftWidth") + px("borderRightWidth");
  const layoutHeight = svg.clientHeight + px("borderTopWidth") + px("borderBottomWidth");
  const kx = rect.width / layoutWidth;
  const ky = rect.height / layoutHeight;
  const contentLeft = rect.left + left * kx;
  const contentTop = rect.top + top * ky;
  const contentWidth = (layoutWidth - left - right) * kx;
  const contentHeight = (layoutHeight - top - bottom) * ky;
  if (!(contentWidth > 0) || !(contentHeight > 0)) return null;

  const ratio = svg.preserveAspectRatio.baseVal;
  const SVG_PRESERVEASPECTRATIO_NONE = 1;
  const SVG_MEETORSLICE_SLICE = 2;
  let sx = contentWidth / viewBox.width;
  let sy = contentHeight / viewBox.height;
  let offsetX = 0;
  let offsetY = 0;
  if (ratio.align !== SVG_PRESERVEASPECTRATIO_NONE) {
    const scale = ratio.meetOrSlice === SVG_MEETORSLICE_SLICE ? Math.max(sx, sy) : Math.min(sx, sy);
    sx = scale;
    sy = scale;
    // align: 2..10 = xMinYMin, xMidYMin, xMaxYMin, xMinYMid, ... xMaxYMax.
    const index = ratio.align - 2;
    offsetX = ((index % 3) / 2) * (contentWidth - viewBox.width * scale);
    offsetY = (Math.floor(index / 3) / 2) * (contentHeight - viewBox.height * scale);
  }
  return new DOMMatrix([sx, 0, 0, sy, contentLeft + offsetX - viewBox.x * sx, contentTop + offsetY - viewBox.y * sy]);
}

// User space of an element inside the diagram -> client px. Its matrix
// relative to the outer <svg> is right in every browser; only the outer
// part comes from svgScreenMatrix.
/** @param {SVGGraphicsElement} element */
export function elementScreenMatrix(element) {
  let root = element.ownerSVGElement;
  while (root && root.ownerSVGElement) root = root.ownerSVGElement;
  if (!root) return element.nodeName.toLowerCase() === "svg" ? svgScreenMatrix(/** @type {SVGSVGElement} */ (/** @type {unknown} */ (element))) : null;
  const outer = svgScreenMatrix(root);
  const rootCtm = root.getScreenCTM();
  const elementCtm = element.getScreenCTM();
  if (!outer || !rootCtm || !elementCtm) return null;
  return outer.multiply(DOMMatrix.fromMatrix(rootCtm).inverse().multiply(DOMMatrix.fromMatrix(elementCtm)));
}

// Client point -> layout px relative to element's padding box.
export function toLocal(element, clientX, clientY) {
  const rect = element.getBoundingClientRect();
  const scale = getScale(element);
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
}

export function isRectValid(rect) {
  return Boolean(
    rect &&
      Number.isFinite(rect.left) &&
      Number.isFinite(rect.top) &&
      Number.isFinite(rect.width) &&
      Number.isFinite(rect.height) &&
      rect.width > 0 &&
      rect.height > 0,
  );
}

// Transient listeners (a drag, one visibilitychange) that also die with the
// instance.
export function childSignal(parent) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parent.aborted) controller.abort();
  else parent.addEventListener("abort", abort, { once: true, signal: controller.signal });
  return controller;
}

export function createElement(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
