// Help tooltips. Desktop tooltips live in the tooltip layer; the mobile
// sheet is moved to the container root.
import { childSignal, getScale } from "../dom/context.js";

export const MOBILE_MAX_WIDTH = 768;
const MOBILE_UA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
const CANDIDATES = "rect,circle,ellipse,path,polygon,polyline,line,text,foreignObject,use,image";

/** @param {import("../dom/context").Context & Record<string, any>} ctx */
export function createTooltip(ctx) {
  let currentMobileTooltip = null;
  let mobileTooltipOriginalParent = null;
  let mobileTooltipNextSibling = null;
  let outsideController = null;

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
  function positionNearPoint(tooltip, pointX, pointY, margin = 10) {
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
    tooltip.style.display = "block";
    tooltip.style.minWidth = `${ctx.config.ui.tooltipMinWidth}px`;
    ctx.timers.requestAnimationFrame(() => {
      if (hoverEvent && Number.isFinite(hoverEvent.clientX) && Number.isFinite(hoverEvent.clientY)) {
        positionNearPoint(tooltip, hoverEvent.clientX, hoverEvent.clientY);
        return;
      }
      const point = resolveElementAnchorPoint(targetEl);
      positionNearPoint(tooltip, point.x, point.y);
    });
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
    getCurrentMobileTooltip: () => currentMobileTooltip,
  };
}
