// --mobile-vh is the container's own height (a page would use the visual
// viewport).

/** @param {import("../dom/context").Context & Record<string, any>} ctx */
export function createLayout(ctx) {
  function onResize() {
    const height = ctx.root.clientHeight;
    if (height > 0) ctx.root.style.setProperty("--mobile-vh", `${Math.round(height)}px`);
  }
  onResize();
  return { onResize };
}
