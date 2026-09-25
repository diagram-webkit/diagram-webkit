// Help records from [data-help], their
// tooltips and pin button, visibility per element, and debug slug checks.
import { escapeHTML, HELP_HTML_WHITELIST, sanitizeUserHtml } from "../core/html";
import { applyCssTagClasses, applySeverityStyleToElement } from "./tag-style.js";

export const VISIBILITY_FADE_MS = 120;

/** @param {import("./context").Context & Record<string, any>} ctx */
export function createHelpIndex(ctx) {
  const s = ctx.s;
  const model = ctx.model;
  const texts = ctx.texts;
  const attrs = ctx.config.metadata;
  const parseHelp = ctx.config.parseHelp;
  let renderController = null;

  function getElementSlug(targetEl) {
    return `${targetEl.getAttribute(attrs.slugAttr) || ""}`.trim();
  }

  function isSlugPinned(slug) {
    return s.pinnedHelpSlugs.has(`${slug || ""}`.trim());
  }

  function pinLabel(pinned) {
    return `📌 ${pinned ? texts.unpin : texts.pin}`;
  }

  function updateTooltipPinButtonState(record, pinned) {
    if (!record || !record.tooltip) return;
    const pinBtn = record.tooltip.querySelector('[data-role="tooltip-pin"]');
    if (!pinBtn) return;
    pinBtn.classList.toggle("is-pinned", pinned);
    pinBtn.setAttribute("aria-pressed", pinned ? "true" : "false");
    pinBtn.setAttribute("title", pinned ? texts.unpin : texts.pin);
    pinBtn.textContent = pinLabel(pinned);
  }

  function applyPinnedVisualState(record) {
    const targetEl = record.element;
    const slug = getElementSlug(targetEl);
    const pinned = slug ? isSlugPinned(slug) : false;
    targetEl.classList.toggle("svg-help-pinned", pinned);
    targetEl.setAttribute("data-pinned", pinned ? "true" : "false");
    updateTooltipPinButtonState(record, pinned);
  }

  function refreshPinnedStates() {
    s.svgHelpRecords.forEach(applyPinnedVisualState);
  }

  function runDebugSlugValidation(annotationElements) {
    if (!s.debug) return;
    const errors = [];
    const slugToElements = new Map();
    annotationElements.forEach((targetEl, index) => {
      const slug = getElementSlug(targetEl);
      const elementId = targetEl.getAttribute("id") || "(no id)";
      const title = (targetEl.getAttribute(attrs.helpAttr) || "").split("\n")[0].trim() || "(no title)";
      if (!slug) {
        errors.push({ type: "missing-data-slug", id: elementId, title, index });
        return;
      }
      if (!slugToElements.has(slug)) slugToElements.set(slug, []);
      slugToElements.get(slug).push({ id: elementId, title, index });
    });
    slugToElements.forEach((entries, slug) => {
      if (entries.length > 1) errors.push({ type: "duplicate-data-slug", slug, entries });
    });
    if (errors.length > 0) {
      console.groupCollapsed(`[DEBUG] data-slug validation failed (${errors.length} issues)`);
      console.error(`All [${attrs.helpAttr}] elements must have non-empty unique ${attrs.slugAttr}.`);
      errors.forEach((issue, i) => console.error(`${i + 1}.`, issue));
      console.groupEnd();
    }
  }

  function buildTooltip(record) {
    const tooltip = ctx.doc.createElement("div");
    const tagsHtml = model.buildTagBadgesHtml(record.tags, ctx.config.tagLabel);
    const footerParts = [];
    if (tagsHtml) footerParts.push(`<div class="tooltip-tag-wrap">${tagsHtml}</div>`);
    if (record.slug) {
      footerParts.push(
        `<button type="button" class="tooltip-pin-btn" data-role="tooltip-pin" aria-pressed="false" title="${escapeHTML(texts.pin)}">${escapeHTML(pinLabel(false))}</button>`,
      );
    }
    const footerHtml = footerParts.length ? `<div class="tooltip-actions">${footerParts.join("")}</div>` : "";
    tooltip.className = `tooltip-box svg-property-tooltip ${model.getSeverityClassForTags(record.tags)}`;
    tooltip.innerHTML = `<div class="tooltip-head"><b>${escapeHTML(record.title)}</b></div><div class="tooltip-content">${record.bodyHtml || ""}</div>${footerHtml}`;
    applySeverityStyleToElement(model, tooltip, record.tags);
    tooltip.style.display = "none";
    tooltip.style.whiteSpace = "pre-wrap";
    const badges = tooltip.querySelector(".annotation-tag-badges");
    if (badges) badges.classList.add("tooltip-tag-badges");
    return tooltip;
  }

  function bindTooltip(record, signal) {
    const { element: targetEl, tooltip } = record;
    const tooltipService = ctx.services.tooltip;
    const hideDelay = ctx.config.ui.tooltipHideDelay;
    let hideTimeout = 0;

    targetEl.addEventListener(
      "mouseenter",
      (event) => {
        if (s.editModeEnabled) return;
        ctx.timers.clearTimeout(hideTimeout);
        tooltipService.showForSvgElement(tooltip, targetEl, event);
        ctx.emit("elementactivate", { element: targetEl, slug: record.slug, id: ctx.cellId(targetEl) });
      },
      { signal },
    );
    const scheduleHide = () => {
      hideTimeout = ctx.timers.setTimeout(() => {
        tooltip.style.display = "none";
      }, hideDelay);
    };
    targetEl.addEventListener("mouseleave", scheduleHide, { signal });
    targetEl.addEventListener(
      "touchstart",
      (event) => {
        if (s.editModeEnabled) return;
        if (event.cancelable) event.preventDefault();
        ctx.timers.clearTimeout(hideTimeout);
        if (tooltipService.isMobileDevice()) {
          const touch = event.touches && event.touches[0];
          tooltipService.showMobile(tooltip, tooltip.innerHTML, touch ? { x: touch.clientX, y: touch.clientY } : null);
        } else {
          tooltipService.showForSvgElement(tooltip, targetEl);
        }
        ctx.emit("elementactivate", { element: targetEl, slug: record.slug, id: ctx.cellId(targetEl) });
      },
      { passive: false, signal },
    );
    tooltip.addEventListener("mouseenter", () => ctx.timers.clearTimeout(hideTimeout), { signal });
    const onPin = (event) => {
      const target = event.target instanceof ctx.win.Element ? event.target : null;
      const pinBtn = target ? target.closest('[data-role="tooltip-pin"]') : null;
      if (!pinBtn) return;
      event.preventDefault();
      event.stopPropagation();
      const slug = getElementSlug(targetEl);
      if (!slug) return;
      ctx.services.pins.togglePinnedHelpSlug(slug);
      applyPinnedVisualState(record);
      ctx.services.filter.applyAnnotationFilter();
    };
    tooltip.addEventListener("click", onPin, { signal });
    tooltip.addEventListener("touchend", onPin, { passive: false, signal });
    tooltip.addEventListener("mouseleave", scheduleHide, { signal });
  }

  function initializeSvgPropertyAnnotations() {
    if (renderController) renderController.abort();
    renderController = new AbortController();
    const signal = AbortSignal.any([ctx.signal, renderController.signal]);
    ctx.els.tooltipLayer.querySelectorAll(".svg-property-tooltip").forEach((tip) => tip.remove());

    const records = [];
    const recordByElement = new Map();
    const annotationElements = Array.from(ctx.els.image.querySelectorAll(`[${attrs.helpAttr}]`));
    runDebugSlugValidation(annotationElements);

    annotationElements.forEach((targetEl) => {
      const parsedHelp = parseHelp(targetEl.getAttribute(attrs.helpAttr));
      if (!parsedHelp) return;
      const tags = model.parseTags(targetEl.getAttribute(attrs.tagsAttr));
      applyCssTagClasses(model, targetEl, tags);

      const record = {
        element: targetEl,
        tooltip: null,
        title: parsedHelp.title,
        // A diagram from outside the definition may carry any HTML here.
        bodyHtml: s.source && s.source.untrusted ? sanitizeUserHtml(parsedHelp.bodyHtml, ctx.parseHtml, HELP_HTML_WHITELIST) : parsedHelp.bodyHtml,
        searchText: parsedHelp.searchText,
        searchMatch: false,
        tags,
        slug: getElementSlug(targetEl),
      };
      if (ctx.features.tooltips) {
        record.tooltip = buildTooltip(record);
        ctx.els.tooltipLayer.appendChild(record.tooltip);
      }

      targetEl.style.cursor = "pointer";
      targetEl.style.opacity = "0";
      targetEl.style.display = "none";
      records.push(record);
      recordByElement.set(targetEl, record);
      applyPinnedVisualState(record);
      if (record.tooltip) bindTooltip(record, signal);
    });

    s.svgHelpRecords = records;
    s.svgHelpRecordByElement = recordByElement;
  }

  function hideTooltip(element) {
    const record = s.svgHelpRecordByElement.get(element);
    if (record && record.tooltip) record.tooltip.style.display = "none";
  }

  function updateSvgElementVisibility(element) {
    const tags = model.parseTags(element.getAttribute(attrs.tagsAttr));
    const slug = getElementSlug(element);
    const pinned = slug ? isSlugPinned(slug) : false;
    const visibleByAllTags = model.isTagSetVisible(tags, s.tagVisibility);
    const hiddenByDisabledGroup = model.isTagSetDisabledByHiddenGroup(tags, s.tagVisibility);
    const hiddenByLevel = !model.isTagSetWithinSelectedLevel(tags, s.selectedLevel);
    const visibleByTags = hiddenByDisabledGroup || hiddenByLevel ? false : pinned || visibleByAllTags;
    const helpRecord = s.svgHelpRecordByElement.get(element);
    const visibleBySearch = pinned ? true : helpRecord ? helpRecord.searchMatch !== false : true;
    const shouldShow = visibleByTags && visibleBySearch;

    if (!element._dwkVisibilityInitialized || s.instantVisibility) {
      element._dwkVisibilityInitialized = true;
      ctx.timers.clearTimeout(element._dwkVisibilityFadeTimeout);
      // Shown cells carry no inline opacity, so the dim rule applies to them.
      if (shouldShow) {
        element.style.removeProperty("display");
        element.style.removeProperty("opacity");
      } else {
        element.style.opacity = "0";
        element.style.display = "none";
        hideTooltip(element);
      }
      return;
    }

    const phases = ctx.services.phases;
    if (phases.active()) {
      // Hidden or on its way out: shown again in the in-phase.
      const hidden = element.style.display === "none" || element.style.opacity === "0";
      if (shouldShow) {
        if (hidden) phases.showLater(element);
        return;
      }
      phases.cancelShow(element);
      if (hidden) return;
      fadeOut(element);
      phases.outgoing();
      return;
    }

    ctx.timers.clearTimeout(element._dwkVisibilityFadeTimeout);
    element._dwkVisibilityFadeTimeout = 0;

    // Cells already on screen are left alone; the fade-in from display:none
    // comes from @starting-style in runtime.css.
    if (shouldShow) {
      element.style.removeProperty("display");
      element.style.removeProperty("opacity");
      return;
    }
    fadeOut(element);
  }

  function fadeOut(element) {
    ctx.timers.clearTimeout(element._dwkVisibilityFadeTimeout);
    element.style.opacity = "0";
    element._dwkVisibilityFadeTimeout = ctx.timers.setTimeout(() => {
      element.style.display = "none";
      element._dwkVisibilityFadeTimeout = 0;
      hideTooltip(element);
    }, s.fadeMs);
  }

  return {
    initializeSvgPropertyAnnotations,
    updateSvgElementVisibility,
    refreshPinnedStates,
    applyPinnedVisualState,
    getElementSlug,
  };
}
