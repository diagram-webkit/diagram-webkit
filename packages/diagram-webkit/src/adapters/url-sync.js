// Writes the state to the address bar (feature urlSync), with the viewport
// write debounced. Without urlSync the same search string is built on
// demand for serialize("url") but never written.
import { writeUrlSearch } from "../core/codec/url";

// Pan and zoom settle asynchronously, so the URL is rewritten once the
// viewport stops moving instead of on every frame.
export const VIEWPORT_URL_SYNC_DELAY = 400;

/** @param {import("../dom/context").Context & Record<string, any>} ctx */
export function createUrlSync(ctx) {
  const s = ctx.s;
  const enabled = ctx.features.urlSync;
  let viewportUrlSyncTimeout = 0;

  function buildSearch(baseSearch) {
    return writeUrlSearch(baseSearch, {
      annotations: s.userAnnotations,
      viewport: ctx.services.cameraUrl.getUrlValue(),
      panelOpen: s.filterPanelOpen,
      query: s.annotationSearchQuery || "",
      hiddenTags: ctx.services.filter.getExplicitHiddenTags(),
      onlyTags: s.onlyTags,
      pins: Array.from(s.pinnedHelpSlugs).sort((a, b) => a.localeCompare(b)),
      level: s.selectedLevel,
      defaultLevel: s.maxDiagramLevel,
      tagsExpanded: Boolean(s.tagTreeExpanded),
      highlight: s.highlight,
      focus: s.focus,
    });
  }

  function currentLocation() {
    return ctx.win.location;
  }

  function updateURLState() {
    if (enabled && !ctx.destroyed) {
      const location = currentLocation();
      const search = buildSearch(location.search);
      ctx.win.history.replaceState(ctx.win.history.state, "", `${location.pathname}${search}${location.hash}`);
    }
    ctx.notifyStateChange();
  }

  function scheduleViewportUrlSync() {
    if (!s.viewportUrlSyncReady) return;
    ctx.timers.clearTimeout(viewportUrlSyncTimeout);
    viewportUrlSyncTimeout = ctx.timers.setTimeout(() => {
      viewportUrlSyncTimeout = 0;
      updateURLState();
    }, VIEWPORT_URL_SYNC_DELAY);
  }

  // A link is only rewritten once the reader moves the diagram themselves.
  // Without this, opening a shared link on a screen that cannot zoom into the
  // shared rect would immediately strip the coordinates back out of the URL.
  function armViewportUrlSync() {
    s.viewportUrlSyncReady = true;
    ctx.services.cameraUrl.markUserControlled();
    scheduleViewportUrlSync();
  }

  // Absolute URL with readable commas.
  function toAbsoluteReadableUrl(url) {
    const search = url.searchParams.toString().replace(/%2C/g, ",");
    return `${url.origin}${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
  }

  return { enabled, buildSearch, updateURLState, scheduleViewportUrlSync, armViewportUrlSync, toAbsoluteReadableUrl };
}
