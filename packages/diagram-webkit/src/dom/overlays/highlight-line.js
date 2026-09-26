// The line from a result to its
// element and the temporary element highlight. Coordinates are local to the
// container.
import { getScale } from "../context.js";

const VIEWPORT_PADDING = 8;
const CANDIDATES = "rect,circle,ellipse,path,polygon,polyline,line,text,foreignObject,use,image";
const SVG_NS = "http://www.w3.org/2000/svg";

/** @param {import("../context").Context & Record<string, any>} ctx */
export function createHighlightLine(ctx) {
  let activeFilterHighlight = null;
  let activeConnection = null;
  let pendingHighlightToken = 0;
  let lineLayer = null;
  let lineElement = null;
  let lineFrame = 0;
  let lineAnimationFrame = 0;
  let temporaryHighlightTimeout = 0;

  function getElementRect(element) {
    const svgRect = ctx.services.camera.getRectFromSvgGraphicsElement(element);
    if (svgRect) return svgRect;
    if (!element || typeof element.getBoundingClientRect !== "function") return null;
    const rect = element.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return rect;
  }

  // Container-local points; the view is the container.
  function resolveElementAnchorPoint(targetEl, sourceX, sourceY, view) {
    const viewportArea = view.width * view.height;
    const candidates = [targetEl, ...Array.from(targetEl.querySelectorAll(CANDIDATES))];
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    candidates.forEach((candidate) => {
      const rect = getElementRect(candidate);
      if (!rect) return;
      const area = rect.width * rect.height;
      if (!Number.isFinite(area) || area <= 1) return;
      if (area > viewportArea * 0.75) return;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const score = Math.hypot(centerX - sourceX, centerY - sourceY) + Math.sqrt(area) * 0.35;
      if (score < bestScore) {
        bestScore = score;
        best = { x: centerX, y: centerY };
      }
    });
    if (best) return best;
    const fallback = getElementRect(targetEl);
    if (fallback) return { x: fallback.left + fallback.width / 2, y: fallback.top + fallback.height / 2 };
    return { x: view.left + view.width / 2, y: view.top + view.height / 2 };
  }

  function setLinePoints(x1, y1, x2, y2) {
    if (!lineElement) return;
    lineElement.setAttribute("x1", `${x1}`);
    lineElement.setAttribute("y1", `${y1}`);
    lineElement.setAttribute("x2", `${x2}`);
    lineElement.setAttribute("y2", `${y2}`);
  }

  function getConnectionPoints() {
    if (!activeConnection) return null;
    const { sourceEl, targetEl } = activeConnection;
    if (!sourceEl || !targetEl || !ctx.root.contains(sourceEl) || !ctx.root.contains(targetEl)) return null;

    const view = ctx.root.getBoundingClientRect();
    const scale = getScale(ctx.root);
    const sourceRect = sourceEl.getBoundingClientRect();
    const sourceRawX = sourceRect.left + 8;
    const sourceRawY = sourceRect.top + sourceRect.height / 2;
    const target = resolveElementAnchorPoint(targetEl, sourceRawX, sourceRawY, view);
    const width = view.width / scale;
    const height = view.height / scale;
    const local = (x, y) => ({ x: (x - view.left) / scale, y: (y - view.top) / scale });
    const clamp = (value, max) => Math.max(VIEWPORT_PADDING, Math.min(value, max - VIEWPORT_PADDING));

    let sourceMinY = VIEWPORT_PADDING;
    let sourceMaxY = height - VIEWPORT_PADDING;
    const sourceViewportEl = sourceEl.closest(".filter-panel-body");
    if (sourceViewportEl) {
      const bodyRect = sourceViewportEl.getBoundingClientRect();
      sourceMinY = Math.max(sourceMinY, local(0, bodyRect.top).y + VIEWPORT_PADDING);
      sourceMaxY = Math.min(sourceMaxY, local(0, bodyRect.bottom).y - VIEWPORT_PADDING);
    }
    if (sourceMaxY < sourceMinY) {
      sourceMinY = VIEWPORT_PADDING;
      sourceMaxY = height - VIEWPORT_PADDING;
    }
    const source = local(sourceRawX, sourceRawY);
    const targetLocal = local(target.x, target.y);
    return {
      viewportWidth: width,
      viewportHeight: height,
      sourceX: clamp(source.x, width),
      sourceY: Math.max(sourceMinY, Math.min(source.y, sourceMaxY)),
      targetX: clamp(targetLocal.x, width),
      targetY: clamp(targetLocal.y, height),
    };
  }

  function stopLineAnimation() {
    ctx.timers.cancelAnimationFrame(lineAnimationFrame);
    lineAnimationFrame = 0;
  }

  // Points are re-read every frame so the line keeps up with a pan or zoom
  // while it grows.
  function animateLineToTarget(durationMs = 200) {
    stopLineAnimation();
    if (!getConnectionPoints() || !lineLayer) {
      if (lineLayer) lineLayer.classList.remove("active");
      return;
    }
    const start = ctx.win.performance.now();
    const step = (now) => {
      const points = getConnectionPoints();
      if (!points) {
        lineAnimationFrame = 0;
        lineLayer.classList.remove("active");
        return;
      }
      const t = Math.min(1, (now - start) / durationMs);
      const { sourceX, sourceY, targetX, targetY } = points;
      lineLayer.setAttribute("viewBox", `0 0 ${points.viewportWidth} ${points.viewportHeight}`);
      setLinePoints(sourceX, sourceY, sourceX + (targetX - sourceX) * t, sourceY + (targetY - sourceY) * t);
      lineLayer.classList.add("active");
      lineAnimationFrame = t < 1 ? ctx.timers.requestAnimationFrame(step) : 0;
    };
    lineAnimationFrame = ctx.timers.requestAnimationFrame(step);
  }

  function ensureLineLayer() {
    if (lineLayer && lineElement) return;
    lineLayer = ctx.doc.createElementNS(SVG_NS, "svg");
    lineLayer.classList.add("filter-highlight-line-layer");
    lineElement = ctx.doc.createElementNS(SVG_NS, "line");
    lineElement.classList.add("filter-highlight-line");
    lineLayer.appendChild(lineElement);
    ctx.root.appendChild(lineLayer);
    // The source item scrolls with the panel.
    ctx.root.addEventListener("scroll", scheduleLineUpdate, { capture: true, signal: ctx.signal });
  }

  function updateLinePosition() {
    lineFrame = 0;
    if (!activeConnection || !lineLayer || !lineElement) return;
    const points = getConnectionPoints();
    if (!points) {
      lineLayer.classList.remove("active");
      return;
    }
    lineLayer.setAttribute("viewBox", `0 0 ${points.viewportWidth} ${points.viewportHeight}`);
    setLinePoints(points.sourceX, points.sourceY, points.targetX, points.targetY);
    lineLayer.classList.add("active");
  }

  function scheduleLineUpdate() {
    if (!activeConnection || lineFrame || lineAnimationFrame) return;
    lineFrame = ctx.timers.requestAnimationFrame(updateLinePosition);
  }

  function clear() {
    pendingHighlightToken += 1;
    ctx.timers.clearTimeout(temporaryHighlightTimeout);
    temporaryHighlightTimeout = 0;
    if (!activeFilterHighlight) return;
    const element = activeFilterHighlight.record && activeFilterHighlight.record.element;
    if (element) element.classList.remove("help-highlight");
    stopLineAnimation();
    activeConnection = null;
    if (lineLayer) lineLayer.classList.remove("active");
    activeFilterHighlight = null;
  }

  function highlightHelpAnnotation(record, sourceEl = null) {
    clear();
    if (!record || !record.element) return;
    record.element.classList.add("help-highlight");
    if (sourceEl) {
      ensureLineLayer();
      activeConnection = { sourceEl, targetEl: record.element };
      animateLineToTarget(200);
    }
    activeFilterHighlight = { type: "help", record };
  }

  function highlightTemporarily(record, sourceEl = null, durationMs = 1000) {
    if (!record || !record.element) return;
    ctx.timers.clearTimeout(temporaryHighlightTimeout);
    highlightHelpAnnotation(record, sourceEl);
    temporaryHighlightTimeout = ctx.timers.setTimeout(() => {
      temporaryHighlightTimeout = 0;
      if (activeFilterHighlight && activeFilterHighlight.record === record) clear();
    }, Math.max(100, Number(durationMs) || 1000));
  }

  function bindResultHighlight(item, record, signal) {
    const onEnter = () => {
      const token = ++pendingHighlightToken;
      ctx.services.camera.centerHelpRecordInView(record, 250, () => {
        if (token !== pendingHighlightToken) return;
        highlightHelpAnnotation(record, item);
      });
    };
    item.addEventListener("mouseenter", onEnter, { signal });
    item.addEventListener("focus", onEnter, { signal });
    item.addEventListener("mouseleave", clear, { signal });
    item.addEventListener("blur", clear, { signal });
  }

  return {
    clear,
    highlightHelpAnnotation,
    highlightTemporarily,
    bindResultHighlight,
    refreshConnectionPosition: scheduleLineUpdate,
  };
}
