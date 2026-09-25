// Programmatic camera: apply a CameraSpec, optionally animated. Reuses the
// v= restore.
import { rectFromObject, rectToObject } from "../core/codec/camera";

export const DEFAULT_FOCUS_PADDING = 0.05;

const SHAPES = "rect,circle,ellipse,path,polygon,polyline,line,text,image,use";

// Client rects of what an element draws. draw.io writes labels as
// <switch><foreignObject width="100%" height="100%">…</foreignObject><text/></switch>:
// the foreignObject's box is the whole diagram and the <text> fallback is not
// rendered (0x0), so a label counts by its text and everything else by its shape.
function drawnClientRects(element) {
  const rects = [];
  const add = (rect) => {
    if (rect.width > 0 || rect.height > 0) rects.push(rect);
  };
  const shapes = element.matches(SHAPES) ? [element] : Array.from(element.querySelectorAll(SHAPES));
  shapes.forEach((shape) => {
    if (!shape.closest("foreignObject")) add(shape.getBoundingClientRect());
  });
  element.querySelectorAll("foreignObject").forEach((label) => {
    const doc = label.ownerDocument;
    const range = doc.createRange();
    const walker = doc.createTreeWalker(label, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue.trim()) continue;
      range.selectNodeContents(node);
      add(range.getBoundingClientRect());
    }
    label.querySelectorAll("img").forEach((image) => add(image.getBoundingClientRect()));
  });
  return rects;
}

