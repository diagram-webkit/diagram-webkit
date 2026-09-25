// Sizing, cover/contain fit, pan clamp,
// transform and pan indicators. Geometry is in the wrapper's layout px.

export const PAN_INDICATOR_EPSILON = 2;
export const FIT_ALL_INSET = 20;
export const FIT_ALL_GAP_EPSILON = 0.75;
// How far the diagram may hang past the viewport, measured against the black
// band at full zoom-out. That band is what a zoom has to move the diagram
// through, so allowing it is what keeps the point under the pointer in
// place; without it the diagram is pinned the moment it fills the viewport,
// and zooming in on something near an edge eats the band first and drags the
// target towards the middle. It is a constant for a given layout, so the
// bound still moves continuously with the zoom and nothing snaps.
export const OVERHANG_SLACK_RATIO = 1;
// The slack is faded out as the zoom approaches its floor, so full zoom-out
// still lands on the whole diagram and cannot be dragged off to one side.
export const OVERHANG_TAPER_EXPONENT = 3;

/** @param {import("./context").Context & Record<string, any>} ctx */
export function createCameraGeometry(ctx) {
  const s = ctx.s;
  const image = ctx.els.image;
  const wrapper = ctx.els.wrapper;
  const panDragBounds = { x: null, y: null };
  let panIndicatorLayer = null;
  let panIndicatorUp = null;
  let panIndicatorRight = null;
  let panIndicatorDown = null;
  let panIndicatorLeft = null;

  function ensurePanIndicatorLayer() {
    if (panIndicatorLayer) return;
    const make = (className) => {
      const element = ctx.doc.createElement("div");
      element.className = className;
      return element;
    };
    panIndicatorLayer = make("pan-indicator-layer");
    panIndicatorUp = make("pan-indicator pan-indicator-up");
    panIndicatorRight = make("pan-indicator pan-indicator-right");
    panIndicatorDown = make("pan-indicator pan-indicator-down");
    panIndicatorLeft = make("pan-indicator pan-indicator-left");
    panIndicatorLayer.append(panIndicatorUp, panIndicatorRight, panIndicatorDown, panIndicatorLeft);
    wrapper.appendChild(panIndicatorLayer);
  }

  function setIndicatorVisible(indicator, visible) {
    if (!indicator) return;
    indicator.classList.toggle("active", Boolean(visible));
  }

  function getViewportSize() {
    const wrapperStyles = ctx.win.getComputedStyle(wrapper);
    const padLeft = Number.parseFloat(wrapperStyles.paddingLeft) || 0;
    const padRight = Number.parseFloat(wrapperStyles.paddingRight) || 0;
    const padTop = Number.parseFloat(wrapperStyles.paddingTop) || 0;
    const padBottom = Number.parseFloat(wrapperStyles.paddingBottom) || 0;
    return {
      width: Math.max(1, (wrapper.clientWidth || ctx.root.clientWidth) - padLeft - padRight),
      height: Math.max(1, (wrapper.clientHeight || ctx.root.clientHeight) - padTop - padBottom),
    };
  }

  function getScaledImageSize() {
    return {
      width: (image.offsetWidth || image.clientWidth) * s.currentZoom,
      height: (image.offsetHeight || image.clientHeight) * s.currentZoom,
    };
  }

  function getAxisTranslate(alignment, viewportSize, scaledSize) {
    if (alignment === "right" || alignment === "bottom") return viewportSize - scaledSize;
    if (alignment === "center") return (viewportSize - scaledSize) / 2;
    return 0;
  }

  function updatePanIndicators(viewportWidth, viewportHeight, scaledWidth, scaledHeight) {
    ensurePanIndicatorLayer();
    const minX = viewportWidth - scaledWidth;
    const minY = viewportHeight - scaledHeight;
    const tx = s.imageTranslateX;
    const ty = s.imageTranslateY;
    setIndicatorVisible(panIndicatorLeft, scaledWidth > viewportWidth && tx < -PAN_INDICATOR_EPSILON);
    setIndicatorVisible(panIndicatorRight, scaledWidth > viewportWidth && tx > minX + PAN_INDICATOR_EPSILON);
    setIndicatorVisible(panIndicatorUp, scaledHeight > viewportHeight && ty < -PAN_INDICATOR_EPSILON);
    setIndicatorVisible(panIndicatorDown, scaledHeight > viewportHeight && ty > minY + PAN_INDICATOR_EPSILON);
  }

  // How far out the diagram may be zoomed: down to the point where every edge
  // is inside the viewport. Past the zoom that fills the screen the leftover
  // space is letterboxed instead of the zoom being blocked.
  function computeMinZoom() {
    const coverZoom = s.coverZoom;
    const displayedWidth = image.offsetWidth || image.clientWidth;
    const displayedHeight = image.offsetHeight || image.clientHeight;
    if (!displayedWidth || !displayedHeight) return coverZoom;
    const viewport = getViewportSize();
    const fitScale = Math.min(viewport.width / displayedWidth, viewport.height / displayedHeight);
    if (!Number.isFinite(fitScale) || fitScale <= 0) return coverZoom;
    return Math.min(coverZoom, fitScale);
  }

  function syncMinZoom() {
    s.minZoom = computeMinZoom();
    if (s.currentZoom < s.minZoom) s.currentZoom = s.minZoom;
  }

  function syncDiagramSize() {
    const viewport = getViewportSize();
    const viewportAspectRatio = viewport.width / Math.max(1, viewport.height);
    const aspect = s.diagramAspectRatio;
    const hasAspectRatio = Number.isFinite(aspect) && aspect > 0;
    const useContainFit = s.fitGeometryMode === "contain";

    if (hasAspectRatio) {
      const fitByHeight = useContainFit ? viewportAspectRatio > aspect : viewportAspectRatio < aspect;
      if (fitByHeight) {
        image.style.height = `${viewport.height}px`;
        image.style.width = `${Math.max(1, viewport.height * aspect)}px`;
      } else {
        image.style.width = `${viewport.width}px`;
        image.style.height = `${Math.max(1, viewport.width / aspect)}px`;
      }
    } else {
      image.style.width = `${viewport.width}px`;
      image.style.height = `${viewport.height}px`;
    }

    syncMinZoom();
    s.cachedBounds = null;
  }

  // The diagram's own edges: where a drag is allowed to stop.
  function getStrictPanRange(viewportSize, scaledSize) {
    const gap = viewportSize - scaledSize;
    return { min: Math.min(0, gap), max: Math.max(0, gap) };
  }

  // One bound for both cases: the diagram overflowing the viewport and the
  // diagram sitting inside it. Both ends move continuously with the zoom, so
  // there is no point where the view snaps sideways.
  //
  // Three simpler designs were tried first and all three broke visibly. Before
  // simplifying this, check the change is not one of them:
  //
  //   1. Centre the empty space (`gap / 2`). Both black bands then move in
  //      step, so zooming in on something near an edge eats the band first and
  //      drags the target towards the middle - the point under the pointer
  //      does not stay put.
  //   2. Let the diagram's midpoint be the only limit (half of it may leave
  //      the viewport). The translate then sits outside the strict range, and
  //      the instant the diagram grows past the viewport the overflow bound
  //      snaps it back in one frame. It also allows panning far too far out.
  //   3. Scale the slack with the *current* gap instead of the zoom-floor gap.
  //      The allowance grows and shrinks as you zoom, so the clamp keeps
  //      releasing and re-binding: 85-108px jumps per wheel step.
  //
  // What makes the current version work: the slack is constant for a layout
  // (so the bound moves smoothly with the zoom), and it fades to zero at the
  // zoom floor (so full zoom-out still shows every edge).
  function getPanRange(viewportSize, scaledSize, displayedSize) {
    const gap = viewportSize - scaledSize;
    const maxGap = Math.max(0, viewportSize - displayedSize * s.minZoom);
    const taper = s.currentZoom > 0 ? 1 - (s.minZoom / s.currentZoom) ** OVERHANG_TAPER_EXPONENT : 0;
    const slack = maxGap * OVERHANG_SLACK_RATIO * Math.max(0, Math.min(1, taper));
    return { min: Math.min(0, gap) - slack, max: Math.max(0, gap) + slack };
  }

  // A drag is bounded by the diagram's edges, but it must not jerk a view that
  // a zoom left overhanging back into place. The room the drag starts with is
  // whatever the view already has; it is given up as the drag moves back
  // inside, and never handed out again.
  function clampAlongAxis(axis, translate, viewportSize, scaledSize, displayedSize) {
    const strict = getStrictPanRange(viewportSize, scaledSize);
    if (!s.isPanning) {
      panDragBounds[axis] = null;
      const range = getPanRange(viewportSize, scaledSize, displayedSize);
      return Math.max(range.min, Math.min(translate, range.max));
    }
    if (!panDragBounds[axis]) {
      panDragBounds[axis] = { min: Math.min(strict.min, translate), max: Math.max(strict.max, translate) };
    }
    const bounds = panDragBounds[axis];
    const clamped = Math.max(bounds.min, Math.min(translate, bounds.max));
    bounds.min = Math.min(strict.min, Math.max(bounds.min, clamped));
    bounds.max = Math.max(strict.max, Math.min(bounds.max, clamped));
    return clamped;
  }

  function clampPanToBounds() {
    const displayedWidth = image.offsetWidth || image.clientWidth;
    const displayedHeight = image.offsetHeight || image.clientHeight;
    const viewport = getViewportSize();
    const viewportWidth = viewport.width;
    const viewportHeight = viewport.height;
    if (!displayedWidth || !displayedHeight || !viewportWidth || !viewportHeight) return;

    let tx = s.imageTranslateX;
    let ty = s.imageTranslateY;
    const scaledWidth = displayedWidth * s.currentZoom;
    const scaledHeight = displayedHeight * s.currentZoom;
    const fitAllMode = s.fitAllMode;

    if (!fitAllMode && s.fitGeometryMode === "contain") return;

    const gapX = Math.max(0, viewportWidth - scaledWidth);
    const gapY = Math.max(0, viewportHeight - scaledHeight);
    const hasGapX = gapX > FIT_ALL_GAP_EPSILON;
    const hasGapY = gapY > FIT_ALL_GAP_EPSILON;
    const insetAxis = fitAllMode && hasGapX && hasGapY ? (gapX >= gapY ? "x" : "y") : null;

    if (!fitAllMode) {
      s.imageTranslateX = clampAlongAxis("x", tx, viewportWidth, scaledWidth, displayedWidth);
      s.imageTranslateY = clampAlongAxis("y", ty, viewportHeight, scaledHeight, displayedHeight);
      return;
    }

    if (scaledWidth > viewportWidth) {
      tx = Math.max(viewportWidth - scaledWidth, Math.min(tx, 0));
    } else {
      const useInsetX = insetAxis === "x" || (!insetAxis && hasGapX && !hasGapY);
      tx = useInsetX && gapX >= FIT_ALL_INSET * 2 ? FIT_ALL_INSET + (gapX - FIT_ALL_INSET * 2) / 2 : gapX / 2;
    }

    if (scaledHeight > viewportHeight) {
      ty = Math.max(viewportHeight - scaledHeight, Math.min(ty, 0));
    } else {
      const useInsetY = insetAxis === "y" || (!insetAxis && hasGapY && !hasGapX);
      ty = useInsetY && gapY >= FIT_ALL_INSET * 2 ? FIT_ALL_INSET + (gapY - FIT_ALL_INSET * 2) / 2 : gapY / 2;
    }

    s.imageTranslateX = tx;
    s.imageTranslateY = ty;
  }

  function getAlignmentTranslate(horizontal = "center", vertical = "center") {
    const viewport = getViewportSize();
    const scaled = getScaledImageSize();
    return {
      x: getAxisTranslate(horizontal, viewport.width, scaled.width),
      y: getAxisTranslate(vertical, viewport.height, scaled.height),
    };
  }

  function alignImageAtCurrentZoom(horizontal = "center", vertical = "center") {
    const translate = getAlignmentTranslate(horizontal, vertical);
    s.imageTranslateX = translate.x;
    s.imageTranslateY = translate.y;
  }

  function centerImageAtCurrentZoom() {
    alignImageAtCurrentZoom("center", "center");
  }

  function getImageBounds(forceRefresh = false) {
    const cachedBounds = s.cachedBounds;
    if (!forceRefresh && s.isTouchActive && cachedBounds) {
      return {
        ...cachedBounds,
        left: cachedBounds.left + s.imageTranslateX,
        top: cachedBounds.top + s.imageTranslateY,
        right: cachedBounds.right + s.imageTranslateX,
        bottom: cachedBounds.bottom + s.imageTranslateY,
      };
    }
    if (forceRefresh || !cachedBounds) void image.offsetHeight;

    const imageRect = image.getBoundingClientRect();
    const baseWidth = image.offsetWidth || image.clientWidth;
    const baseHeight = image.offsetHeight || image.clientHeight;
    let displayedWidth = baseWidth;
    let displayedHeight = baseHeight;
    const aspect = s.diagramAspectRatio;
    if (Number.isFinite(aspect) && aspect > 0 && baseWidth > 0 && baseHeight > 0) {
      if (baseWidth / baseHeight > aspect) {
        displayedHeight = baseHeight;
        displayedWidth = displayedHeight * aspect;
      } else {
        displayedWidth = baseWidth;
        displayedHeight = displayedWidth / aspect;
      }
    }

    const bounds = {
      left: imageRect.left,
      top: imageRect.top,
      width: displayedWidth,
      height: displayedHeight,
      right: imageRect.left + displayedWidth,
      bottom: imageRect.top + displayedHeight,
    };
    if (!s.isTouchActive) s.cachedBounds = { ...bounds };
    return bounds;
  }

  function writeTransform() {
    image.style.transform = `matrix(${s.currentZoom}, 0, 0, ${s.currentZoom}, ${s.imageTranslateX}, ${s.imageTranslateY})`;
    image.style.cursor = "grab";
    const viewport = getViewportSize();
    const scaled = getScaledImageSize();
    updatePanIndicators(viewport.width, viewport.height, scaled.width, scaled.height);
    ctx.services.overlays.scheduleMarkerPositioning(s.isTouchActive);
    ctx.notifyCameraChange();
  }

  function updateImageTransform() {
    // The zoom floor depends on the viewport, which can change without a
    // re-sync (resize settles, panel layout, orientation change).
    syncMinZoom();
    clampPanToBounds();
    writeTransform();
    ctx.services.urlSync.scheduleViewportUrlSync();
  }

  function applyRawTransform() {
    writeTransform();
  }

  // While the image moves every frame (camera tween, panel glide) it is its
  // own compositor layer. Each mover holds it under its own key, so one
  // finishing does not drop it for another still running; released, the
  // layer re-rasters crisp at its final scale.
  const layerHolders = new Set();
  function holdLayer(key, on) {
    if (on) layerHolders.add(key);
    else layerHolders.delete(key);
    if (layerHolders.size > 0) image.style.willChange = "transform";
    else image.style.removeProperty("will-change");
  }

  return {
    holdLayer,
    getViewportSize,
    syncDiagramSize,
    syncMinZoom,
    clampPanToBounds,
    getAlignmentTranslate,
    alignImageAtCurrentZoom,
    centerImageAtCurrentZoom,
    getImageBounds,
    updateImageTransform,
    applyRawTransform,
  };
}
