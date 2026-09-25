// Wheel, drag, touch pan/pinch, gesture
// block, keyboard zoom/pan steps and resize. Listeners live on the container;
// a drag adds ownerDocument move/up listeners only while it lasts.
import { childSignal, getScale } from "./context.js";

export const RUNTIME_INPUT_KEYS = Object.freeze(["wheel", "drag", "pinch"]);

// Each wheel step changes the zoom by the same ratio, not the same amount.
// A fixed amount speeds up as the zoom drops - the diagram would appear to
// accelerate away exactly when it starts to letterbox. The ratio is small
// because the diagram is dense: fine steps keep detail readable while moving.
export const ZOOM_STEP_RATIO = 1.0075;
// Scroll distance that counts as one zoom step. A slow trackpad event stays
// at a single step; flicking, or a mouse wheel notch, is worth many.
export const WHEEL_DELTA_PER_STEP = 3;
export const MAX_WHEEL_STEPS = 24;
const WHEEL_LINE_HEIGHT = 16;
const WHEEL_PAGE_HEIGHT = 400;

/** @param {import("./context").Context & Record<string, any>} ctx */
export function createInput(ctx) {
  const s = ctx.s;
  const { image, wrapper } = ctx.els;
  const camera = () => ctx.services.camera;
  const geometry = () => ctx.services.geometry;
  const input = ctx.features.input;
  let lastPinchDistance = 0;
  let lastPinchCenter = { x: 0, y: 0 };
  let isPinching = false;
  let blockSingleTouchPan = false;
  let resizeAnchor = null;
  let resizeAnchorResetTimeout = 0;
  let viewportInteractionStarted = false;
  let resizeSettleTimeout = 0;
  let dragController = null;
  let suspended = false;

  const scale = () => getScale(wrapper);

  // Wheel deltas are reported in pixels, lines or pages depending on the
  // device, so normalize before turning the distance into zoom steps.
  function getWheelZoomSteps(event) {
    let delta = Math.abs(event.deltaY);
    if (event.deltaMode === 1) delta *= WHEEL_LINE_HEIGHT;
    else if (event.deltaMode === 2) delta *= WHEEL_PAGE_HEIGHT;
    const steps = delta / WHEEL_DELTA_PER_STEP;
    if (!Number.isFinite(steps)) return 1;
    return Math.min(MAX_WHEEL_STEPS, Math.max(1, steps));
  }

  function notifyViewportUserInput() {
    ctx.services.urlSync.armViewportUrlSync();
  }

  function applyRawImageTransform() {
    image.style.transform = `matrix(${s.currentZoom}, 0, 0, ${s.currentZoom}, ${s.imageTranslateX}, ${s.imageTranslateY})`;
    image.style.cursor = "grab";
  }

  function updateFilterPanelLayout(options) {
    if (ctx.services.panel) ctx.services.panel.updateFilterPanelLayout(options);
    else geometry().syncDiagramSize();
  }

  function handleResize() {
    const currentZoom = s.currentZoom;
    const minZoom = s.minZoom;
    const coverZoom = s.coverZoom;

    if (ctx.services.highlightLine) ctx.services.highlightLine.clear();
    const activeEl = ctx.doc.activeElement;
    if (activeEl && activeEl !== ctx.doc.body && activeEl.classList && activeEl.classList.contains("filter-result-item")) {
      /** @type {HTMLElement} */ (activeEl).blur();
    }

    if (!viewportInteractionStarted && currentZoom <= coverZoom + 0.001) {
      updateFilterPanelLayout({ skipImageTransform: true, disablePanelAnimation: true });
      const isLetterboxed = currentZoom < coverZoom - 0.001;
      if (s.fitAllMode || isLetterboxed) geometry().centerImageAtCurrentZoom();
      else geometry().alignImageAtCurrentZoom(...camera().defaultAlign());
      applyRawImageTransform();
      s.cachedBounds = null;
      s.isTouchActive = false;
      ctx.services.overlays.scheduleMarkerPositioning(true);
      return;
    }

    if (!resizeAnchor) {
      const beforeWrapperRect = wrapper.getBoundingClientRect();
      const beforeImageRect = image.getBoundingClientRect();
      const centerXBefore = beforeWrapperRect.left + beforeWrapperRect.width / 2;
      const centerYBefore = beforeWrapperRect.top + beforeWrapperRect.height / 2;
      resizeAnchor = {
        nx: beforeImageRect.width > 0 ? (centerXBefore - beforeImageRect.left) / beforeImageRect.width : 0.5,
        ny: beforeImageRect.height > 0 ? (centerYBefore - beforeImageRect.top) / beforeImageRect.height : 0.5,
      };
    }
    ctx.timers.clearTimeout(resizeAnchorResetTimeout);
    resizeAnchorResetTimeout = ctx.timers.setTimeout(() => {
      resizeAnchor = null;
      resizeAnchorResetTimeout = 0;
    }, 20);

    const { nx, ny } = resizeAnchor;
    updateFilterPanelLayout({ skipImageTransform: true, disablePanelAnimation: true });

    const afterWrapperRect = wrapper.getBoundingClientRect();
    const afterImageRect = image.getBoundingClientRect();
    const factor = scale();
    const deltaX = (afterWrapperRect.left + afterWrapperRect.width / 2 - (afterImageRect.left + afterImageRect.width * nx)) / factor;
    const deltaY = (afterWrapperRect.top + afterWrapperRect.height / 2 - (afterImageRect.top + afterImageRect.height * ny)) / factor;

    if (currentZoom <= minZoom + 0.001) {
      geometry().centerImageAtCurrentZoom();
    } else {
      s.imageTranslateX += deltaX;
      s.imageTranslateY += deltaY;
    }
    applyRawImageTransform();

    ctx.timers.clearTimeout(resizeSettleTimeout);
    resizeSettleTimeout = ctx.timers.setTimeout(() => {
      resizeSettleTimeout = 0;
      geometry().updateImageTransform();
    }, 20);

    s.cachedBounds = null;
    s.isTouchActive = false;
    ctx.services.overlays.scheduleMarkerPositioning(true);
  }

  // A modal that covers the diagram must also stop it moving underneath, or
  // the view has drifted by the time the reader closes it.
  function isDiagramLockedByModal() {
    return ctx.root.classList.contains("modal-locks-diagram");
  }

  function isViewportLockedByMobileTooltip() {
    if (ctx.root.classList.contains("mobile-tooltip-open")) return true;
    const mobileTooltip = ctx.services.tooltip ? ctx.services.tooltip.getCurrentMobileTooltip() : null;
    return Boolean(mobileTooltip && mobileTooltip.style.display !== "none");
  }

  function eventElement(event) {
    const raw = event && event.target;
    if (raw && raw.nodeType === 1) return raw;
    return raw && raw.parentElement ? raw.parentElement : null;
  }

  // Shared by the wheel and by keyboard zoom, so both anchor the same way and
  // move by the same ratio. clientX/clientY name the point that must stay put.
  function zoomAtPoint(zoomFactor, zoomIn, clientX, clientY) {
    const wasFitAll = s.fitAllMode;
    const oldZoom = s.currentZoom;
    const imageRectBeforeZoom = image.getBoundingClientRect();

    s.currentZoom = zoomIn ? Math.min(oldZoom * zoomFactor, s.maxZoom) : Math.max(oldZoom / zoomFactor, s.minZoom);
    if (Math.abs(s.currentZoom - oldZoom) <= 0.001) return false;

    viewportInteractionStarted = true;

    const wrapperRectNow = wrapper.getBoundingClientRect();
    const factor = scale();
    // Over the black band there is no diagram under the pointer, so anchor on
    // the nearest point of the diagram instead of a point off its edge.
    const anchorClientX = Math.min(Math.max(clientX, imageRectBeforeZoom.left), imageRectBeforeZoom.right);
    const anchorClientY = Math.min(Math.max(clientY, imageRectBeforeZoom.top), imageRectBeforeZoom.bottom);
    const anchorXOnWrapper = (anchorClientX - wrapperRectNow.left) / factor;
    const anchorYOnWrapper = (anchorClientY - wrapperRectNow.top) / factor;
    const imageLeftOnWrapper = (imageRectBeforeZoom.left - wrapperRectNow.left) / factor;
    const imageTopOnWrapper = (imageRectBeforeZoom.top - wrapperRectNow.top) / factor;
    const imageBaseLeftOnWrapper = imageLeftOnWrapper - s.imageTranslateX;
    const imageBaseTopOnWrapper = imageTopOnWrapper - s.imageTranslateY;
    const targetX = (anchorXOnWrapper - imageLeftOnWrapper) / oldZoom;
    const targetY = (anchorYOnWrapper - imageTopOnWrapper) / oldZoom;

    s.imageTranslateX = anchorXOnWrapper - imageBaseLeftOnWrapper - targetX * s.currentZoom;
    s.imageTranslateY = anchorYOnWrapper - imageBaseTopOnWrapper - targetY * s.currentZoom;
    if (s.currentZoom < s.minZoom) s.currentZoom = s.minZoom;

    if (wasFitAll && zoomIn && s.currentZoom > s.minZoom + 0.0001) camera().exitFitAllStateOnly();

    geometry().updateImageTransform();
    camera().maybePromoteFitGeometryToCover(anchorClientX, anchorClientY);
    notifyViewportUserInput();
    return true;
  }

  // One keypress is worth one mouse-wheel notch, which saturates the wheel's
  // per-event step cap.
  function zoomByKeyboardStep(zoomIn) {
    const wrapperRect = wrapper.getBoundingClientRect();
    return zoomAtPoint(
      ZOOM_STEP_RATIO ** MAX_WHEEL_STEPS,
      zoomIn,
      wrapperRect.left + wrapperRect.width / 2,
      wrapperRect.top + wrapperRect.height / 2,
    );
  }

  // Pan by a fraction of the viewport. updateImageTransform clamps, so a pan
  // into the edge stops there instead of running off.
  function panByViewportFraction(fractionX, fractionY) {
    const width = wrapper.clientWidth;
    const height = wrapper.clientHeight;
    if (!(width > 0) || !(height > 0)) return false;
    s.imageTranslateX -= fractionX * width;
    s.imageTranslateY -= fractionY * height;
    viewportInteractionStarted = true;
    geometry().updateImageTransform();
    notifyViewportUserInput();
    return true;
  }

  function handleWheel(event) {
    if (suspended || !input.wheel) return;
    if (isDiagramLockedByModal()) {
      // The dialog's own content scrolls; nothing else moves behind it.
      const inside = eventElement(event);
      if (inside && inside.closest(".modal-content")) return;
      if (event.cancelable) event.preventDefault();
      return;
    }
    if (isViewportLockedByMobileTooltip()) {
      const mobileTooltip = ctx.services.tooltip.getCurrentMobileTooltip();
      const target = eventElement(event);
      const insideMobileTooltip = mobileTooltip && target && mobileTooltip.contains(target);
      if (!insideMobileTooltip && event.cancelable) event.preventDefault();
      return;
    }
    const target = eventElement(event);
    if (target && ctx.isInsideModal(target)) return;
    if (s.filterPanelOpen && target && target.closest(".filter-panel")) return;
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

    // Anywhere in the diagram area counts, including the empty space beside a
    // letterboxed diagram - the anchor is clamped to the diagram above, so the
    // wheel is never dead over a band of the screen.
    const wrapperRect = wrapper.getBoundingClientRect();
    const isOverDiagramArea =
      event.clientX >= wrapperRect.left &&
      event.clientX <= wrapperRect.right &&
      event.clientY >= wrapperRect.top &&
      event.clientY <= wrapperRect.bottom;
    if (!isOverDiagramArea) return;

    event.preventDefault();
    zoomAtPoint(ZOOM_STEP_RATIO ** getWheelZoomSteps(event), event.deltaY < 0, event.clientX, event.clientY);
  }

  function beginPan(clientX, clientY) {
    if (s.fitAllMode) camera().disableFitAllForInteraction(clientX, clientY);
    s.isPanning = true;
    viewportInteractionStarted = true;
    s.panScale = scale();
    s.panStartX = clientX / s.panScale - s.imageTranslateX;
    s.panStartY = clientY / s.panScale - s.imageTranslateY;
  }

  function movePan(clientX, clientY) {
    s.imageTranslateX = clientX / s.panScale - s.panStartX;
    s.imageTranslateY = clientY / s.panScale - s.panStartY;
    geometry().updateImageTransform();
  }

  function handleMouseDown(event) {
    if (suspended || !input.drag) return;
    if (isDiagramLockedByModal()) return;
    if (isViewportLockedByMobileTooltip()) return;
    if (event.button !== 0) return;
    if (!image.contains(event.target)) return;

    beginPan(event.clientX, event.clientY);
    image.style.cursor = "grabbing";
    event.preventDefault();

    if (dragController) dragController.abort();
    dragController = childSignal(ctx.signal);
    const signal = dragController.signal;
    ctx.doc.addEventListener("mousemove", handleMouseMove, { signal });
    ctx.doc.addEventListener("mouseup", handleMouseUp, { signal });
  }

  function endDragListeners() {
    if (dragController) dragController.abort();
    dragController = null;
  }

  function handleMouseMove(event) {
    if (isViewportLockedByMobileTooltip()) return;
    if (!s.isPanning) return;
    movePan(event.clientX, event.clientY);
    event.preventDefault();
  }

  function handleMouseUp(event) {
    endDragListeners();
    if (isViewportLockedByMobileTooltip()) {
      s.isPanning = false;
      return;
    }
    if (!s.isPanning) return;
    s.isPanning = false;
    image.style.cursor = "grab";
    event.preventDefault();
    notifyViewportUserInput();
  }

  function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getTouchCenterLocal(touches) {
    const wrapperRect = wrapper.getBoundingClientRect();
    const factor = scale();
    return {
      x: ((touches[0].clientX + touches[1].clientX) / 2 - wrapperRect.left) / factor,
      y: ((touches[0].clientY + touches[1].clientY) / 2 - wrapperRect.top) / factor,
    };
  }

  function shouldIgnoreTouchEvent(event) {
    const target = eventElement(event);
    const mobileTooltip = ctx.services.tooltip ? ctx.services.tooltip.getCurrentMobileTooltip() : null;
    if (mobileTooltip && mobileTooltip.style.display !== "none" && target && mobileTooltip.contains(target)) return true;
    if (!target || typeof target.closest !== "function") return false;
    return Boolean(target.closest(".tooltip-box") || target.closest(".filter-panel") || ctx.isInsideModal(target));
  }

  function resetTouch() {
    s.isPanning = false;
    s.isTouchActive = false;
  }

  function handleTouchStart(event) {
    if (!input.drag && !input.pinch) return;
    if (suspended || isDiagramLockedByModal() || isViewportLockedByMobileTooltip() || shouldIgnoreTouchEvent(event)) {
      resetTouch();
      return;
    }
    s.isTouchActive = true;
    s.cachedBounds = null;
    geometry().getImageBounds(true);

    const first = event.touches[0];
    if (event.touches.length === 2) {
      if (!input.pinch) return;
      if (s.fitAllMode) camera().disableFitAllForInteraction(first ? first.clientX : null, first ? first.clientY : null);
      viewportInteractionStarted = true;
      isPinching = true;
      blockSingleTouchPan = false;
      s.isPanning = false;
      lastPinchDistance = getTouchDistance(event.touches);
      lastPinchCenter = getTouchCenterLocal(event.touches);
      if (event.cancelable) event.preventDefault();
      return;
    }

    if (event.touches.length === 1 && !blockSingleTouchPan && input.drag) {
      beginPan(first.clientX, first.clientY);
      if (event.cancelable) event.preventDefault();
    }
  }

  function handleTouchMove(event) {
    if (suspended || isViewportLockedByMobileTooltip() || shouldIgnoreTouchEvent(event)) return;

    if (event.touches.length === 2 && input.pinch) {
      if (!isPinching) {
        isPinching = true;
        s.isPanning = false;
        lastPinchDistance = getTouchDistance(event.touches);
        lastPinchCenter = getTouchCenterLocal(event.touches);
      }

      const currentDistance = getTouchDistance(event.touches);
      const imageRectBeforeZoom = image.getBoundingClientRect();
      const safeLastDistance = lastPinchDistance > 0 ? lastPinchDistance : currentDistance;
      const newZoom = Math.max(s.minZoom, Math.min(s.maxZoom, s.currentZoom * (currentDistance / safeLastDistance)));

      const wrapperRect = wrapper.getBoundingClientRect();
      const factor = scale();
      const center = getTouchCenterLocal(event.touches);
      const imageLeftOnWrapper = (imageRectBeforeZoom.left - wrapperRect.left) / factor;
      const imageTopOnWrapper = (imageRectBeforeZoom.top - wrapperRect.top) / factor;
      const imageBaseLeftOnWrapper = imageLeftOnWrapper - s.imageTranslateX;
      const imageBaseTopOnWrapper = imageTopOnWrapper - s.imageTranslateY;

      const oldZoom = s.currentZoom;
      s.currentZoom = newZoom;
      if (Math.abs(s.currentZoom - oldZoom) > 0.0001) {
        const targetX = (center.x - imageLeftOnWrapper) / oldZoom;
        const targetY = (center.y - imageTopOnWrapper) / oldZoom;
        s.imageTranslateX = center.x - imageBaseLeftOnWrapper - targetX * s.currentZoom;
        s.imageTranslateY = center.y - imageBaseTopOnWrapper - targetY * s.currentZoom;
      } else {
        s.imageTranslateX += center.x - lastPinchCenter.x;
        s.imageTranslateY += center.y - lastPinchCenter.y;
      }
      if (s.currentZoom < s.minZoom) s.currentZoom = s.minZoom;

      geometry().updateImageTransform();
      lastPinchDistance = currentDistance;
      lastPinchCenter = center;
      if (event.cancelable) event.preventDefault();
      return;
    }

    if (event.touches.length === 1 && blockSingleTouchPan) {
      if (event.cancelable) event.preventDefault();
      return;
    }

    if (event.touches.length === 1 && s.isPanning) {
      movePan(event.touches[0].clientX, event.touches[0].clientY);
      if (event.cancelable) event.preventDefault();
    }
  }

  function handleTouchEnd(event) {
    if (isViewportLockedByMobileTooltip()) {
      resetTouch();
      return;
    }
    if (shouldIgnoreTouchEvent(event)) return;

    if (event.touches.length === 1 && isPinching) {
      isPinching = false;
      blockSingleTouchPan = true;
      s.isPanning = false;
      lastPinchDistance = 0;
      if (event.cancelable) event.preventDefault();
      return;
    }
    if (event.touches.length === 2) {
      isPinching = true;
      s.isPanning = false;
      lastPinchDistance = getTouchDistance(event.touches);
      lastPinchCenter = getTouchCenterLocal(event.touches);
      return;
    }
    if (event.touches.length !== 0) return;

    s.isPanning = false;
    isPinching = false;
    blockSingleTouchPan = false;
    lastPinchDistance = 0;
    lastPinchCenter = { x: 0, y: 0 };
    s.isTouchActive = false;
    s.cachedBounds = null;
    ctx.services.overlays.scheduleMarkerPositioning(true);
    notifyViewportUserInput();
  }

  // Keeps the browser from zooming the page while two fingers are on the
  // diagram.
  function handleRootTouchMove(event) {
    if (isViewportLockedByMobileTooltip()) return;
    if (!s.isTouchActive) return;
    if (!event.touches || event.touches.length < 2) return;
    if (event.cancelable) event.preventDefault();
  }

  function handleGestureEvent(event) {
    if (event.cancelable) event.preventDefault();
  }

  // Handlers check ctx.features.input when they run, so setInput() can turn
  // input on and off (a "live" slide in a deck).
  function initialize() {
    const signal = ctx.signal;
    const active = { passive: false, signal };
    ctx.root.addEventListener("wheel", handleWheel, active);
    image.addEventListener("mousedown", handleMouseDown, { signal });
    wrapper.addEventListener("touchstart", handleTouchStart, active);
    wrapper.addEventListener("touchmove", handleTouchMove, active);
    wrapper.addEventListener("touchend", handleTouchEnd, { signal });
    ctx.root.addEventListener("touchmove", handleRootTouchMove, active);
    const gesture = (event) => {
      if (input.pinch) handleGestureEvent(event);
    };
    wrapper.addEventListener("gesturestart", gesture, active);
    wrapper.addEventListener("gesturechange", gesture, active);
    wrapper.addEventListener("gestureend", gesture, active);
  }

  // Pointer input only; keyboard handling is wired once at mount.
  function setInput(next) {
    Object.entries(next).forEach(([key, value]) => {
      if (!RUNTIME_INPUT_KEYS.includes(key)) {
        throw new Error(`setInput: "${key}" cannot change after mount; allowed: ${RUNTIME_INPUT_KEYS.join(", ")}`);
      }
      if (typeof value !== "boolean") throw new Error(`setInput: ${key} must be a boolean, got ${JSON.stringify(value)}`);
      input[key] = value;
    });
  }

  return {
    initialize,
    setInput,
    handleResize,
    zoomAtPoint,
    zoomByKeyboardStep,
    panByViewportFraction,
    markInteraction: () => {
      viewportInteractionStarted = true;
    },
    suspend: () => {
      suspended = true;
      endDragListeners();
      s.isPanning = false;
    },
    resume: () => {
      suspended = false;
    },
  };
}
