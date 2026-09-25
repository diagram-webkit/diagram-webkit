// Orders a state change when the instance has a fade (opts.fade): what goes
// away fades out first, what comes in (cells and the highlight) fades in once
// that is done. Everything decided in one task is one change; a new change
// before the in-phase just joins it and moves the in-phase after its own
// fade-outs. Without a fade, callers apply immediately.

/** @param {import("./context").Context & Record<string, any>} ctx */
export function createPhases(ctx) {
  const s = ctx.s;
  const incoming = new Set();
  const inCallbacks = new Map();
  let outUntil = 0;
  let flushQueued = false;
  let inTimer = 0;

  const now = () => ctx.win.performance.now();

  function runIn() {
    inTimer = 0;
    const elements = Array.from(incoming);
    incoming.clear();
    elements.forEach((element) => {
      // A cell shown again mid fade-out must not be hidden when that ends.
      ctx.timers.clearTimeout(element._dwkVisibilityFadeTimeout);
      element._dwkVisibilityFadeTimeout = 0;
      element.style.removeProperty("display");
      element.style.removeProperty("opacity");
    });
    const callbacks = Array.from(inCallbacks.values());
    inCallbacks.clear();
    callbacks.forEach((callback) => callback());
  }

  function flush() {
    flushQueued = false;
    if (ctx.destroyed) return;
    ctx.timers.clearTimeout(inTimer);
    const wait = Math.max(0, outUntil - now());
    if (wait > 0) inTimer = ctx.timers.setTimeout(runIn, wait);
    else runIn();
  }

  function queue() {
    if (flushQueued) return;
    flushQueued = true;
    Promise.resolve().then(flush);
  }

  return {
    active: () => s.sequenced && !s.instantVisibility,
    // Something started fading out now.
    outgoing() {
      outUntil = Math.max(outUntil, now() + s.fadeMs);
      queue();
    },
    showLater(element) {
      incoming.add(element);
      queue();
    },
    cancelShow(element) {
      incoming.delete(element);
    },
    // Runs once in the in-phase; a later call with the same key replaces it.
    inPhase(key, callback) {
      inCallbacks.set(key, callback);
      queue();
    },
  };
}
