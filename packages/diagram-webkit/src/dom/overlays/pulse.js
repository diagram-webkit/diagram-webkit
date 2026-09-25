// The one-shot ring marking a go-to target.
import { getScale, isRectValid } from "../context.js";

export const PULSE_DURATION_MS = 3000;

/** @param {import("../context").Context & Record<string, any>} ctx */
export function createPulse(ctx) {
  const active = new Map();

  function removePulse(element) {
    const entry = active.get(element);
    if (!entry) return;
    entry.indicator.remove();
    ctx.timers.clearTimeout(entry.timeout);
    active.delete(element);
  }

  function pulseGoToElement(element, { persistent = false } = {}) {
    if (!element || typeof element.getBoundingClientRect !== "function") return;
    const rect = element.getBoundingClientRect();
    if (!isRectValid(rect)) return;

    // A <g>'s own bounding box spans every child, so on a marker that sits on
    // a big group the ring landed nowhere near the thing being pointed at. Use
    // the same focus point the viewport centres on, so ring and centre agree.
    // A pinned element already carries a permanent ring; a second one on
    // arrival would just stack on top of it.
    if (ctx.services.pinRings.hasIndicatorFor(element)) return;

    const focusPoint = ctx.services.camera.getElementFocusPoint(element);
    const centerX = focusPoint ? focusPoint.x : rect.left + rect.width / 2;
    const centerY = focusPoint ? focusPoint.y : rect.top + rect.height / 2;
    const view = ctx.root.getBoundingClientRect();
    // Off-screen elements would draw a ring nobody can see.
    if (centerX < view.left || centerY < view.top || centerX > view.right || centerY > view.bottom) return;

    removePulse(element);
    const scale = getScale(ctx.root);
    const indicator = ctx.doc.createElement("div");
    indicator.className = persistent ? "mobile-go-to-indicator dwk-pulse-persistent" : "mobile-go-to-indicator";
    const size = Math.max(22, Math.min(60, (Math.max(rect.width, rect.height) / scale) * 1.35));
    indicator.style.width = `${Math.round(size)}px`;
    indicator.style.height = `${Math.round(size)}px`;
    indicator.style.left = `${Math.round((centerX - view.left) / scale)}px`;
    indicator.style.top = `${Math.round((centerY - view.top) / scale)}px`;
    ctx.root.appendChild(indicator);

    const timeout = persistent ? 0 : ctx.timers.setTimeout(() => removePulse(element), PULSE_DURATION_MS);
    active.set(element, { indicator, timeout, persistent });
  }

  function clear({ persistentOnly = false } = {}) {
    Array.from(active.entries()).forEach(([element, entry]) => {
      if (!persistentOnly || entry.persistent) removePulse(element);
    });
  }

  // Moves persistent rings with the diagram without restarting their
  // animation.
  function repositionPersistent() {
    const view = ctx.root.getBoundingClientRect();
    const scale = getScale(ctx.root);
    active.forEach((entry, element) => {
      if (!entry.persistent) return;
      const point = ctx.services.camera.getElementFocusPoint(element);
      entry.indicator.hidden = !point;
      if (!point) return;
      entry.indicator.style.left = `${Math.round((point.x - view.left) / scale)}px`;
      entry.indicator.style.top = `${Math.round((point.y - view.top) / scale)}px`;
    });
  }

  return { pulseGoToElement, clear, repositionPersistent, has: (element) => active.has(element) };
}
