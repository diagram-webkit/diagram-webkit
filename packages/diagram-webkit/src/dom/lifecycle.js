// The load sequence: source, SVG, help index, filter, initial camera.

// The finished layout fades in over this, in one piece (see reveal()).
export const REVEAL_FADE_MS = 150;
export const STARTING_CLASS = "dwk-starting";

/** @param {import("./context").Context & Record<string, any>} ctx */
export function createLifecycle(ctx) {
  const s = ctx.s;
  const sv = ctx.services;

  function showLoading() {
    if (sv.feedback) sv.feedback.showLoadingState();
  }

  function hideLoading() {
    if (sv.feedback) sv.feedback.hideLoadingState();
  }

  function showError(message, detail) {
    if (sv.feedback) sv.feedback.showError(message, detail);
  }

  // A link with a single pin and no v= carries no viewport, so the pinned
  // element can open off-screen. Centre on it, without changing the zoom and
  // without writing a v= the sender never chose. Two or more pins, or any
  // camera, mean the shared view wins and nothing happens here.
  function focusInitialPinIfRequested() {
    const pinned = s.initialPins.filter(Boolean);
    if (pinned.length !== 1 || s.initialCamera) return;
    const record = s.svgHelpRecords.find((candidate) => `${candidate.slug || ""}`.trim() === pinned[0]);
    if (!record) return;
    sv.camera.goToHelpRecord(record, { closePanel: false, keepZoom: true, armUrlSync: false });
  }

  function applyInitialCamera() {
    const camera = s.initialCamera;
    if (camera && "focus" in camera) return sv.cameraControl.applyFocus(camera, { transition: false, setIntent: false });
    return sv.cameraUrl.restoreIntent();
  }

  function handleImageLoad() {
    sv.geometry.syncDiagramSize();
    // Help markers start hidden; a focus camera measures what is shown.
    sv.filter.applyAnnotationFilter();
    if (!applyInitialCamera()) {
      s.currentZoom = s.coverZoom;
      sv.geometry.alignImageAtCurrentZoom(...sv.camera.defaultAlign());
      sv.geometry.updateImageTransform();
    }
    sv.annotations.renderAllMarkers();
    focusInitialPinIfRequested();
    // A focus camera is shared as the rect on screen, which only exists now.
    if (s.initialCamera && "focus" in s.initialCamera) sv.urlSync.updateURLState();
    if (sv.helpDialog) sv.helpDialog.showAboutOnFirstVisit();
  }

  async function start() {
    let aspectRatio;
    try {
      if (sv.localSource) {
        // Local mode: the picker (or the URL) supplies the diagram; its own
        // failures are shown there and retried, so only the unexpected land here.
        aspectRatio = await sv.localSource.loadFirst();
      } else {
        showLoading();
        aspectRatio = await sv.loader.loadDiagram(s.source);
      }
    } catch (error) {
      if (ctx.destroyed) return;
      ctx.root.classList.remove(STARTING_CLASS);
      hideLoading();
      sv.annotations.clearUserAnnotationVisuals();
      console.error("Failed to load diagram:", s.sourceLabel, error);
      showError(ctx.texts.loadError, error && error.message);
      throw error;
    }
    if (ctx.destroyed) return;

    s.diagramAspectRatio = aspectRatio;
    sv.geometry.syncDiagramSize();
    sv.helpIndex.initializeSvgPropertyAnnotations();
    sv.pins.normalizePinnedHelpSlugs();
    sv.pinRings.render();
    sv.filter.indexTags();
    if (sv.tagTree) sv.tagTree.initializeTagControls();
    // The panel is in its final state before anything is measured, and
    // without its slide-in: nothing moves once the diagram shows.
    if (sv.panel) sv.panel.setFilterPanelOpen(s.filterPanelOpen, { instant: true });

    await renderable();
    if (ctx.destroyed) return;
    handleImageLoad();
    await reveal();
  }

  const renderable = () => new Promise((resolve) => sv.loader.scheduleOnceWhenRenderable(resolve));

  // Until here everything but the loading box is invisible (STARTING_CLASS,
  // runtime.css). Two rendered frames after the last layout change it fades
  // in at once, and the loading box fades out.
  async function reveal() {
    await renderable();
    await renderable();
    if (ctx.destroyed) return;
    const reduced = ctx.win.matchMedia && ctx.win.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduced ? 0 : REVEAL_FADE_MS;
    const loading = ctx.root.querySelector(":scope > .dwk-loading");
    ctx.root.classList.remove(STARTING_CLASS);
    if (ms > 0) {
      Array.from(ctx.root.children).forEach((child) => {
        if (typeof child.animate !== "function") return;
        if (child === loading) {
          child.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: "ease", fill: "forwards" });
          return;
        }
        // To each element's own opacity: a closed backdrop or modal stays at 0.
        const opacity = Number(ctx.win.getComputedStyle(child).opacity);
        if (opacity > 0) child.animate([{ opacity: 0 }, { opacity }], { duration: ms, easing: "ease" });
      });
      await new Promise((resolve) => ctx.timers.setTimeout(resolve, ms));
      if (ctx.destroyed) return;
    }
    hideLoading();
  }

  return { start, handleImageLoad };
}
