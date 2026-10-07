// Help tooltips. Desktop tooltips live in the tooltip layer; the mobile
// sheet is moved to the container root.
import { excludingExampleMarkers } from "../core/help";
import { childSignal, getScale } from "../dom/context.js";

export const MOBILE_MAX_WIDTH = 768;
// Popups opened from the state (view.tooltip) fade in and out.
export const STATE_TOOLTIP_FADE_MS = 200;
// Space between a tooltip and the edges of the diagram, both sides.
const EDGE_MARGIN = 10;
const FADE_CLASS = "dwk-tooltip-fade";
const SIMPLE_CLASS = "dwk-tooltip-simple";
const SIZED_PROPS = ["width", "max-width", "--dwk-tooltip-scale"];
const SVG_NS = "http://www.w3.org/2000/svg";
const CONNECTOR_DOT_RADIUS = 4;
const MOBILE_UA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
const CANDIDATES = excludingExampleMarkers("rect,circle,ellipse,path,polygon,polyline,line,text,foreignObject,use,image");

/** @param {import("../dom/context").Context & Record<string, any>} ctx */
export function createTooltip(ctx) {
  let currentMobileTooltip = null;
  let mobileTooltipOriginalParent = null;
  let mobileTooltipNextSibling = null;
  let outsideController = null;
  // A desktop tooltip kept open after a click in it, until a click outside
  // it, Escape, or another tooltip.
  let heldTooltip = null;
  let heldController = null;
  let heldOnRelease = null;
  const fadeOutTimers = new WeakMap();
  const connector = createConnector();
  // The CSS sizes popups with the same margin (tooltip.css).
  ctx.els.tooltipLayer.style.setProperty("--dwk-tooltip-edge", `${EDGE_MARGIN}px`);

  function rootWidth() {
    return ctx.root.clientWidth;
  }

  function isMobileDevice() {
    return MOBILE_UA.test(ctx.win.navigator.userAgent) || rootWidth() <= MOBILE_MAX_WIDTH || "ontouchstart" in ctx.win;
  }

  function handleMobileTooltipOutsideClick(event) {
    if (currentMobileTooltip && !currentMobileTooltip.contains(event.target)) hideMobile();
  }

  function showMobile(tooltip, content, anchorPoint = null) {
    hideMobile();
    const temp = ctx.doc.createElement("div");
    temp.innerHTML = content || "";
    temp.querySelectorAll(".mobile-close-btn").forEach((button) => button.remove());
    const sanitizedContent = temp.innerHTML;
    const isSmallScreen = rootWidth() <= MOBILE_MAX_WIDTH;

    if (isSmallScreen && tooltip.parentElement !== ctx.root) {
      mobileTooltipOriginalParent = tooltip.parentElement;
      mobileTooltipNextSibling = tooltip.nextSibling;
      ctx.root.appendChild(tooltip);
    }

    tooltip.classList.add("mobile-tooltip");
    ctx.root.classList.add("mobile-tooltip-open");
    tooltip.innerHTML = sanitizedContent;
    tooltip.style.display = "block";

    if (!isSmallScreen && anchorPoint) {
      const margin = 10;
      const gap = 12;
      const view = ctx.root.getBoundingClientRect();
      const scale = getScale(ctx.root);
      const viewportWidth = ctx.root.clientWidth;
      const viewportHeight = ctx.root.clientHeight;
      const anchor = { x: (anchorPoint.x - view.left) / scale, y: (anchorPoint.y - view.top) / scale };
      Object.assign(tooltip.style, {
        position: "fixed",
        transform: "none",
        width: "min(420px, 86cqw)",
        maxWidth: "86cqw",
        minWidth: "260px",
        maxHeight: "70cqh",
        overflowY: "auto",
        left: `${margin}px`,
        top: `${margin}px`,
      });
      ctx.timers.requestAnimationFrame(() => {
        const tipWidth = tooltip.offsetWidth;
        const tipHeight = tooltip.offsetHeight;
        let x = anchor.x + gap;
        if (x + tipWidth > viewportWidth - margin) {
          const leftCandidate = anchor.x - gap - tipWidth;
          x = leftCandidate >= margin ? leftCandidate : Math.max(margin, viewportWidth - tipWidth - margin);
        }
        let y = anchor.y + gap;
        if (y + tipHeight > viewportHeight - margin) {
          const topCandidate = anchor.y - gap - tipHeight;
          y = topCandidate >= margin ? topCandidate : Math.max(margin, viewportHeight - tipHeight - margin);
        }
        tooltip.style.left = `${Math.round(x)}px`;
        tooltip.style.top = `${Math.round(y)}px`;
      });
    }

    currentMobileTooltip = tooltip;
    ctx.timers.setTimeout(() => {
      if (currentMobileTooltip !== tooltip) return;
      outsideController = childSignal(ctx.signal);
      const options = { capture: true, signal: outsideController.signal };
      ctx.root.addEventListener("touchstart", handleMobileTooltipOutsideClick, options);
      ctx.root.addEventListener("click", handleMobileTooltipOutsideClick, options);
    }, 100);
  }

  function hideMobile() {
    if (currentMobileTooltip) {
      const tooltip = currentMobileTooltip;
      tooltip.style.display = "none";
      tooltip.classList.remove("mobile-tooltip");
      ["position", "transform", "width", "max-width", "min-width", "max-height", "overflow-y", "left", "top"].forEach((name) =>
        tooltip.style.removeProperty(name),
      );
      if (mobileTooltipOriginalParent) {
        if (mobileTooltipNextSibling && mobileTooltipNextSibling.parentNode === mobileTooltipOriginalParent) {
          mobileTooltipOriginalParent.insertBefore(tooltip, mobileTooltipNextSibling);
        } else {
          mobileTooltipOriginalParent.appendChild(tooltip);
        }
      }
      mobileTooltipOriginalParent = null;
      mobileTooltipNextSibling = null;
      currentMobileTooltip = null;
    }
    ctx.root.classList.remove("mobile-tooltip-open");
    if (outsideController) outsideController.abort();
    outsideController = null;
  }

  // Client px.
  function getTooltipHorizontalBounds(margin = 10) {
    const view = ctx.root.getBoundingClientRect();
    const minX = view.left + margin;
    let maxX = view.right - margin;
    const panel = ctx.s.filterPanelOpen ? ctx.maybeEl("filter-panel") : null;
    if (panel) {
      const panelRect = panel.getBoundingClientRect();
      if (panelRect.width > 0 && panelRect.left < view.right) maxX = Math.min(maxX, panelRect.left - margin);
    }
    if (maxX <= minX + 80) maxX = view.right - margin;
    return { minX, maxX };
  }

  // Places a tooltip-layer tooltip near a client point. It is centred on its
  // left edge by transform: translate(-50%, 0).
  function positionNearPoint(tooltip, pointX, pointY, margin = EDGE_MARGIN) {
    const scale = getScale(ctx.els.tooltipLayer);
    const tipWidth = tooltip.offsetWidth * scale;
    const tipHeight = tooltip.offsetHeight * scale;
    const view = ctx.root.getBoundingClientRect();
    const horizontalBounds = getTooltipHorizontalBounds(margin);
    const gap = 14;

    let left = pointX + gap;
    if (left + tipWidth > horizontalBounds.maxX) {
      const leftCandidate = pointX - gap - tipWidth;
      left = leftCandidate >= horizontalBounds.minX ? leftCandidate : Math.max(horizontalBounds.minX, horizontalBounds.maxX - tipWidth);
    }
    let top = pointY + gap;
    if (top + tipHeight > view.bottom - margin) {
      const topCandidate = pointY - gap - tipHeight;
      top = topCandidate >= view.top + margin ? topCandidate : Math.max(view.top + margin, view.bottom - tipHeight - margin);
    }

    const layerRect = ctx.els.tooltipLayer.getBoundingClientRect();
    tooltip.style.left = `${Math.round((left + tipWidth / 2 - layerRect.left) / scale)}px`;
    tooltip.style.top = `${Math.round((top - layerRect.top) / scale)}px`;
  }

  function getElementRect(element) {
    const svgRect = ctx.services.camera.getRectFromSvgGraphicsElement(element);
    if (svgRect) return svgRect;
    if (!element || typeof element.getBoundingClientRect !== "function") return null;
    const rect = element.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return rect;
  }

  function resolveElementAnchorPoint(targetEl) {
    const view = ctx.root.getBoundingClientRect();
    const viewportArea = view.width * view.height;
    const candidates = [targetEl, ...Array.from(targetEl.querySelectorAll(CANDIDATES))];
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    candidates.forEach((candidate) => {
      const rect = getElementRect(candidate);
      if (!rect) return;
      const area = rect.width * rect.height;
      if (!Number.isFinite(area) || area <= 1 || area > viewportArea * 0.75) return;
      const score = Math.sqrt(area);
      if (score < bestScore) {
        bestScore = score;
        best = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
    });
    if (best) return best;
    const fallback = getElementRect(targetEl);
    if (fallback) return { x: fallback.left + fallback.width / 2, y: fallback.top + fallback.height / 2 };
    return { x: view.left + view.width / 2, y: view.top + view.height / 2 };
  }

  function showForSvgElement(tooltip, targetEl, hoverEvent = null) {
    if (heldTooltip && heldTooltip !== tooltip) release();
    tooltip.style.display = shownDisplay(tooltip);
    tooltip.style.minWidth = `${ctx.config.ui.tooltipMinWidth}px`;
    ctx.timers.requestAnimationFrame(() => {
      const point =
        hoverEvent && Number.isFinite(hoverEvent.clientX) && Number.isFinite(hoverEvent.clientY)
          ? { x: hoverEvent.clientX, y: hoverEvent.clientY }
          : resolveElementAnchorPoint(targetEl);
      positionNearPoint(tooltip, point.x, point.y);
    });
  }

  // onRelease: once, when the tooltip closes for any reason.
  function hold(tooltip, onRelease = null) {
    if (heldTooltip === tooltip) {
      if (onRelease) heldOnRelease = onRelease;
      return;
    }
    release();
    heldTooltip = tooltip;
    heldOnRelease = onRelease;
    heldController = childSignal(ctx.signal);
    const options = { capture: true, signal: heldController.signal };
    ctx.root.addEventListener(
      "pointerdown",
      (event) => {
        if (!tooltip.contains(/** @type {Node} */ (event.target))) release();
      },
      options,
    );
    tooltip.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") release();
      },
      { signal: heldController.signal },
    );
  }

  function release() {
    if (!heldTooltip) return;
    connector.hide();
    const onRelease = heldOnRelease;
    hide(heldTooltip);
    heldTooltip = null;
    heldOnRelease = null;
    heldController.abort();
    heldController = null;
    if (onRelease) onRelease();
  }

  // With examples: a column (tooltip.css) whose content scrolls when the
  // popup is as tall as the diagram allows.
  function shownDisplay(tooltip) {
    return tooltip.classList.contains("dwk-has-examples") ? "flex" : "block";
  }

  // After the popup grew (another tab): it stays where it is, unless its
  // bottom left the diagram; then it moves up just enough.
  function keepInView(tooltip, margin = EDGE_MARGIN) {
    if (tooltip.style.display === "none") return;
    const scale = getScale(ctx.els.tooltipLayer);
    const box = tooltip.getBoundingClientRect();
    const view = ctx.root.getBoundingClientRect();
    if (box.bottom <= view.bottom - margin) return;
    const top = Math.max(view.top + margin, view.bottom - margin - box.height);
    const layerRect = ctx.els.tooltipLayer.getBoundingClientRect();
    tooltip.style.top = `${Math.round((top - layerRect.top) / scale)}px`;
  }

  // center/top/bottom of the diagram, centred across (translate(-50%, 0)).
  function positionInView(tooltip, position, margin = EDGE_MARGIN) {
    const scale = getScale(ctx.els.tooltipLayer);
    const tipHeight = tooltip.offsetHeight * scale;
    const view = ctx.root.getBoundingClientRect();
    const bounds = getTooltipHorizontalBounds(margin);
    const room = view.height - 2 * margin;
    const top =
      position === "top"
        ? view.top + margin
        : position === "bottom"
          ? view.bottom - margin - tipHeight
          : view.top + margin + Math.max(0, (room - tipHeight) / 2);
    const layerRect = ctx.els.tooltipLayer.getBoundingClientRect();
    tooltip.style.left = `${Math.round(((bounds.minX + bounds.maxX) / 2 - layerRect.left) / scale)}px`;
    tooltip.style.top = `${Math.round((Math.max(view.top + margin, top) - layerRect.top) / scale)}px`;
  }

  // A thin line from a popup placed away from its cell to that cell: drawn
  // under the popups, faded with them, and following the camera (the target
  // is kept in diagram coordinates, so a hidden cell needs no layout).
  function createConnector() {
    let layer = null;
    let halo = null;
    let line = null;
    let dot = null;
    let state = null;
    let frame = 0;
    let lastPoints = "";

    function ensureLayer() {
      if (layer) return;
      layer = ctx.doc.createElementNS(SVG_NS, "svg");
      layer.setAttribute("class", "dwk-tooltip-connector");
      layer.setAttribute("aria-hidden", "true");
      layer.style.setProperty("--dwk-tooltip-fade", `${STATE_TOOLTIP_FADE_MS}ms`);
      halo = ctx.doc.createElementNS(SVG_NS, "line");
      halo.setAttribute("class", "dwk-tooltip-connector-halo");
      line = ctx.doc.createElementNS(SVG_NS, "line");
      line.setAttribute("class", "dwk-tooltip-connector-line");
      dot = ctx.doc.createElementNS(SVG_NS, "circle");
      dot.setAttribute("class", "dwk-tooltip-connector-dot");
      dot.setAttribute("r", `${CONNECTOR_DOT_RADIUS}`);
      layer.append(halo, line, dot);
      ctx.els.tooltipLayer.prepend(layer);
    }

    function diagramSvg() {
      return /** @type {SVGSVGElement | null} */ (ctx.els.image.querySelector(":scope > svg"));
    }

    // Where the line from the popup's centre to the target leaves the popup.
    function edgePoint(box, target) {
      const cx = (box.left + box.right) / 2;
      const cy = (box.top + box.bottom) / 2;
      const dx = target.x - cx;
      const dy = target.y - cy;
      const t = Math.min(Math.abs(box.width / 2 / (dx || 1e-9)), Math.abs(box.height / 2 / (dy || 1e-9)));
      return { x: cx + dx * t, y: cy + dy * t };
    }

    function draw() {
      frame = 0;
      if (!state) return;
      const svg = diagramSvg();
      const ctm = svg && svg.getScreenCTM();
      if (!ctm || state.tooltip.style.display === "none") return;
      const target = state.point.matrixTransform(ctm);
      const box = state.tooltip.getBoundingClientRect();
      const inside = target.x >= box.left && target.x <= box.right && target.y >= box.top && target.y <= box.bottom;
      const start = edgePoint(box, target);
      const scale = getScale(ctx.els.tooltipLayer);
      const layerRect = ctx.els.tooltipLayer.getBoundingClientRect();
      const local = (point) => [(point.x - layerRect.left) / scale, (point.y - layerRect.top) / scale].map((value) => Math.round(value * 10) / 10);
      const [x1, y1] = local(start);
      const [x2, y2] = local(target);
      const points = inside ? "" : `${x1},${y1},${x2},${y2}`;
      if (points !== lastPoints) {
        lastPoints = points;
        layer.classList.toggle("is-covered", inside);
        [halo, line].forEach((element) => {
          element.setAttribute("x1", `${x1}`);
          element.setAttribute("y1", `${y1}`);
          element.setAttribute("x2", `${x2}`);
          element.setAttribute("y2", `${y2}`);
        });
        dot.setAttribute("cx", `${x2}`);
        dot.setAttribute("cy", `${y2}`);
      }
      frame = ctx.timers.requestAnimationFrame(draw);
    }

    function show(tooltip, clientPoint) {
      const svg = diagramSvg();
      const ctm = svg && svg.getScreenCTM();
      if (!ctm) return;
      ensureLayer();
      state = { tooltip, point: new DOMPoint(clientPoint.x, clientPoint.y).matrixTransform(ctm.inverse()) };
      lastPoints = null;
      ctx.timers.cancelAnimationFrame(frame);
      frame = ctx.timers.requestAnimationFrame(() => {
        draw();
        layer.classList.add("is-shown");
      });
    }

    function hide() {
      state = null;
      ctx.timers.cancelAnimationFrame(frame);
      frame = 0;
      if (layer) layer.classList.remove("is-shown");
    }

    return { show, hide };
  }

  // A popup from the state: faded in at a client point (position anchor) or
  // placed in the view, simple or full. width: share of the width inside the
  // margins; scale: text size (1 = hover popup); connect: draw a line from a
  // popup placed away from its cell to the point.
  function showFaded(tooltip, point, { simple = false, width = undefined, scale = 1, position = "anchor", connect = true } = {}) {
    ctx.timers.clearTimeout(fadeOutTimers.get(tooltip));
    tooltip.style.removeProperty("opacity");
    tooltip.style.setProperty("--dwk-tooltip-fade", `${STATE_TOOLTIP_FADE_MS}ms`);
    tooltip.style.setProperty("--dwk-tooltip-scale", `${scale}`);
    tooltip.classList.add(FADE_CLASS);
    tooltip.classList.toggle(SIMPLE_CLASS, simple);
    if (width !== undefined) {
      tooltip.style.width = `calc((100cqw - ${2 * EDGE_MARGIN}px) * ${width})`;
      tooltip.style.maxWidth = "none";
      tooltip.style.removeProperty("min-width");
    } else {
      tooltip.style.removeProperty("width");
      tooltip.style.removeProperty("max-width");
      if (simple) tooltip.style.removeProperty("min-width");
      else tooltip.style.minWidth = `${ctx.config.ui.tooltipMinWidth}px`;
    }
    // A column (tooltip.css): the title stays, the content scrolls when the
    // popup is as tall as the diagram allows.
    tooltip.style.display = "flex";
    ctx.timers.requestAnimationFrame(() => {
      if (position === "anchor") positionNearPoint(tooltip, point.x, point.y);
      else positionInView(tooltip, position);
    });
    if (position !== "anchor" && connect) connector.show(tooltip, point);
    else connector.hide();
  }

  function hide(tooltip) {
    if (!tooltip.classList.contains(FADE_CLASS)) {
      tooltip.style.display = "none";
      return;
    }
    tooltip.style.opacity = "0";
    fadeOutTimers.set(
      tooltip,
      ctx.timers.setTimeout(() => {
        tooltip.style.display = "none";
        tooltip.style.removeProperty("opacity");
        SIZED_PROPS.forEach((name) => tooltip.style.removeProperty(name));
        tooltip.classList.remove(FADE_CLASS, SIMPLE_CLASS);
      }, STATE_TOOLTIP_FADE_MS),
    );
  }

  function showAtPointer(tooltip, _ann, pointerEvent) {
    if (!pointerEvent) return;
    const x = pointerEvent.clientX;
    const y = pointerEvent.clientY;
    tooltip.style.display = "block";
    tooltip.style.minWidth = `${ctx.config.ui.tooltipMinWidth}px`;
    ctx.timers.requestAnimationFrame(() => positionNearPoint(tooltip, x, y));
  }

  function showForUserAnnotation(tooltip, ann) {
    if (!ann._el) return;
    const rect = ann._el.getBoundingClientRect();
    showAtPointer(tooltip, ann, { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
  }

  function hideAll() {
    release();
    hideMobile();
    ctx.root.querySelectorAll(".tooltip-box").forEach((tooltip) => {
      /** @type {HTMLElement} */ (tooltip).style.display = "none";
    });
  }

  return {
    isMobileDevice,
    showMobile,
    hideMobile,
    hideAll,
    getHorizontalBounds: getTooltipHorizontalBounds,
    positionNearPoint,
    showForSvgElement,
    showForUserAnnotation,
    showAtPointer,
    hold,
    release,
    keepInView,
    showFaded,
    anchorPoint: resolveElementAnchorPoint,
    isHeld: (tooltip) => heldTooltip === tooltip,
    getCurrentMobileTooltip: () => currentMobileTooltip,
  };
}
