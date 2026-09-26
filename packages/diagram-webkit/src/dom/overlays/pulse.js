// The one-shot ring marking a go-to target.
import { getScale, isRectValid } from "../context.js";

export const PULSE_DURATION_MS = 3000;
// Matches the opacity transition on .dwk-pulse-leaving.
export const HOVER_FADE_MS = 150;

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

  // Centre on the focus point the viewport centres on, not the bounding box:
  // a <g>'s box spans every child, so on a marker that sits on a big group
  // the ring landed nowhere near the thing being pointed at.
  function measure(element) {
    const rect = element.getBoundingClientRect();
    if (!isRectValid(rect)) return null;
    const focusPoint = ctx.services.camera.getElementFocusPoint(element);
    const x = focusPoint ? focusPoint.x : rect.left + rect.width / 2;
    const y = focusPoint ? focusPoint.y : rect.top + rect.height / 2;
    const view = ctx.root.getBoundingClientRect();
    const inView = x >= view.left && y >= view.top && x <= view.right && y <= view.bottom;
    return { x, y, view, inView, extent: Math.max(rect.width, rect.height) };
  }

  function place(indicator, geometry) {
    const scale = getScale(ctx.root);
    const size = Math.max(22, Math.min(60, (geometry.extent / scale) * 1.35));
    indicator.style.width = `${Math.round(size)}px`;
    indicator.style.height = `${Math.round(size)}px`;
    indicator.style.left = `${Math.round((geometry.x - geometry.view.left) / scale)}px`;
    indicator.style.top = `${Math.round((geometry.y - geometry.view.top) / scale)}px`;
  }

  function pulseGoToElement(element, { persistent = false, hover = false } = {}) {
    if (!element || typeof element.getBoundingClientRect !== "function") return;
    // A pinned element already carries a permanent ring; a second one on
    // arrival would just stack on top of it.
    if (ctx.services.pinRings.hasIndicatorFor(element)) return;
    const geometry = measure(element);
    // Off-screen elements would draw a ring nobody can see.
    if (!geometry || !geometry.inView) return;

    removePulse(element);
    const indicator = ctx.doc.createElement("div");
    indicator.className = "mobile-go-to-indicator";
    if (persistent || hover) indicator.classList.add("dwk-pulse-persistent");
    if (hover) indicator.classList.add("dwk-pulse-hover");
    place(indicator, geometry);
    ctx.root.appendChild(indicator);

    const timeout = persistent || hover ? 0 : ctx.timers.setTimeout(() => removePulse(element), PULSE_DURATION_MS);
    active.set(element, { indicator, timeout, persistent, hover });
  }

  // A ring for as long as the pointer rests on a result entry. Leaves any
  // ring already on the element alone, except a hover ring fading out.
  function hold(element) {
    const entry = active.get(element);
    if (entry && !(entry.hover && entry.timeout)) return;
    pulseGoToElement(element, { hover: true });
  }

  // Freezes the ring where its animation is, then fades it out quickly.
  function release(element) {
    const entry = active.get(element);
    if (!entry || !entry.hover || entry.timeout) return;
    const { indicator } = entry;
    const style = ctx.win.getComputedStyle(indicator);
    indicator.style.opacity = style.opacity;
    indicator.style.transform = style.transform;
    indicator.classList.remove("dwk-pulse-persistent", "dwk-pulse-hover");
    indicator.classList.add("dwk-pulse-leaving");
    void indicator.offsetWidth;
    indicator.style.opacity = "0";
    entry.timeout = ctx.timers.setTimeout(() => removePulse(element), HOVER_FADE_MS);
  }

  // Hover rings belong to the pointer, not to the highlight state.
  function clear({ persistentOnly = false } = {}) {
    Array.from(active.entries()).forEach(([element, entry]) => {
      if (!persistentOnly || (entry.persistent && !entry.hover)) removePulse(element);
    });
  }

  // Moves every ring with the diagram on pan and zoom without restarting its
  // animation.
  function reposition() {
    active.forEach((entry, element) => {
      const geometry = measure(element);
      entry.indicator.hidden = !geometry || !geometry.inView;
      if (!entry.indicator.hidden) place(entry.indicator, geometry);
    });
  }

  return { pulseGoToElement, hold, release, clear, reposition, has: (element) => active.has(element) };
}