/** @param {import("./context").Context & Record<string, any>} ctx */
export function createCameraControl(ctx) {
  const s = ctx.s;
  const sv = ctx.services;
  let animationFrame = 0;

  function snapshot() {
    return { zoom: s.currentZoom, x: s.imageTranslateX, y: s.imageTranslateY, fit: s.fitAllMode, geometry: s.fitGeometryMode };
  }

  // During a tween the image is its own compositor layer, so each frame is a
  // transform, not a repaint of the SVG and the highlight layer. Removed at
  // the end: a promoted layer keeps its raster scale and would stay blurry
  // after zooming in.
  function setTweening(on) {
    sv.geometry.holdLayer("camera", on);
  }

  function stopAnimation() {
    ctx.timers.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    setTweening(false);
  }

  // Applies the change instantly to learn the end state, then tweens from
  // the start to it. Fit-all changes the image geometry, so those jump.
  function animate(apply, transition) {
    stopAnimation();
    sv.camera.stopHoverPanAnimation();
    const start = snapshot();
    const result = apply();
    const end = snapshot();
    const ms = /** @type {number} */ (transition);
    if (!animated(transition) || start.fit !== end.fit || start.geometry !== end.geometry) {
      return Promise.resolve(result);
    }
    s.currentZoom = start.zoom;
    s.imageTranslateX = start.x;
    s.imageTranslateY = start.y;
    sv.geometry.applyRawTransform();
    setTweening(true);
    const startTime = ctx.win.performance.now();
    return new Promise((resolve) => {
      const step = (now) => {
        // rAF time can predate startTime by a frame; below 0 the curve runs backwards.
        const t = Math.max(0, Math.min(1, (now - startTime) / ms));
        const eased = 1 - Math.pow(1 - t, 3);
        // Zoom in log space so zooming in and out feel symmetric.
        s.currentZoom = Math.exp(Math.log(start.zoom) + (Math.log(end.zoom) - Math.log(start.zoom)) * eased);
        s.imageTranslateX = start.x + (end.x - start.x) * eased;
        s.imageTranslateY = start.y + (end.y - start.y) * eased;
        sv.geometry.applyRawTransform();
        if (t < 1) {
          animationFrame = ctx.timers.requestAnimationFrame(step);
          return;
        }
        animationFrame = 0;
        setTweening(false);
        s.currentZoom = end.zoom;
        s.imageTranslateX = end.x;
        s.imageTranslateY = end.y;
        sv.geometry.updateImageTransform();
        resolve(result);
      };
      animationFrame = ctx.timers.requestAnimationFrame(step);
    });
  }

  // Union of what the elements draw, in diagram space (0..1 of the viewBox).
  function measure(elements) {
    const svg = /** @type {SVGSVGElement | null} */ (ctx.els.image.querySelector("svg"));
    const viewBox = sv.cameraUrl.getViewBox();
    const rootCtm = svg ? svg.getScreenCTM() : null;
    if (!svg || !viewBox || !rootCtm) return null;
    const toRoot = rootCtm.inverse();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    elements.flatMap(drawnClientRects).forEach((rect) => {
      [
        [rect.left, rect.top],
        [rect.right, rect.bottom],
      ].forEach(([x, y]) => {
        const point = new DOMPoint(x, y).matrixTransform(toRoot);
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
    });
    if (!Number.isFinite(minX)) return null;
    return {
      left: (minX - viewBox.x) / viewBox.width,
      top: (minY - viewBox.y) / viewBox.height,
      right: (maxX - viewBox.x) / viewBox.width,
      bottom: (maxY - viewBox.y) / viewBox.height,
    };
  }

  function focusRect(focus, padding = DEFAULT_FOCUS_PADDING) {
    const elements = ctx.queryElements(focus);
    const box = measure(elements);
    if (!box) {
      console.warn("diagram-webkit: camera.focus matched nothing visible:", JSON.stringify(focus));
      return null;
    }
    const width = Math.max(box.right - box.left, 0.001);
    const height = Math.max(box.bottom - box.top, 0.001);
    return {
      cx: Math.min(1, Math.max(0, box.left + width / 2)),
      cy: Math.min(1, Math.max(0, box.top + height / 2)),
      w: Math.min(1, width * (1 + padding * 2)),
      h: Math.min(1, height * (1 + padding * 2)),
    };
  }

  function leaveFitAll() {
    if (!s.fitAllMode) return;
    s.fitAllMode = false;
    s.fitAllRestoreState = null;
    s.pendingCoverSyncAfterFitExit = false;
    s.fitGeometryMode = "cover";
    ctx.root.classList.remove("diagram-fit-all");
    sv.geometry.syncDiagramSize();
  }

  function showRectNow(rect) {
    leaveFitAll();
    if (s.fitGeometryMode !== "cover") {
      s.fitGeometryMode = "cover";
      sv.geometry.syncDiagramSize();
    }
    sv.geometry.updateImageTransform();
    return sv.cameraUrl.applyRect(rect);
  }

  // Fit-all in cover geometry: the same picture without the contain resize,
  // so it can be tweened to and from.
  function coverEquivalentOfFit() {
    leaveFitAll();
    s.fitGeometryMode = "cover";
    sv.geometry.syncDiagramSize();
    s.currentZoom = s.minZoom;
    sv.geometry.centerImageAtCurrentZoom();
    sv.geometry.applyRawTransform();
  }

  function animated(transition) {
    return typeof transition === "number" && transition > 0 && !s.instantVisibility;
  }

  function applyFocus(camera, { transition = false, setIntent = true } = {}) {
    const rect = focusRect(camera.focus, camera.padding);
    if (!rect) return false;
    if (setIntent) sv.cameraUrl.setIntent(camera);
    animate(() => showRectNow(rect), transition);
    return true;
  }

  // Applies a camera spec; undefined is the default view.
  function apply(camera, { transition = false } = {}) {
    if (!ctx.loaded) {
      s.initialCamera = camera;
      sv.cameraUrl.setIntent(camera);
      return Promise.resolve();
    }
    sv.cameraUrl.setIntent(camera);
    if (camera && "fit" in camera) {
      if (s.fitAllMode || !animated(transition)) {
        sv.camera.setFitAllMode(true);
        return Promise.resolve();
      }
      return animate(() => {
        coverEquivalentOfFit();
        sv.geometry.updateImageTransform();
      }, transition).then(() => sv.camera.setFitAllMode(true));
    }
    if (s.fitAllMode && animated(transition)) coverEquivalentOfFit();
    if (camera && "focus" in camera) {
      const rect = focusRect(camera.focus, camera.padding);
      return rect ? animate(() => showRectNow(rect), transition) : Promise.resolve();
    }
    if (camera && "rect" in camera) {
      return animate(() => showRectNow(rectToObject(camera.rect)), transition);
    }
    return animate(() => sv.camera.applyDefaultView(), transition);
  }

  function get() {
    const rect = sv.cameraUrl.getVisibleDiagramRect(true);
    return rect ? rectFromObject(rect) : null;
  }

  function zoomBy(factor, at) {
    const wrapperRect = ctx.els.wrapper.getBoundingClientRect();
    const point = at || { x: wrapperRect.left + wrapperRect.width / 2, y: wrapperRect.top + wrapperRect.height / 2 };
    return sv.input.zoomAtPoint(factor >= 1 ? factor : 1 / factor, factor >= 1, point.x, point.y);
  }

  return { apply, applyFocus, focusRect, get, zoomBy, stopAnimation };
}
