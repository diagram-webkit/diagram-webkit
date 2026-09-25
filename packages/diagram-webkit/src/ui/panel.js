// The filter panel: open/close, dock or overlay, backdrop, outside click and
// the search input. The panel space is a custom property on the
// container root, and "mobile" means a narrow container.
import { getScale } from "../dom/context.js";

export const PANEL_MAX_WIDTH = 420;
export const PANEL_WIDTH_RATIO = 0.92;
export const MOBILE_MAX_WIDTH = 768;
// Matches the panel's CSS slide (panel.css): same duration, same curve.
export const PANEL_ANIMATION_MS = 450;
const SEARCH_FOCUS_DELAY_MS = 80;

export function createPanel(ctx) {
  const s = ctx.s;
  const sv = ctx.services;
  const panel = ctx.el("filter-panel");
  const backdrop = ctx.el("filter-panel-backdrop");
  const openButton = ctx.el("floating-filter-toggle");
  const closeButton = ctx.el("close-filter-panel");
  const searchInput = ctx.el("filter-search-input");
  const resetButton = ctx.el("filter-reset-btn");
  let panelMotionFrame = 0;
  let panelMotionTimer = 0;
  let pendingFocusTimeout = 0;

  const rootWidth = () => ctx.root.clientWidth;

  function readCurrentPanelSpacePx() {
    const numeric = Number.parseFloat(ctx.root.style.getPropertyValue("--filter-panel-space"));
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function writePanelSpacePx(value) {
    ctx.root.style.setProperty("--filter-panel-space", `${Math.round(Math.max(0, Number(value) || 0))}px`);
  }

  function applyPanelSpaceWithLayout(panelSpacePx, options = {}) {
    writePanelSpacePx(panelSpacePx);
    if (s.diagramAspectRatio) {
      sv.geometry.syncDiagramSize();
      if (!options.skipImageTransform) sv.geometry.updateImageTransform();
    }
  }

  // The picture under a docked panel stays put: the panel slides over it,
  // and the diagram's space changes only while that edge is covered (after
  // sliding in, before sliding out). A fit-all view does have to refit; it
  // glides to its new place with the panel, on the same curve.
  function imageBox() {
    return { x: s.imageTranslateX, y: s.imageTranslateY, w: ctx.els.image.offsetWidth * s.currentZoom };
  }

  function placeImage(box) {
    const width = ctx.els.image.offsetWidth;
    if (width > 0) s.currentZoom = box.w / width;
    s.imageTranslateX = box.x;
    s.imageTranslateY = box.y;
    sv.geometry.applyRawTransform();
  }

  function setSpaceKeepingPicture(px) {
    const box = imageBox();
    writePanelSpacePx(px);
    if (!s.diagramAspectRatio) return;
    sv.geometry.syncDiagramSize();
    placeImage(box);
  }

  // Where a fit-all view settles with the given space (the stateless fit
  // branch of the clamp, insets included). Measured, then undone.
  function fittedBoxFor(px) {
    const space = readCurrentPanelSpacePx();
    const box = imageBox();
    writePanelSpacePx(px);
    sv.geometry.syncDiagramSize();
    s.currentZoom = s.minZoom;
    sv.geometry.clampPanToBounds();
    const fitted = imageBox();
    writePanelSpacePx(space);
    sv.geometry.syncDiagramSize();
    placeImage(box);
    return fitted;
  }

  function stopPanelMotion() {
    ctx.timers.cancelAnimationFrame(panelMotionFrame);
    ctx.timers.clearTimeout(panelMotionTimer);
    panelMotionFrame = 0;
    panelMotionTimer = 0;
    sv.geometry.holdLayer("panel", false);
  }

  function glide(from, to) {
    if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) + Math.abs(from.w - to.w) < 0.5) return;
    sv.geometry.holdLayer("panel", true);
    const startTime = ctx.win.performance.now();
    const step = (now) => {
      // rAF time can predate startTime by a frame; below 0 the curve runs backwards.
      const t = Math.max(0, Math.min(1, (now - startTime) / PANEL_ANIMATION_MS));
      const eased = 1 - Math.pow(1 - t, 3);
      placeImage({ x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased, w: from.w + (to.w - from.w) * eased });
      panelMotionFrame = t < 1 ? ctx.timers.requestAnimationFrame(step) : 0;
    };
    panelMotionFrame = ctx.timers.requestAnimationFrame(step);
  }

  function movePanelSpace(target) {
    stopPanelMotion();
    const settle = () => {
      stopPanelMotion();
      sv.geometry.updateImageTransform();
    };
    if (target > readCurrentPanelSpacePx()) {
      if (s.fitAllMode) glide(imageBox(), fittedBoxFor(target));
      panelMotionTimer = ctx.timers.setTimeout(() => {
        setSpaceKeepingPicture(target);
        settle();
      }, PANEL_ANIMATION_MS);
      return;
    }
    // Closing: widen first (still under the panel), then glide to wherever
    // the final layout puts the picture - usually nowhere.
    setSpaceKeepingPicture(target);
    const from = imageBox();
    let to;
    if (s.fitAllMode) to = fittedBoxFor(target);
    else {
      sv.geometry.updateImageTransform();
      to = imageBox();
      placeImage(from);
    }
    glide(from, to);
    panelMotionTimer = ctx.timers.setTimeout(settle, PANEL_ANIMATION_MS);
  }

  function getPanelWidthPx() {
    const width = rootWidth();
    if (width <= MOBILE_MAX_WIDTH) return width;
    const panelRect = panel.getBoundingClientRect();
    if (panelRect.width > 0) return panelRect.width / getScale(ctx.root);
    return Math.min(PANEL_MAX_WIDTH, width * PANEL_WIDTH_RATIO);
  }

  function updateLayout(open, options = {}) {
    const panelWidth = getPanelWidthPx();
    const overlayMode = !(open && rootWidth() > MOBILE_MAX_WIDTH);
    ctx.root.classList.toggle("filter-overlay-open", open && overlayMode);
    ctx.root.classList.toggle("filter-docked-open", open && !overlayMode);
    backdrop.classList.toggle("open", open && overlayMode);
    const target = open && !overlayMode ? Math.ceil(panelWidth) : 0;
    if (options.disablePanelAnimation || !s.diagramAspectRatio) {
      stopPanelMotion();
      applyPanelSpaceWithLayout(target, { skipImageTransform: Boolean(options.skipImageTransform) });
    } else if (Math.abs(target - readCurrentPanelSpacePx()) >= 0.5) {
      movePanelSpace(target);
    } else if (panelMotionFrame || panelMotionTimer) {
      // Toggled back before the space changed: a fit-all glide was on its
      // way to the other layout; send it back.
      stopPanelMotion();
      if (s.fitAllMode) glide(imageBox(), fittedBoxFor(target));
      panelMotionTimer = ctx.timers.setTimeout(() => {
        stopPanelMotion();
        sv.geometry.updateImageTransform();
      }, PANEL_ANIMATION_MS);
    }
    return overlayMode;
  }

  function updateFilterPanelLayout(options = {}) {
    s.filterPanelOverlayMode = updateLayout(s.filterPanelOpen, options);
  }

  function isMobileLayout() {
    return rootWidth() <= MOBILE_MAX_WIDTH || "ontouchstart" in ctx.win;
  }

  // options.instant: no slide-in and no animated panel space (page load).
  function setFilterPanelOpen(open, options = {}) {
    const isOpen = Boolean(open);
    ctx.timers.clearTimeout(pendingFocusTimeout);
    pendingFocusTimeout = 0;
    s.filterPanelOpen = isOpen;

    ctx.root.classList.toggle("filter-panel-open", isOpen);
    panel.classList.toggle("open", isOpen);
    panel.setAttribute("aria-hidden", isOpen ? "false" : "true");
    openButton.classList.toggle("active", isOpen);
    updateFilterPanelLayout({ disablePanelAnimation: Boolean(options.instant) });

    if (isOpen) {
      // The tag tree cannot measure its own space while the panel is closed,
      // so its default expansion is decided the first time it is visible.
      if (sv.tagTree) sv.tagTree.refreshTagTreeDefaultState();
      if (!isMobileLayout()) {
        pendingFocusTimeout = ctx.timers.setTimeout(() => {
          pendingFocusTimeout = 0;
          if (s.filterPanelOpen) searchInput.focus({ preventScroll: true });
        }, SEARCH_FOCUS_DELAY_MS);
      }
    } else {
      searchInput.blur();
      sv.highlightLine.clear();
    }
    sv.urlSync.updateURLState();
  }

  function resetFilters() {
    s.annotationSearchQuery = "";
    searchInput.value = "";
    s.tagVisibility.forEach((_, tag) => s.tagVisibility.set(tag, true));
    sv.filter.clearOnlyTags();
    if (sv.tagTree) sv.tagTree.clearTagTreeFilter();
    sv.filter.indexTags();
    if (sv.tagTree) sv.tagTree.initializeTagControls();
    sv.filter.applyAnnotationFilter();
    sv.urlSync.updateURLState();
  }

  function handleEscape() {
    if (!s.filterPanelOpen) return false;
    if (sv.annotationEditor && sv.annotationEditor.isAnyModalOpen()) return false;
    setFilterPanelOpen(false);
    return true;
  }

  function initialize() {
    const signal = ctx.signal;
    searchInput.value = s.annotationSearchQuery;
    openButton.addEventListener("click", () => setFilterPanelOpen(!s.filterPanelOpen), { signal });
    closeButton.addEventListener("click", () => setFilterPanelOpen(false), { signal });
    backdrop.addEventListener(
      "click",
      () => {
        if (s.filterPanelOpen && s.filterPanelOverlayMode) setFilterPanelOpen(false);
      },
      { signal },
    );
    ctx.root.addEventListener(
      "mousedown",
      (event) => {
        if (!s.filterPanelOpen || !s.filterPanelOverlayMode) return;
        if (panel.contains(event.target) || openButton.contains(event.target)) return;
        setFilterPanelOpen(false);
      },
      { signal },
    );
    searchInput.addEventListener(
      "input",
      () => {
        s.annotationSearchQuery = searchInput.value || "";
        sv.filter.applyAnnotationFilter();
        sv.urlSync.updateURLState();
      },
      { signal },
    );
    // An <input type="search"> wipes itself on Escape without firing "input",
    // so the box went empty while the filter it described stayed applied.
    // Keep the text; Escape still closes the panel.
    searchInput.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") event.preventDefault();
      },
      { signal },
    );
    // Some engines clear on Escape through a "search" event rather than the
    // default action preventDefault can stop.
    searchInput.addEventListener(
      "search",
      () => {
        const query = s.annotationSearchQuery || "";
        if (searchInput.value !== query) searchInput.value = query;
      },
      { signal },
    );
    resetButton.addEventListener("click", resetFilters, { signal });
  }

  return {
    initialize,
    setFilterPanelOpen,
    updateFilterPanelLayout,
    getPanelWidthPx,
    handleEscape,
    syncSearchInput() {
      if (searchInput.value !== s.annotationSearchQuery) searchInput.value = s.annotationSearchQuery;
    },
    focusSearch() {
      if (!s.filterPanelOpen) setFilterPanelOpen(true);
      searchInput.focus({ preventScroll: true });
      searchInput.select();
    },
  };
}
