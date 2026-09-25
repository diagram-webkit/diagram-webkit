// The visible rect in diagram
// space, restoring a shared rect, and the camera intent that is reported
// until the reader moves the diagram.
import { FIT_VALUE, serializeRect, rectToObject, rectFromObject, roundCoord } from "../core/codec/camera";
import { invertMatrix } from "./camera.js";

const ZOOM_EPSILON = 0.001;
// Breathing room added around a shared rect so it is not flush against the
// viewport edges and the chrome that overlays the diagram.
export const RESTORE_PADDING = 0.03;
// How much of a shared rect may fall outside a cover-fitted viewport before
// we give up on cover geometry and show the whole diagram instead.
export const MAX_COVER_SHORTFALL = 0.15;
export const CENTER_NUDGE_ITERATIONS = 3;

function clampUnit(value) {
  return Math.min(1, Math.max(0, value));
}

/** @param {import("./context").Context & Record<string, any>} ctx */
export function createCameraUrl(ctx) {
  const s = ctx.s;
  const camera = () => ctx.services.camera;
  const geometry = () => ctx.services.geometry;
  // Filter state is written to the URL during startup, long before the
  // diagram is on screen. The incoming camera is kept and served until the
  // reader moves the diagram themselves. setState() replaces it.
  let userControlled = false;
  /** @type {import("../core/state").CameraSpec | undefined} */
  let intent;

  function rootSvg() {
    return /** @type {SVGSVGElement | null} */ (ctx.els.image.querySelector("svg"));
  }

  function getViewBox() {
    const svg = rootSvg();
    const viewBox = svg && svg.viewBox && svg.viewBox.baseVal;
    if (!viewBox || !(viewBox.width > 0) || !(viewBox.height > 0)) return null;
    return viewBox;
  }

  // The shared region is what the reader can actually see: the diagram area
  // minus whatever the filter panel covers.
  function getDiagramViewportBounds() {
    const visible = camera().getVisibleViewportBounds();
    const wrapperRect = ctx.els.wrapper.getBoundingClientRect();
    if (!(wrapperRect.width > 0) || !(wrapperRect.height > 0)) return null;
    const minX = Math.max(visible.minX, wrapperRect.left);
    const maxX = Math.min(visible.maxX, wrapperRect.right);
    const minY = Math.max(visible.minY, wrapperRect.top);
    const maxY = Math.min(visible.maxY, wrapperRect.bottom);
    if (!(maxX > minX) || !(maxY > minY)) return null;
    return { minX, maxX, minY, maxY };
  }

  // Visible viewport in diagram space, 0..1 on both axes. clampToDiagram=false
  // keeps the raw extent, which is what the zoom math needs; the serialized
  // rect is clamped so letterboxing is never shared.
  function getVisibleDiagramRect(clampToDiagram = true) {
    const viewBox = getViewBox();
    const svg = rootSvg();
    const inverse = invertMatrix(svg ? svg.getScreenCTM() : null);
    if (!viewBox || !inverse) return null;
    const bounds = getDiagramViewportBounds();
    if (!bounds) return null;

    const topLeft = new DOMPoint(bounds.minX, bounds.minY).matrixTransform(inverse);
    const bottomRight = new DOMPoint(bounds.maxX, bounds.maxY).matrixTransform(inverse);
    if (![topLeft.x, topLeft.y, bottomRight.x, bottomRight.y].every(Number.isFinite)) return null;

    let left = (topLeft.x - viewBox.x) / viewBox.width;
    let top = (topLeft.y - viewBox.y) / viewBox.height;
    let right = (bottomRight.x - viewBox.x) / viewBox.width;
    let bottom = (bottomRight.y - viewBox.y) / viewBox.height;
    if (clampToDiagram) {
      left = clampUnit(left);
      top = clampUnit(top);
      right = clampUnit(right);
      bottom = clampUnit(bottom);
    }
    const width = right - left;
    const height = bottom - top;
    if (!(width > 0) || !(height > 0)) return null;
    return { cx: left + width / 2, cy: top + height / 2, w: width, h: height };
  }

  function markUserControlled() {
    userControlled = true;
  }

  function setIntent(next) {
    intent = next;
    userControlled = false;
  }

  function isFullyZoomedOut() {
    return s.fitAllMode || s.currentZoom <= s.minZoom + ZOOM_EPSILON;
  }

  // What the camera is, as state: the intent until the reader moves the
  // diagram, then what is on screen. undefined is the default view.
  function getCameraState() {
    if (!userControlled) {
      if (!intent) return undefined;
      if ("rect" in intent) return { rect: /** @type {any} */ (intent.rect.map(roundCoord)) };
      return intent;
    }
    if (camera().isDefaultViewport()) return undefined;
    if (isFullyZoomedOut()) return { fit: true };
    const rect = getVisibleDiagramRect(true);
    return rect ? { rect: /** @type {any} */ (rectFromObject(rect).map(roundCoord)) } : undefined;
  }

  // Coordinates are only worth sharing when the sender picked a view: in the
  // default view the visible rect is a property of their screen.
  function getUrlValue() {
    if (!userControlled) {
      if (!intent) return null;
      if ("fit" in intent) return FIT_VALUE;
      if ("rect" in intent) return serializeRect(rectToObject(intent.rect));
      // A focus camera has no URL form; share what is on screen.
      const rect = getVisibleDiagramRect(true);
      return rect ? serializeRect(rect) : null;
    }
    if (camera().isDefaultViewport()) return null;
    if (isFullyZoomedOut()) return FIT_VALUE;
    const rect = getVisibleDiagramRect(true);
    return rect ? serializeRect(rect) : null;
  }

  function centerOnRect(rect) {
    const viewBox = getViewBox();
    const bounds = getDiagramViewportBounds();
    if (!viewBox || !bounds) return;
    camera().nudgeToSvgAnchor(
      viewBox.x + rect.cx * viewBox.width,
      viewBox.y + rect.cy * viewBox.height,
      bounds.minX + (bounds.maxX - bounds.minX) / 2,
      bounds.minY + (bounds.maxY - bounds.minY) / 2,
      CENTER_NUDGE_ITERATIONS,
    );
  }

  // Contain semantics: pick the axis that constrains hardest so the whole
  // shared rect fits, and show more than was shared on the other axis.
  // Never the reverse - cropping is what makes a shared link useless.
  function applyRect(rect) {
    const current = getVisibleDiagramRect(false);
    if (!current) return false;

    const targetWidth = Math.min(1, rect.w * (1 + RESTORE_PADDING * 2));
    const targetHeight = Math.min(1, rect.h * (1 + RESTORE_PADDING * 2));
    const scaleFactor = Math.min(current.w / targetWidth, current.h / targetHeight);
    if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return false;

    const desiredZoom = s.currentZoom * scaleFactor;
    // Cover geometry cannot zoom out past minZoom, so a rect that is wider or
    // taller than this screen can show would silently get cropped. Give up on
    // the exact region and show the whole diagram instead.
    if (desiredZoom < s.minZoom * (1 - MAX_COVER_SHORTFALL)) {
      camera().setFitAllMode(true);
      return true;
    }

    s.currentZoom = Math.min(s.maxZoom, Math.max(s.minZoom, desiredZoom));
    geometry().applyRawTransform();
    centerOnRect(rect);
    geometry().updateImageTransform();
    return true;
  }

  function restoreIntent() {
    if (!intent) return false;
    if ("fit" in intent) {
      camera().setFitAllMode(true);
      return true;
    }
    if ("rect" in intent) return applyRect(rectToObject(intent.rect));
    return false;
  }

  return {
    getViewBox,
    getVisibleDiagramRect,
    getCameraState,
    getUrlValue,
    markUserControlled,
    setIntent,
    isUserControlled: () => userControlled,
    applyRect,
    restoreIntent,
  };
}
