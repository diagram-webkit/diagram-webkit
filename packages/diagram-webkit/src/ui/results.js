// Search results in the panel: rendering, the pinned section, hidden reasons,
// go-to and the keyboard cursor. dom/filter.js applies the filter.
import { escapeHTML } from "../core/html";
import { getFilterResultSummary, helpMatchesSearch } from "../core/help";
import { formatText } from "../core/texts";
import { applySeverityStyleToElement } from "../dom/tag-style.js";

const TOUCH_TAP_MOVE_THRESHOLD_PX = 14;
const TOUCH_CLICK_SUPPRESS_MS = 700;
const MOBILE_MAX_WIDTH = 768;

export function createResults(ctx) {
  const s = ctx.s;
  const sv = ctx.services;
  const model = ctx.model;
  const texts = ctx.texts;
  const list = ctx.el("filter-results");
  const summaryElement = ctx.el("filter-result-count");
  let pinnedSectionCollapsed = false;
  let lastTouchLikeActivationAt = 0;
  let renderController = null;
  const touchTapState = { active: false, pointerId: null, item: null, startX: 0, startY: 0, moved: false };
  // The entry last activated from the keyboard, marked aria-current. Tracked
  // by slug so it survives a re-render of the list.
  let keyboardCursorSlug = "";
  const records = new WeakMap();

  const recordSlug = (record) => `${record && record.slug ? record.slug : ""}`.trim();
  const isRecordPinned = (record) => sv.filter.isRecordPinned(record);

  function togglePinnedRecord(record) {
    const slug = recordSlug(record);
    if (!slug) return;
    sv.pins.togglePinnedHelpSlug(slug);
    sv.filter.applyAnnotationFilter();
  }

  function formatHiddenReason(options = {}) {
    const hiddenTags = Array.isArray(options.hiddenTags) ? options.hiddenTags.filter(Boolean) : [];
    const recordLevel = Number.isFinite(options.recordLevel) ? options.recordLevel : 0;
    const selectedLevel = Number.isFinite(options.selectedLevel) ? options.selectedLevel : 0;
    const quoted = hiddenTags.map((tag) => `"${tag}"`).join(", ");
    if (options.hiddenByLevel && hiddenTags.length > 0) return formatText(texts.hiddenTagsAndLevel, { tags: quoted, recordLevel, selectedLevel });
    if (options.hiddenByLevel) return formatText(texts.hiddenLevel, { recordLevel, selectedLevel });
    if (hiddenTags.length === 0) return texts.hiddenUnknownTags;
    if (hiddenTags.length === 1) return formatText(texts.hiddenTag, { tag: hiddenTags[0] });
    return formatText(texts.hiddenTags, { tags: quoted });
  }

  const isCompactMobileMode = () => ctx.root.clientWidth <= MOBILE_MAX_WIDTH;
  const hasHoverCapability = () => ctx.win.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const isInactive = (item) => !item || item.classList.contains("is-inactive") || item.getAttribute("aria-disabled") === "true";

  function itemFromTarget(target) {
    if (!target || typeof target.closest !== "function") return null;
    const item = target.closest(".filter-result-item");
    return item && list.contains(item) ? item : null;
  }

  const isPinTarget = (target) => Boolean(target && typeof target.closest === "function" && target.closest('[data-role="pin"]'));

  function resetTouchTapState() {
    Object.assign(touchTapState, { active: false, pointerId: null, item: null, startX: 0, startY: 0, moved: false });
  }

  function activateResultItem(item, options = {}) {
    if (!item || isInactive(item) || !s.filterPanelOpen) return;
    const record = records.get(item);
    if (!record) return;
    const fromKeyboard = Boolean(options.fromKeyboard);
    sv.highlightLine.clear();
    const active = ctx.doc.activeElement;
    if (!fromKeyboard && active && active !== ctx.doc.body && active.classList && active.classList.contains("filter-result-item")) {
      active.blur();
    }
    const isMobile = isCompactMobileMode();
    ctx.emit("elementactivate", { element: record.element, slug: record.slug, id: ctx.cellId(record.element) });
    sv.camera.goToHelpRecord(record, {
      // Activating with the keyboard keeps the panel open, so focus stays
      // somewhere the reader can carry on from.
      closePanel: isMobile && !fromKeyboard,
      preserveFitAll: Boolean(s.fitAllMode),
      onComplete: () => sv.highlightLine.highlightTemporarily(record, isMobile ? null : item, 1000),
    });
  }

  function markKeyboardCursor(item) {
    list.querySelectorAll('.filter-result-item[aria-current="true"]').forEach((element) => element.removeAttribute("aria-current"));
    if (item) item.setAttribute("aria-current", "true");
  }

  function bindInteractionHandlers() {
    const signal = ctx.signal;
    list.setAttribute("role", "list");
    list.setAttribute("aria-label", texts.resultsLabel);
    list.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
        const item = itemFromTarget(event.target);
        if (!item || isInactive(item) || isPinTarget(event.target)) return;
        event.preventDefault();
        keyboardCursorSlug = recordSlug(records.get(item));
        markKeyboardCursor(item);
        activateResultItem(item, { fromKeyboard: true });
      },
      { signal },
    );
    list.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType !== "touch" || !s.filterPanelOpen) return;
        const item = itemFromTarget(event.target);
        if (!item || isInactive(item) || isPinTarget(event.target)) {
          resetTouchTapState();
          return;
        }
        Object.assign(touchTapState, {
          active: true,
          pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
          item,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
        });
      },
      { signal },
    );
    const samePointer = (event) =>
      touchTapState.pointerId === null || !Number.isFinite(event.pointerId) || event.pointerId === touchTapState.pointerId;
    list.addEventListener(
      "pointermove",
      (event) => {
        if (!touchTapState.active || event.pointerType !== "touch" || !samePointer(event)) return;
        if (
          Math.abs(event.clientX - touchTapState.startX) > TOUCH_TAP_MOVE_THRESHOLD_PX ||
          Math.abs(event.clientY - touchTapState.startY) > TOUCH_TAP_MOVE_THRESHOLD_PX
        ) {
          touchTapState.moved = true;
        }
      },
      { signal },
    );
    list.addEventListener(
      "pointerup",
      (event) => {
        if (!touchTapState.active || event.pointerType !== "touch" || !samePointer(event)) return;
        const { item, moved } = touchTapState;
        const endedOnItem = itemFromTarget(event.target);
        resetTouchTapState();
        if (!item || moved || endedOnItem !== item) return;
        lastTouchLikeActivationAt = Date.now();
        activateResultItem(item);
      },
      { signal },
    );
    list.addEventListener("pointercancel", resetTouchTapState, { signal });
    list.addEventListener(
      "click",
      (event) => {
        const item = itemFromTarget(event.target);
        if (!item || isInactive(item) || !s.filterPanelOpen || isPinTarget(event.target)) return;
        if (Date.now() - lastTouchLikeActivationAt < TOUCH_CLICK_SUPPRESS_MS) return;
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        activateResultItem(item);
      },
      { signal },
    );
  }

  // The visible card is a title, rendered HTML, tag badges and a pin button.
  // A screen reader needs that condensed into one sentence per entry.
  function buildResultAriaLabel(record, options = {}) {
    const parts = [record.title || texts.resultFallbackTitle];
    const tags = model.getSortedVisibleTags(record.tags || []);
    if (tags.length > 0) parts.push(formatText(texts.ariaTags, { tags: tags.join(", ") }));
    const level = model.getTagLevel(record.tags || []);
    if (level > 0) parts.push(formatText(texts.ariaLevel, { level }));
    if (isRecordPinned(record)) parts.push(texts.ariaPinned);
    if (options.inactive) parts.push(options.hiddenReason || texts.currentlyHidden);
    return parts.join(" · ");
  }

  function createResultItem(record, signal, options = {}) {
    const inactive = Boolean(options.inactive);
    const hiddenReason = inactive ? formatHiddenReason(options) : "";
    const item = ctx.doc.createElement("div");
    item.className = "filter-result-item";
    records.set(item, record);
    // Every active entry is reachable by keyboard regardless of pointer type -
    // this list is the accessible surface for the diagram.
    item.tabIndex = inactive ? -1 : 0;
    item.setAttribute("role", inactive ? "note" : "button");
    item.setAttribute("aria-disabled", inactive ? "true" : "false");
    if (inactive) item.classList.add("is-inactive");

    const tags = record.tags || [];
    const tagsHtml = model.buildTagBadgesHtml(tags, ctx.config.tagLabel);
    item.classList.add(model.getSeverityClassForTags(tags));
    applySeverityStyleToElement(model, item, tags);

    const slug = recordSlug(record);
    const pinned = isRecordPinned(record);
    const pinTitle = pinned ? texts.unpin : texts.pin;
    const pinButtonHtml =
      slug.length > 0
        ? `<button type="button" class="result-pin-btn ${pinned ? "is-pinned" : ""}" data-role="pin" title="${escapeHTML(pinTitle)}" aria-label="${escapeHTML(pinTitle)}">📌 ${escapeHTML(pinTitle)}</button>`
        : "";
    const hiddenStateHtml = inactive ? `<div class="filter-result-state" role="note" aria-live="polite">${escapeHTML(hiddenReason)}</div>` : "";
    const tagsFooterHtml = tagsHtml ? `<div class="filter-result-tags">${tagsHtml}</div>` : "";
    const actionsRowHtml = tagsFooterHtml || pinButtonHtml ? `<div class="filter-result-actions-row">${tagsFooterHtml}${pinButtonHtml}</div>` : "";
    const actionsHtml = hiddenStateHtml || actionsRowHtml ? `<div class="filter-result-actions">${hiddenStateHtml}${actionsRowHtml}</div>` : "";
    item.innerHTML = `<div class="filter-result-head"><strong>${escapeHTML(record.title || texts.resultFallbackTitle)}</strong></div><div class="filter-result-content">${record.bodyHtml || escapeHTML(texts.resultFallbackBody)}</div>${actionsHtml}`;
    item.setAttribute("aria-label", buildResultAriaLabel(record, { inactive, hiddenReason }));
    if (slug === keyboardCursorSlug) item.setAttribute("aria-current", "true");
    if (!inactive && hasHoverCapability()) sv.highlightLine.bindResultHighlight(item, record, signal);

    const pinButton = item.querySelector('[data-role="pin"]');
    if (pinButton) {
      pinButton.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          togglePinnedRecord(record);
        },
        { signal },
      );
    }
    return item;
  }

  function button(className, text, onClick, signal) {
    const element = ctx.doc.createElement("button");
    element.type = "button";
    element.className = className;
    element.textContent = text;
    element.addEventListener("click", onClick, { signal });
    return element;
  }

  function renderPinnedSection(fragment, pinnedEntries, signal) {
    const section = ctx.doc.createElement("section");
    section.className = "pinned-results-section";
    const header = ctx.doc.createElement("div");
    header.className = "pinned-results-header";
    const title = ctx.doc.createElement("strong");
    title.textContent = formatText(texts.pinnedHeader, { count: pinnedEntries.length });
    const controls = ctx.doc.createElement("div");
    controls.className = "pinned-results-controls";

    const collapse = button("pinned-toggle-btn", pinnedSectionCollapsed ? texts.pinnedShow : texts.pinnedHide, () => {
      pinnedSectionCollapsed = !pinnedSectionCollapsed;
      sv.filter.applyAnnotationFilter();
    }, signal);
    const clear = button("pinned-toggle-btn", texts.pinnedClear, () => {
      s.pinnedHelpSlugs = new Set();
      sv.pins.onPinnedStateChanged();
      sv.filter.applyAnnotationFilter();
    }, signal);
    clear.disabled = pinnedEntries.length === 0;

    header.appendChild(title);
    controls.append(clear, collapse);
    header.appendChild(controls);
    section.appendChild(header);
    if (!pinnedSectionCollapsed) {
      const pinnedList = ctx.doc.createElement("div");
      pinnedList.className = "pinned-results-list";
      // Only these two are passed, so a pin hidden by level alone reads
      // "one or more required tags are filtered out". Kept on purpose.
      pinnedEntries.forEach((entry) =>
        pinnedList.appendChild(createResultItem(entry.record, signal, { inactive: entry.inactive, hiddenTags: entry.hiddenTags })),
      );
      section.appendChild(pinnedList);
    }
    fragment.appendChild(section);
  }

  function compareEntries(a, b) {
    const primaryA = model.getSortedVisibleTags(a.record.tags || [])[0] || "";
    const primaryB = model.getSortedVisibleTags(b.record.tags || [])[0] || "";
    if (primaryA && primaryB) {
      const comparison = model.compareTagsByFilterOrder(primaryA, primaryB);
      if (comparison !== 0) return comparison;
    } else if (primaryA || primaryB) {
      return primaryA ? -1 : 1;
    }
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  }

  function renderFilterResults(query) {
    if (renderController) renderController.abort();
    renderController = new AbortController();
    const signal = AbortSignal.any([ctx.signal, renderController.signal]);
    const fragment = ctx.doc.createDocumentFragment();
    const allHelp = s.svgHelpRecords;
    const matchingHelp = allHelp.filter((record) =>
      helpMatchesSearch(record, query) &&
      model.isTagSetVisible(record.tags, s.tagVisibility) &&
      model.isTagSetWithinSelectedLevel(record.tags, s.selectedLevel),
    );
    const sortedEntries = matchingHelp.map((record) => ({ title: record.title || "", record })).sort(compareEntries);

    const allEntriesBySlug = new Map();
    allHelp.forEach((record) => {
      const slug = recordSlug(record);
      if (slug && !allEntriesBySlug.has(slug)) allEntriesBySlug.set(slug, { title: record.title || "", record });
    });
    const pinnedEntries = Array.from(s.pinnedHelpSlugs)
      .map((slug) => allEntriesBySlug.get(`${slug || ""}`.trim()))
      .filter(Boolean)
      .map((entry) => {
        const tags = entry.record.tags || [];
        const hiddenTags = model.getHiddenDisableTags(tags, s.tagVisibility);
        const hiddenByLevel = !model.isTagSetWithinSelectedLevel(tags, s.selectedLevel);
        return {
          ...entry,
          inactive: hiddenTags.length > 0 || hiddenByLevel,
          hiddenTags,
          hiddenByLevel,
          selectedLevel: s.selectedLevel,
          recordLevel: model.getTagLevel(tags),
        };
      })
      .sort(compareEntries);
    const regularEntries = sortedEntries.filter((entry) => !isRecordPinned(entry.record));

    sv.highlightLine.clear();
    if (pinnedEntries.length > 0) {
      renderPinnedSection(fragment, pinnedEntries, signal);
      if (regularEntries.length > 0) {
        const divider = ctx.doc.createElement("div");
        divider.className = "pinned-results-divider";
        divider.textContent = texts.matchesDivider;
        fragment.appendChild(divider);
      }
    }
    regularEntries.forEach((entry) => fragment.appendChild(createResultItem(entry.record, signal)));

    const empty = (title, body) => {
      const element = ctx.doc.createElement("div");
      element.className = "filter-result-item";
      element.innerHTML = `<strong>${escapeHTML(title)}</strong><small>${escapeHTML(body)}</small>`;
      fragment.appendChild(element);
    };
    if (matchingHelp.length === 0) empty(texts.noMatchesTitle, texts.noMatchesBody);

    list.innerHTML = "";
    list.appendChild(fragment);
    return { helpVisible: matchingHelp.length, helpTotal: allHelp.length };
  }

  function onFilterApplied(query) {
    const summary = renderFilterResults(query);
    summaryElement.textContent = getFilterResultSummary(summary.helpVisible, summary.helpTotal, query, texts);
  }

  bindInteractionHandlers();
  sv.filter.onFilterApplied(onFilterApplied);
  return { renderFilterResults };
}
