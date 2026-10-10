// The go-to pulse (pulse.js) on each newly pinned element, once it is on
// screen: a pin from a link pulses when the diagram has faded in and the
// camera gets there. The pin itself is a glow (runtime.css).
import { STARTING_CLASS } from "../lifecycle.js";

/** @param {import("../context").Context & Record<string, any>} ctx */
export function createPinPulses(ctx) {
  let pinned = new Set();
  const pending = new Set();

  function render() {
    const next = new Set(ctx.services.pins.getPinnedElements());
    next.forEach((element) => {
      if (!pinned.has(element)) pending.add(element);
    });
    pending.forEach((element) => {
      if (!next.has(element)) pending.delete(element);
    });
    pinned = next;
    reposition();
  }

  function reposition() {
    if (ctx.root.classList.contains(STARTING_CLASS)) return;
    const pulse = ctx.services.pulse;
    pending.forEach((element) => {
      pulse.pulseGoToElement(element);
      if (pulse.has(element)) pending.delete(element);
    });
  }

  return { render, reposition };
}
