// Pin state: the pinned slugs, their elements and normalization against the
// loaded diagram.

/** @param {import("./context").Context & Record<string, any>} ctx */
export function createPins(ctx) {
  const s = ctx.s;

  function onFilterConstraintStateChanged() {
    ctx.services.helpIndex.refreshPinnedStates();
    ctx.services.urlSync.updateURLState();
  }

  function onPinnedStateChanged() {
    ctx.services.pinRings.render();
    onFilterConstraintStateChanged();
  }

  // Pins that are not in the loaded diagram are dropped.
  function normalizePinnedHelpSlugs() {
    const available = new Set(s.svgHelpRecords.map((record) => `${record.slug || ""}`.trim()).filter(Boolean));
    const next = new Set();
    s.pinnedHelpSlugs.forEach((value) => {
      const slug = `${value || ""}`.trim();
      if (slug && available.has(slug)) next.add(slug);
    });
    const changed = next.size !== s.pinnedHelpSlugs.size || Array.from(s.pinnedHelpSlugs).some((slug) => !next.has(slug));
    if (changed) {
      s.pinnedHelpSlugs = next;
      onPinnedStateChanged();
    }
  }

  function getPinnedElements() {
    return s.svgHelpRecords
      .filter((record) => record.element && s.pinnedHelpSlugs.has(`${record.slug || ""}`.trim()))
      .map((record) => record.element);
  }

  function togglePinnedHelpSlug(value) {
    const slug = `${value || ""}`.trim();
    if (!slug) return;
    const next = new Set(s.pinnedHelpSlugs);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    s.pinnedHelpSlugs = next;
    onPinnedStateChanged();
  }

  function setPinnedSlugs(slugs) {
    s.pinnedHelpSlugs = new Set(slugs.map((slug) => `${slug || ""}`.trim()).filter(Boolean));
    onPinnedStateChanged();
  }

  return {
    onFilterConstraintStateChanged,
    onPinnedStateChanged,
    normalizePinnedHelpSlugs,
    getPinnedElements,
    togglePinnedHelpSlug,
    setPinnedSlugs,
  };
}
