// Per-instance plumbing shared by every dom/ and ui/ module: the owner
// document, one AbortController for all listeners, tracked timers, and the
// geometry helpers that turn client coordinates into container-local ones.

/**
 * @typedef {object} Context
 * @property {Document} doc
 * @property {Window & typeof globalThis} win
 * @property {HTMLElement} root
 * @property {AbortSignal} signal
 * @property {Record<string, any>} s mutable runtime state
 * @property {Record<string, any>} config
 * @property {import("../core/presets").Features} features
 * @property {import("../core/texts").Texts} texts
 * @property {import("../core/tags").TagModel} model
 * @property {Record<string, any>} services
 * @property {(name: string) => HTMLElement} el
 * @property {(name: string) => HTMLElement | null} maybeEl
 */

const CLASS_PREFIX = "dwk-";

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
