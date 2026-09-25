// Anchors, fit-all, cover promotion, focus,
// centering and go-to. Client-pixel deltas are divided by the ancestor scale
// before they are added to the translate (layout px).
import { getScale, isRectValid } from "./context.js";

export const COVER_ZOOM = 1;
export const FOCUS_MIN_ZOOM = 2;
export const PROMOTION_MARGIN = 6;
export const PROMOTION_EPSILON = 0.75;
const FOCUS_CANDIDATES = "rect,circle,ellipse,path,polygon,polyline,line,text,foreignObject,use,image";

// null when the element is scaled to nothing (e.g. a hidden slide).
export function invertMatrix(matrix) {
  if (!matrix || matrix.a * matrix.d - matrix.b * matrix.c === 0) return null;
  return matrix.inverse();
}

/** @param {import("./context").Context & Record<string, any>} ctx */
export function createCamera(ctx) {
  const s = ctx.s;
  const { image, wrapper } = ctx.els;
  const geometry = () => ctx.services.geometry;
  const scale = () => getScale(wrapper);

  function rootSvg() {
    return /** @type {SVGSVGElement | null} */ (image.querySelector("svg"));
  }

  function setFitAllClass(enabled) {
    ctx.root.classList.toggle("diagram-fit-all", enabled);
  }

  function captureViewportAnchor(clientX = null, clientY = null) {
    const wrapperRect = wrapper.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    if (!isRectValid(wrapperRect) || !isRectValid(imageRect)) return null;

    const targetClientX = Number.isFinite(clientX) ? clientX : wrapperRect.left + wrapperRect.width / 2;
    const targetClientY = Number.isFinite(clientY) ? clientY : wrapperRect.top + wrapperRect.height / 2;
    const anchor = {
      nx: (targetClientX - imageRect.left) / imageRect.width,
      ny: (targetClientY - imageRect.top) / imageRect.height,
      targetClientX,
      targetClientY,
      svgX: NaN,
      svgY: NaN,
    };

    const svg = rootSvg();
    const inverse = invertMatrix(svg ? svg.getScreenCTM() : null);
    if (inverse) {
      const svgPoint = new DOMPoint(targetClientX, targetClientY).matrixTransform(inverse);
      if (Number.isFinite(svgPoint.x) && Number.isFinite(svgPoint.y)) {
        anchor.svgX = svgPoint.x;
        anchor.svgY = svgPoint.y;
      }
    }
    return anchor;
  }

  function restoreViewportAnchor(anchor) {
    if (!anchor) return;
    let targetX = null;
    let targetY = null;
    if (Number.isFinite(anchor.svgX) && Number.isFinite(anchor.svgY)) {
      const svg = rootSvg();
      const ctm = svg ? svg.getScreenCTM() : null;
      if (ctm) {
        const clientPoint = new DOMPoint(anchor.svgX, anchor.svgY).matrixTransform(ctm);
        if (Number.isFinite(clientPoint.x) && Number.isFinite(clientPoint.y)) {
          targetX = clientPoint.x;
          targetY = clientPoint.y;
        }
      }
    }
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
      const imageRect = image.getBoundingClientRect();
      if (!isRectValid(imageRect)) return;
      targetX = imageRect.left + imageRect.width * anchor.nx;
      targetY = imageRect.top + imageRect.height * anchor.ny;
    }
    const desiredX = Number.isFinite(anchor.targetClientX) ? anchor.targetClientX : targetX;
    const desiredY = Number.isFinite(anchor.targetClientY) ? anchor.targetClientY : targetY;
    const factor = scale();
    s.imageTranslateX += (desiredX - targetX) / factor;
    s.imageTranslateY += (desiredY - targetY) / factor;
  }

  function disableFitAllKeepViewport(options = {}) {
    if (!s.fitAllMode) return;
    setFitAllMode(false, { restore: false, anchorClientX: options.anchorClientX, anchorClientY: options.anchorClientY });
  }

  function isViewportFullyCoveredAtCurrentZoom() {
    const wrapperRect = wrapper.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    if (!isRectValid(wrapperRect) || !isRectValid(imageRect)) return false;

    const svg = rootSvg();
    const styles = svg ? ctx.win.getComputedStyle(svg) : null;
    const pad = (name) => (styles ? Number.parseFloat(styles[name]) || 0 : 0);
    const factor = s.currentZoom * scale();
    const drawableLeft = imageRect.left + pad("paddingLeft") * factor;
    const drawableTop = imageRect.top + pad("paddingTop") * factor;
    const drawableRight = imageRect.right - pad("paddingRight") * factor;
    const drawableBottom = imageRect.bottom - pad("paddingBottom") * factor;

    return (
      drawableLeft <= wrapperRect.left - PROMOTION_MARGIN + PROMOTION_EPSILON &&
      drawableTop <= wrapperRect.top - PROMOTION_MARGIN + PROMOTION_EPSILON &&
      drawableRight >= wrapperRect.right + PROMOTION_MARGIN - PROMOTION_EPSILON &&
      drawableBottom >= wrapperRect.bottom + PROMOTION_MARGIN - PROMOTION_EPSILON
    );
  }

  function nudgeToSvgAnchor(svgX, svgY, targetClientX, targetClientY, iterations = 2) {
    if (!Number.isFinite(svgX) || !Number.isFinite(svgY)) return;
    if (!Number.isFinite(targetClientX) || !Number.isFinite(targetClientY)) return;
    const svg = rootSvg();
    if (!svg) return;

    for (let i = 0; i < iterations; i += 1) {
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const point = new DOMPoint(svgX, svgY).matrixTransform(ctm);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      const dx = targetClientX - point.x;
      const dy = targetClientY - point.y;
      if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return;
      const factor = scale();
      s.imageTranslateX += dx / factor;
      s.imageTranslateY += dy / factor;
      geometry().applyRawTransform();
    }
  }

  function maybePromoteFitGeometryToCover(anchorClientX = null, anchorClientY = null) {
    if (!s.pendingCoverSyncAfterFitExit) return false;
    if (s.fitGeometryMode !== "contain") {
      s.pendingCoverSyncAfterFitExit = false;
      return false;
    }
    if (!isViewportFullyCoveredAtCurrentZoom()) return false;

    const precisionAnchor = captureViewportAnchor(anchorClientX, anchorClientY);
    const rectBefore = image.getBoundingClientRect();
    const zoomBefore = s.currentZoom;
    const translateBeforeX = s.imageTranslateX;
    const translateBeforeY = s.imageTranslateY;

    s.fitGeometryMode = "cover";
    s.pendingCoverSyncAfterFitExit = false;
    geometry().syncDiagramSize();

    const rectAfterSync = image.getBoundingClientRect();
    if (isRectValid(rectBefore) && isRectValid(rectAfterSync)) {
      const scaleFromWidth = rectAfterSync.width > 0 ? rectBefore.width / rectAfterSync.width : 1;
      const scaleFromHeight = rectAfterSync.height > 0 ? rectBefore.height / rectAfterSync.height : 1;
      const scaleFactor = Number.isFinite(scaleFromWidth) ? scaleFromWidth : scaleFromHeight;
      const factor = scale();
      s.currentZoom = Math.max(s.minZoom, zoomBefore * scaleFactor);
      s.imageTranslateX = translateBeforeX + (rectBefore.left - rectAfterSync.left) / factor;
      s.imageTranslateY = translateBeforeY + (rectBefore.top - rectAfterSync.top) / factor;
    } else {
      restoreViewportAnchor(captureViewportAnchor(anchorClientX, anchorClientY));
    }

    geometry().applyRawTransform();

    const wrapperRect = wrapper.getBoundingClientRect();
    const targetClientX = Number.isFinite(anchorClientX) ? anchorClientX : wrapperRect.left + wrapperRect.width / 2;
    const targetClientY = Number.isFinite(anchorClientY) ? anchorClientY : wrapperRect.top + wrapperRect.height / 2;
    if (precisionAnchor && Number.isFinite(precisionAnchor.svgX) && Number.isFinite(precisionAnchor.svgY)) {
      nudgeToSvgAnchor(precisionAnchor.svgX, precisionAnchor.svgY, targetClientX, targetClientY, 2);
    }
    return true;
  }

  function exitFitAllStateOnly() {
    if (!s.fitAllMode) return;
    s.fitAllMode = false;
    s.fitAllRestoreState = null;
    s.pendingCoverSyncAfterFitExit = true;
    setFitAllClass(false);
  }

  function disableFitAllForInteraction(anchorClientX = null, anchorClientY = null) {
    if (!s.fitAllMode) return;
    const anchor = captureViewportAnchor(anchorClientX, anchorClientY);
    s.fitAllMode = false;
    s.fitAllRestoreState = null;
    setFitAllClass(false);
    geometry().syncDiagramSize();
    restoreViewportAnchor(anchor);
    geometry().updateImageTransform();
  }

  function setFitAllMode(enabled, options = {}) {
    const next = Boolean(enabled);
    if (s.fitAllMode === next) return;

    if (next) {
      s.fitAllRestoreState = { zoom: s.currentZoom, translateX: s.imageTranslateX, translateY: s.imageTranslateY };
    }
    const shouldRestore = options.restore !== false;
    const preserveAnchor = !next && !shouldRestore;
    const anchor = preserveAnchor ? captureViewportAnchor(options.anchorClientX, options.anchorClientY) : null;

    s.fitAllMode = next;
    s.fitGeometryMode = next ? "contain" : "cover";
    if (next || options.restore !== false) s.pendingCoverSyncAfterFitExit = false;
    setFitAllClass(next);

    geometry().syncDiagramSize();
    if (next) {
      s.currentZoom = s.minZoom;
      geometry().updateImageTransform();
    } else {
      if (shouldRestore && s.fitAllRestoreState) {
        s.currentZoom = s.fitAllRestoreState.zoom;
        s.imageTranslateX = s.fitAllRestoreState.translateX;
        s.imageTranslateY = s.fitAllRestoreState.translateY;
      } else if (preserveAnchor) {
        restoreViewportAnchor(anchor);
      } else if (s.currentZoom <= s.minZoom + 0.001) {
        geometry().alignImageAtCurrentZoom(...defaultAlign());
      }
      s.fitAllRestoreState = null;
    }
    geometry().updateImageTransform();
  }

  function defaultAlign() {
    const align = ctx.config.camera.defaultAlign;
    return /** @type {[string, string]} */ ([align[0], align[1]]);
  }

  function viewportRect() {
    return ctx.root.getBoundingClientRect();
  }

  // The part of the container the diagram can be seen in: the container
  // minus a margin and whatever the open filter panel covers. Client px.
  function getVisibleViewportBounds() {
    const margin = 8;
    const view = viewportRect();
    let minX = view.left + margin;
    let maxX = Math.max(minX + 1, view.right - margin);
    let minY = view.top + margin;
    let maxY = Math.max(minY + 1, view.bottom - margin);

    const panel = s.filterPanelOpen ? ctx.maybeEl("filter-panel") : null;
    if (panel) {
      const panelRect = panel.getBoundingClientRect();
      if (panelRect.width > 0 && panelRect.left < view.right && panelRect.right > view.left) {
        if (panelRect.left >= view.left + view.width * 0.35) {
          maxX = Math.min(maxX, panelRect.left - margin);
        } else {
          minX = Math.max(minX, panelRect.right + margin);
        }
      }
    }
    if (maxX <= minX) {
      minX = view.left + margin;
      maxX = Math.max(minX + 1, view.right - margin);
    }
    if (maxY <= minY) {
      minY = view.top + margin;
      maxY = Math.max(minY + 1, view.bottom - margin);
    }
    return { minX, maxX, minY, maxY };
  }

  function getVisibleViewportCenter() {
    const bounds = getVisibleViewportBounds();
    return { x: bounds.minX + (bounds.maxX - bounds.minX) / 2, y: bounds.minY + (bounds.maxY - bounds.minY) / 2 };
  }

  function getRectFromSvgGraphicsElement(element) {
    if (!element || typeof element.getBBox !== "function" || typeof element.getScreenCTM !== "function") return null;
    const bbox = element.getBBox();
    const ctm = element.getScreenCTM();
    if (!bbox || !ctm || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)) return null;
    if (bbox.width <= 0 || bbox.height <= 0) return null;

    const corners = [
      new DOMPoint(bbox.x, bbox.y),
      new DOMPoint(bbox.x + bbox.width, bbox.y),
      new DOMPoint(bbox.x, bbox.y + bbox.height),
      new DOMPoint(bbox.x + bbox.width, bbox.y + bbox.height),
    ].map((point) => point.matrixTransform(ctm));
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const width = right - left;
    const height = bottom - top;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return { left, top, right, bottom, width, height };
  }

  function getElementRect(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") return null;
    const rect = element.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    }
    return getRectFromSvgGraphicsElement(element);
  }

  // A <g>'s own box spans every child, which on a big diagram can be larger
  // than the screen. The smallest drawn thing inside it is what the reader
  // means by "this element", so both centring and the pin rings aim at that.
  function getElementFocusRect(element) {
    const view = viewportRect();
    const viewportArea = view.width * view.height;
    const candidates = [element];
    if (element && typeof element.querySelectorAll === "function") {
      candidates.push(...Array.from(element.querySelectorAll(FOCUS_CANDIDATES)));
    }
    let bestRect = null;
    let bestScore = Number.POSITIVE_INFINITY;
    candidates.forEach((candidate) => {
      const rect = getElementRect(candidate);
      if (!rect) return;
      const area = rect.width * rect.height;
      if (!Number.isFinite(area) || area <= 1) return;
      if (area > viewportArea * 0.75) return;
      const score = Math.sqrt(area);
      if (score >= bestScore) return;
      bestScore = score;
      bestRect = rect;
    });
    return bestRect;
  }

  function getElementFocusPoint(element) {
    const rect = getElementFocusRect(element);
    if (!rect) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function stopHoverPanAnimation() {
    if (!s.hoverPanAnimationFrame) return;
    ctx.timers.cancelAnimationFrame(s.hoverPanAnimationFrame);
    s.hoverPanAnimationFrame = null;
  }

  function refreshHighlightLine() {
    const line = ctx.services.highlightLine;
    if (line) line.refreshConnectionPosition();
  }

  function centerHelpRecordInView(record, durationMs = 250, onComplete = null) {
    const done = () => {
      if (typeof onComplete === "function") onComplete();
    };
    const element = record && record.element;
    if (!element || typeof element.getBoundingClientRect !== "function") return done();

    const hasDesktopHover = ctx.win.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (ctx.services.tooltip.isMobileDevice() && !hasDesktopHover) return done();

    stopHoverPanAnimation();
    geometry().updateImageTransform();

    const wrapperRect = wrapper.getBoundingClientRect();
    const focusPoint = getElementFocusPoint(element);
    const elementRect = element.getBoundingClientRect();
    if (!isRectValid(wrapperRect) || !isRectValid(elementRect)) return done();

    const viewportCenter = getVisibleViewportCenter();
    const currentCenterX = focusPoint ? focusPoint.x : elementRect.left + elementRect.width / 2;
    const currentCenterY = focusPoint ? focusPoint.y : elementRect.top + elementRect.height / 2;

    const visibleBounds = getVisibleViewportBounds();
    const VISIBILITY_PADDING = 12;
    const isAlreadyVisible =
      currentCenterX >= visibleBounds.minX + VISIBILITY_PADDING &&
      currentCenterX <= visibleBounds.maxX - VISIBILITY_PADDING &&
      currentCenterY >= visibleBounds.minY + VISIBILITY_PADDING &&
      currentCenterY <= visibleBounds.maxY - VISIBILITY_PADDING;
    if (isAlreadyVisible) return done();

    const factor = scale();
    const deltaX = (viewportCenter.x - currentCenterX) / factor;
    const deltaY = (viewportCenter.y - currentCenterY) / factor;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return done();

    const startTranslateX = s.imageTranslateX;
    const startTranslateY = s.imageTranslateY;
    const endTranslateX = startTranslateX + deltaX;
    const endTranslateY = startTranslateY + deltaY;
    const duration = Math.max(16, Number(durationMs) || 250);
    const startTime = ctx.win.performance.now();

    const step = (now) => {
      const t = Math.max(0, Math.min(1, (now - startTime) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      s.imageTranslateX = startTranslateX + (endTranslateX - startTranslateX) * eased;
      s.imageTranslateY = startTranslateY + (endTranslateY - startTranslateY) * eased;
      geometry().updateImageTransform();
      refreshHighlightLine();

      if (t < 1) {
        s.hoverPanAnimationFrame = ctx.timers.requestAnimationFrame(step);
        return;
      }
      const finalFocusPoint = getElementFocusPoint(element);
      if (finalFocusPoint) {
        const finalDeltaX = viewportCenter.x - finalFocusPoint.x;
        const finalDeltaY = viewportCenter.y - finalFocusPoint.y;
        if (Math.abs(finalDeltaX) > 1 || Math.abs(finalDeltaY) > 1) {
          const finalFactor = scale();
          s.imageTranslateX += finalDeltaX / finalFactor;
          s.imageTranslateY += finalDeltaY / finalFactor;
          geometry().updateImageTransform();
          refreshHighlightLine();
        }
      }
      s.hoverPanAnimationFrame = null;
      done();
    };
    s.hoverPanAnimationFrame = ctx.timers.requestAnimationFrame(step);
  }

  function focusHelpRecord(record, options = {}) {
    if (!record || !record.element || typeof record.element.getBoundingClientRect !== "function") return;

    const shouldKeepZoom = (Boolean(options.preserveFitAll) && s.fitAllMode) || Boolean(options.keepZoom);
    if (!shouldKeepZoom) s.currentZoom = Math.min(s.maxZoom, Math.max(s.currentZoom, FOCUS_MIN_ZOOM));
    geometry().updateImageTransform();

    const wrapperRect = wrapper.getBoundingClientRect();
    const targetRect = record.element.getBoundingClientRect();
    const focusPoint = getElementFocusPoint(record.element);
    if (!isRectValid(wrapperRect) || !isRectValid(targetRect)) return;

    const visibleCenter = getVisibleViewportCenter();
    const targetCenterX = focusPoint ? focusPoint.x : targetRect.left + targetRect.width / 2;
    const targetCenterY = focusPoint ? focusPoint.y : targetRect.top + targetRect.height / 2;
    const factor = scale();
    s.imageTranslateX += (visibleCenter.x - targetCenterX) / factor;
    s.imageTranslateY += (visibleCenter.y - targetCenterY) / factor;
    geometry().updateImageTransform();
  }

  function goToHelpRecord(record, options = {}) {
    if (!record || !record.element) return;
    const token = ++s.goToNavigationToken;

    if (s.filterPanelOpen && options.closePanel !== false && ctx.services.panel) {
      ctx.services.panel.setFilterPanelOpen(false);
    }

    ctx.timers.requestAnimationFrame(() => {
      if (token !== s.goToNavigationToken) return;
      ctx.timers.requestAnimationFrame(() => {
        if (token !== s.goToNavigationToken) return;
        geometry().syncDiagramSize();
        focusHelpRecord(record, options);
        if (options.armUrlSync !== false) ctx.services.urlSync.armViewportUrlSync();
        ctx.services.pulse.pulseGoToElement(record.element);
        if (typeof options.onComplete === "function") options.onComplete();
      });
    });
  }

  // The starting view: cover zoom, anchored at the default alignment.
  // Anything else - zoomed in, zoomed out past the edges, or panned - is a
  // view worth putting in a link.
  function isDefaultViewport() {
    if (s.fitAllMode) return false;
    if (Math.abs(s.currentZoom - COVER_ZOOM) > 0.001) return false;
    const translate = geometry().getAlignmentTranslate(...defaultAlign());
    return Math.abs(s.imageTranslateX - translate.x) < 1 && Math.abs(s.imageTranslateY - translate.y) < 1;
  }

  // Cover zoom at the default alignment, leaving fit-all if it is on.
  function applyDefaultView() {
    if (s.fitAllMode) {
      s.fitAllMode = false;
      s.fitAllRestoreState = null;
      s.fitGeometryMode = "cover";
      s.pendingCoverSyncAfterFitExit = false;
      setFitAllClass(false);
    }
    s.fitGeometryMode = "cover";
    geometry().syncDiagramSize();
    s.currentZoom = COVER_ZOOM;
    geometry().alignImageAtCurrentZoom(...defaultAlign());
    geometry().updateImageTransform();
  }

  return {
    captureViewportAnchor,
    restoreViewportAnchor,
    disableFitAllKeepViewport,
    isViewportFullyCoveredAtCurrentZoom,
    nudgeToSvgAnchor,
    maybePromoteFitGeometryToCover,
    exitFitAllStateOnly,
    disableFitAllForInteraction,
    setFitAllMode,
    getVisibleViewportBounds,
    getVisibleViewportCenter,
    getRectFromSvgGraphicsElement,
    getElementRect,
    getElementFocusRect,
    getElementFocusPoint,
    stopHoverPanAnimation,
    centerHelpRecordInView,
    focusHelpRecord,
    goToHelpRecord,
    isDefaultViewport,
    applyDefaultView,
    defaultAlign,
  };
}
