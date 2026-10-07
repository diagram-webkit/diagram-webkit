// Tag picker mode (help > Settings, ?tag-picker-mode): select topics in a
// part's tooltip (click, or its number key) or in the tag tree, then focus,
// show or hide them from the bar above the tags. The selection is its own
// state, glowing magenta on the diagram and kept only in the
// tag-picker-mode parameter; Make final (after a summary) drops both.
// Every change while the mode is on can be undone and redone (not in the URL).
// Only tree-group topics are picked, so levels and priorities stay as they
// are. Needs a mouse: the picking happens on hover.
import { PARAMS } from "../core/codec/params";
import { parseTagPickerParam, writeTagPickerParam } from "../core/codec/url";
import { createUndoHistory } from "../core/history";
import { escapeHTML } from "../core/html";
import { formatText } from "../core/texts";
import { FINE_POINTER_QUERY } from "../dom/context.js";
import { createSelectionGlow } from "../dom/overlays/selection.js";
import { copyWithFeedback } from "./link-info.js";
import { isTypingTarget } from "./shortcuts.js";
import { TAG_TREE_LAYOUT } from "./tag-tree.js";

const MODE_CLASS = "dwk-tag-picker-mode";
const TAG_ATTR = "data-picker-tag";
// Time to move from a part onto its tooltip. Hovering another part
// replaces the tooltip at once, so this never makes hovering feel slow.
export const TAG_PICKER_HIDE_DELAY_MS = 450;
// 1-9, then a-z, pick the topics of the open tooltip in order. Not Ctrl+key:
// Ctrl+1-9 switches browser tabs on Windows and Linux. So that the keys
// reach the picker, a text field gives up its focus when a tooltip opens.
// event.code: the same physical keys on every layout.
export const PICK_KEYS = Object.freeze([..."123456789abcdefghijklmnopqrstuvwxyz"]);
const PICK_CODE = /^(?:Digit|Numpad)([1-9])$|^Key([A-Z])$/;
// Undo steps kept; level changes this close together are one step (a drag).
export const TAG_PICKER_HISTORY_LIMIT = 200;
const LEVEL_MERGE_MS = 1000;

/** @param {import("../dom/context").Context & Record<string, any>} ctx */
export function createTagPicker(ctx) {
  const s = ctx.s;
  const sv = ctx.services;
  const model = ctx.model;
  const texts = ctx.texts;
  const attrs = ctx.config.metadata;
  const bar = ctx.el("tag-picker-bar");
  const finalModal = ctx.el("tag-picker-final-modal");
  const finalBody = ctx.el("tag-picker-final-body");
  const glow = createSelectionGlow();
  const modeListeners = new Set();
  const available = ctx.win.matchMedia(FINE_POINTER_QUERY).matches;
  const requested = ctx.features.urlSync ? parseTagPickerParam(ctx.win.location.search) : null;
  if (requested !== null && !available) console.warn(`diagram-webkit: ${PARAMS.tagPickerMode} ignored: tag picker mode needs a mouse or trackpad`);
  let on = available && requested !== null;
  let selected = on ? requested : [];
  let bindController = null;
  let barController = null;
  // Selection, hidden topics, focus and level, from every change made while
  // the mode is on (also in the tree and with the level slider).
  const history = createUndoHistory(TAG_PICKER_HISTORY_LIMIT, (snapshot) => JSON.stringify(snapshot));
  let restoring = false;
  let lastRecorded = null;
  let lastLevelChangeAt = 0;

  function isPickable(tag) {
    return s.diagramTagElements.has(tag) && model.isTopicTag(tag) && model.getTagGroupMeta(model.getTagMenuGroup(tag)).layout === TAG_TREE_LAYOUT;
  }

  const pickableTags = () => Array.from(s.diagramTagElements.keys()).filter(isPickable);
  const isSelected = (tag) => selected.includes(tag);
  const isHidden = (tag) => s.tagVisibility.get(tag) === false || Boolean(model.getHiddenAncestor(tag, s.tagVisibility));
  const isShown = (element) => element.style.display !== "none" && element.style.opacity !== "0";

  function writeUrl() {
    sv.urlSync.rewriteSearch((search) => writeTagPickerParam(search, on ? selected : null));
  }

  function selectedElements() {
    const out = new Set();
    selected.forEach((tag) => (s.diagramTagElements.get(tag) || []).forEach((element) => out.add(element)));
    return Array.from(out);
  }

  function tagLine(tags) {
    const buttons = tags
      .map((tag, index) => {
        const key = index < PICK_KEYS.length ? ` [${PICK_KEYS[index]}]` : "";
        return `<button type="button" class="tooltip-picker-tag" ${TAG_ATTR}="${escapeHTML(tag)}" aria-pressed="false">${escapeHTML(tag)}${key}</button>`;
      })
      .join("");
    return `<div class="tooltip-picker"><span class="tooltip-picker-label">${escapeHTML(texts.tagPickerTooltipLabel)}</span>${buttons}</div>`;
  }

  function button(className, text, title, onClick, disabled) {
    const node = ctx.doc.createElement("button");
    node.type = "button";
    node.className = className;
    node.textContent = text;
    node.title = title;
    node.disabled = disabled;
    node.addEventListener("click", onClick, { signal: barController.signal });
    return node;
  }

  function element(tag, className, text) {
    const node = ctx.doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Focus when any selected topic can still go into focus, else unfocus.
  function focusAction() {
    const focusable = selected.filter((tag) => !sv.focus.has(tag) && sv.focus.isFocusable(tag));
    if (focusable.length > 0) return { text: texts.tagPickerFocus, title: texts.tagPickerFocusTitle, run: () => sv.focus.setTags([...sv.focus.tags(), ...focusable]) };
    const focused = selected.filter((tag) => sv.focus.has(tag));
    return {
      text: texts.tagPickerUnfocus,
      title: texts.tagPickerUnfocusTitle,
      run: () => sv.focus.setTags(sv.focus.tags().filter((tag) => !isSelected(tag))),
      disabled: focused.length === 0,
    };
  }

  function renderBar() {
    if (barController) barController.abort();
    barController = new AbortController();
    bar.hidden = !on;
    if (!on) {
      bar.replaceChildren();
      return;
    }
    const none = selected.length === 0;
    const back = history.peekUndo();
    const forward = history.peekRedo();
    const toolbar = element("div", "tag-picker-toolbar");
    const steps = element("div", "tag-picker-history");
    steps.setAttribute("role", "group");
    steps.append(
      button("tag-picker-undo", texts.tagPickerUndo, back ? formatText(texts.tagPickerUndoTitle, { what: describeStep(back) }) : texts.tagPickerNothingToUndo, undo, !back),
      button("tag-picker-redo", texts.tagPickerRedo, forward ? formatText(texts.tagPickerRedoTitle, { what: describeStep(forward) }) : texts.tagPickerNothingToRedo, redo, !forward),
    );
    toolbar.append(steps, button("tag-picker-clear", texts.tagPickerClear, texts.tagPickerClearTitle, () => setSelection([]), none));
    const head = element("div", "tag-picker-head");
    head.append(element("strong", "", texts.tagPickerTitle), element("span", "tag-picker-count", formatText(texts.tagPickerCount, { count: selected.length })));

    const chips = element("div", "tag-picker-selection");
    if (none) chips.append(element("small", "tag-picker-empty", texts.tagPickerEmpty));
    selected.forEach((tag) => {
      const chip = button("tooltip-picker-tag active", tag, formatText(texts.tagSelectOff, { path: tag }), () => toggle(tag), false);
      chip.setAttribute("aria-pressed", "true");
      chips.append(chip);
    });

    const focus = focusAction();
    const actions = element("div", "tag-picker-actions");
    actions.append(
      button("tag-tree-bulk-btn tag-picker-focus", focus.text, focus.title, focus.run, none || Boolean(focus.disabled)),
      button("tag-tree-bulk-btn", texts.tagPickerShow, texts.tagPickerShowTitle, () => applyVisibility("show"), !selected.some(isHidden)),
      button("tag-tree-bulk-btn", texts.tagPickerHide, texts.tagPickerHideTitle, () => applyVisibility("hide"), !selected.some((tag) => !isHidden(tag))),
      button("tag-tree-bulk-btn", texts.tagPickerHideOthers, texts.tagPickerHideOthersTitle, () => applyVisibility("hide-others"), none),
    );
    const final = button("tag-picker-final", texts.tagPickerFinal, texts.tagPickerFinalTitle, openFinal, false);
    bar.replaceChildren(toolbar, head, chips, actions, final);
  }

  function syncChips() {
    ctx.root.querySelectorAll(`.tooltip-picker [${TAG_ATTR}]`).forEach((node) => {
      const chosen = isSelected(/** @type {HTMLElement} */ (node).dataset.pickerTag);
      node.classList.toggle("active", chosen);
      node.setAttribute("aria-pressed", chosen ? "true" : "false");
    });
  }

  // Everything that shows the selection: chips, tree buttons, glow, bar.
  function refresh() {
    ctx.root.classList.toggle(MODE_CLASS, on);
    syncChips();
    ctx.root.querySelectorAll(".tag-select-btn").forEach((node) => renderTreeButton(/** @type {HTMLButtonElement} */ (node)));
    glow.render(on ? selectedElements() : []);
    record();
    renderBar();
  }

  // Undo / redo -------------------------------------------------------------

  function snapshot() {
    const hidden = Array.from(s.tagVisibility.entries())
      .filter(([, visible]) => visible === false)
      .map(([tag]) => tag)
      .sort();
    const focus = s.focus ? { tags: [...s.focus.tags], mode: s.focus.mode || "outline" } : null;
    return { selected: [...selected], hidden, focus, level: s.selectedLevel };
  }

  function resetHistory() {
    lastRecorded = snapshot();
    lastLevelChangeAt = 0;
    history.reset(lastRecorded);
  }

  const levelOnly = (a, b) => a.level !== b.level && JSON.stringify({ ...a, level: 0 }) === JSON.stringify({ ...b, level: 0 });

  // A slider drag is one step: a level change right after another one
  // replaces it.
  function record() {
    if (!on || restoring || !lastRecorded) return;
    const next = snapshot();
    const now = ctx.win.performance.now();
    const levelStep = levelOnly(lastRecorded, next);
    if (!history.record(next, { merge: levelStep && now - lastLevelChangeAt < LEVEL_MERGE_MS })) return;
    lastRecorded = next;
    lastLevelChangeAt = levelStep ? now : 0;
  }

  // What a step changes, for the Undo/Redo titles.
  function describeStep({ from, to }) {
    const parts = [
      JSON.stringify(from.selected) !== JSON.stringify(to.selected) && texts.historySelection,
      JSON.stringify(from.hidden) !== JSON.stringify(to.hidden) && texts.historyHidden,
      JSON.stringify(from.focus) !== JSON.stringify(to.focus) && texts.historyFocus,
      from.level !== to.level && texts.historyLevel,
    ].filter(Boolean);
    return parts.join(", ");
  }

  function restore(target) {
    restoring = true;
    selected = [...target.selected];
    s.selectedLevel = target.level;
    s.focus = target.focus ? { tags: [...target.focus.tags], ...(target.focus.mode !== "outline" ? { mode: target.focus.mode } : {}) } : null;
    sv.filter.clearOnlyTags();
    sv.filter.setHiddenTags(target.hidden);
    sv.filter.applyAnnotationFilter();
    if (sv.tagTree) sv.tagTree.refresh();
    sv.urlSync.updateURLState();
    writeUrl();
    restoring = false;
    lastRecorded = target;
    lastLevelChangeAt = 0;
    refresh();
  }

  function undo() {
    const target = history.undo();
    if (target) restore(target);
  }

  function redo() {
    const target = history.redo();
    if (target) restore(target);
  }

  function renderTreeButton(node) {
    const chosen = isSelected(node.dataset.tag);
    node.classList.toggle("active", chosen);
    node.setAttribute("aria-pressed", chosen ? "true" : "false");
    node.title = formatText(chosen ? texts.tagSelectOff : texts.tagSelectOn, { path: node.dataset.tag });
  }

  function setSelection(next) {
    selected = next;
    writeUrl();
    refresh();
  }

  function toggle(tag) {
    if (!on || !isPickable(tag)) return;
    setSelection(isSelected(tag) ? selected.filter((item) => item !== tag) : [...selected, tag]);
  }

  function setMode(next) {
    if (next === on || (next && !available)) return;
    on = next;
    if (!on) selected = [];
    else releaseTypingFocus();
    if (on) resetHistory();
    writeUrl();
    // Internal tags are in the tree only while the mode is on.
    if (sv.tagTree) sv.tagTree.initializeTagControls();
    refresh();
    modeListeners.forEach((listener) => listener(on));
  }

  // Replaces the hidden picker topics; hidden priorities and other groups
  // are carried over as they are.
  function applyVisibility(action) {
    const others = Array.from(s.diagramTagElements.keys()).filter((tag) => !isPickable(tag) && s.tagVisibility.get(tag) === false);
    const hidden = model.pickerHiddenTags(action, selected, pickableTags(), s.tagVisibility);
    sv.filter.clearOnlyTags();
    sv.filter.setHiddenTags([...others, ...hidden]);
    sv.filter.applyAnnotationFilter();
    if (sv.tagTree) sv.tagTree.refresh();
    sv.urlSync.updateURLState();
  }

  // Make final --------------------------------------------------------------

  function isFinalOpen() {
    return finalModal.style.display !== "none";
  }

  function finalSummary() {
    const topics = pickableTags();
    const hidden = sv.filter.getExplicitHiddenTags();
    const focused = sv.focus.tags();
    const tagged = Array.from(sv.filter.getTaggedElements());
    const list = (tags) => (tags.length > 0 ? tags.join(", ") : texts.finalNone);
    const facts = [
      [texts.finalTopics, formatText(texts.finalTopicsValue, { shown: topics.filter((tag) => !isHidden(tag)).length, total: topics.length })],
      [texts.finalHidden, list(hidden)],
      [texts.finalFocus, focused.length > 0 && sv.focus.mode() === "dim-others" ? formatText(texts.finalFocusDim, { tags: focused.join(", ") }) : list(focused)],
      s.maxDiagramLevel > 0 && [
        texts.finalLevel,
        s.selectedLevel >= s.maxDiagramLevel ? texts.finalLevelMax : formatText(texts.finalLevelValue, { level: s.selectedLevel, max: s.maxDiagramLevel }),
      ],
      [texts.finalParts, formatText(texts.finalTopicsValue, { shown: tagged.filter(isShown).length, total: tagged.length })],
      s.annotationSearchQuery && [texts.finalSearch, s.annotationSearchQuery],
      s.pinnedHelpSlugs.size > 0 && [texts.finalPins, Array.from(s.pinnedHelpSlugs).join(", ")],
    ].filter(Boolean);

    const idle = selected.filter((tag) => !isHidden(tag) && !sv.focus.has(tag));
    const hiddenSelected = selected.filter(isHidden);
    const checks = [
      idle.length > 0 && { warn: true, text: formatText(texts.finalIdle, { tags: idle.join(", ") }) },
      hiddenSelected.length > 0 && { warn: false, text: formatText(texts.finalSelectedHidden, { tags: hiddenSelected.join(", ") }) },
      hidden.length === 0 && focused.length === 0 && { warn: true, text: texts.finalEverything },
      s.annotationSearchQuery && { warn: true, text: formatText(texts.finalSearchFilters, { query: s.annotationSearchQuery }) },
    ].filter(Boolean);
    if (selected.length > 0 && idle.length === 0) checks.push({ warn: false, text: texts.finalAllGood });
    return { facts, checks };
  }

  function renderFinal() {
    const { facts, checks } = finalSummary();
    const dl = element("dl", "about-facts tag-picker-final-facts");
    facts.forEach(([term, value]) => {
      const row = element("div");
      row.append(element("dt", "", term), element("dd", "", value));
      dl.append(row);
    });
    const checkList = element("ul", "tag-picker-final-checks");
    checks.forEach((check) => checkList.append(element("li", check.warn ? "is-warning" : "", check.text)));
    finalBody.replaceChildren(
      element("p", "tag-picker-final-intro", texts.finalIntro),
      element("h4", "help-section-title", texts.finalResult),
      dl,
      element("h4", "help-section-title", texts.finalChecks),
      checkList,
      element("p", "tag-picker-final-undo", texts.finalNoUndo),
    );
  }

  function openFinal() {
    renderFinal();
    finalModal.style.display = "flex";
    ctx.root.classList.add("modal-locks-diagram");
    ctx.el("tag-picker-final-apply").focus({ preventScroll: true });
  }

  function closeFinal() {
    finalModal.style.display = "none";
    ctx.root.classList.remove("modal-locks-diagram");
  }

  function currentUrl({ final }) {
    const url = new URL(ctx.win.location.href);
    if (final) url.searchParams.delete(PARAMS.tagPickerMode);
    return sv.urlSync.toAbsoluteReadableUrl(url);
  }

  function bindFinal() {
    const signal = ctx.signal;
    ctx.el("close-tag-picker-final").addEventListener("click", closeFinal, { signal });
    ctx.el("tag-picker-final-cancel").addEventListener("click", closeFinal, { signal });
    ctx.el("tag-picker-final-apply").addEventListener(
      "click",
      () => {
        closeFinal();
        setMode(false);
      },
      { signal },
    );
    finalModal.addEventListener(
      "click",
      (event) => {
        if (event.target === finalModal) closeFinal();
      },
      { signal },
    );
    [
      ["tag-picker-copy-backup", false],
      ["tag-picker-copy-final", true],
    ].forEach(([name, final]) => {
      const copy = ctx.maybeEl(/** @type {string} */ (name));
      if (copy) copy.addEventListener("click", () => copyWithFeedback(ctx, currentUrl({ final: Boolean(final) }), copy), { signal });
    });
  }

  // Tooltips ---------------------------------------------------------------

  // Hovering another part shows its tooltip at once, without the old one
  // lingering for the hide delay.
  function beforeTooltipShow(tooltip) {
    if (!on) return;
    releaseTypingFocus();
    ctx.els.tooltipLayer.querySelectorAll(".tooltip-box").forEach((other) => {
      if (other !== tooltip) /** @type {HTMLElement} */ (other).style.display = "none";
    });
  }

  function releaseTypingFocus() {
    const active = ctx.scope.activeElement;
    if (isTypingTarget(active) && ctx.root.contains(active)) /** @type {HTMLElement} */ (active).blur();
  }

  function tooltipHideDelay() {
    return on ? TAG_PICKER_HIDE_DELAY_MS : ctx.config.ui.tooltipHideDelay;
  }

  function openTooltipLine() {
    return Array.from(ctx.els.tooltipLayer.querySelectorAll(".tooltip-picker")).find(
      (line) => /** @type {HTMLElement} */ (line.closest(".tooltip-box")).style.display !== "none",
    );
  }

  // Parts without help text: one shared tooltip with only the topics.
  function createTagOnlyTooltip(signal) {
    const tooltip = element("div", "tooltip-box svg-property-tooltip dwk-picker-tooltip");
    tooltip.style.display = "none";
    ctx.els.tooltipLayer.appendChild(tooltip);
    let hideTimeout = 0;
    const scheduleHide = () => {
      hideTimeout = ctx.timers.setTimeout(() => {
        tooltip.style.display = "none";
      }, tooltipHideDelay());
    };
    tooltip.addEventListener("mouseenter", () => ctx.timers.clearTimeout(hideTimeout), { signal });
    tooltip.addEventListener("mouseleave", scheduleHide, { signal });
    return {
      bind(part, tags) {
        part.addEventListener(
          "mouseenter",
          (event) => {
            if (!on || s.editModeEnabled) return;
            ctx.timers.clearTimeout(hideTimeout);
            tooltip.innerHTML = tagLine(tags);
            syncChips();
            beforeTooltipShow(tooltip);
            sv.tooltip.showForSvgElement(tooltip, part, event);
          },
          { signal },
        );
        part.addEventListener("mouseleave", scheduleHide, { signal });
      },
    };
  }

  function addTooltipLines(signal) {
    s.svgHelpRecords.forEach((record) => {
      const tags = record.tags.filter(isPickable);
      if (record.tooltip && tags.length > 0) record.tooltip.insertAdjacentHTML("beforeend", tagLine(tags));
    });
    if (!ctx.features.tooltips) return;
    let shared = null;
    sv.filter.getTaggedElements().forEach((part) => {
      if (s.svgHelpRecordByElement.has(part)) return;
      const tags = model.parseTags(part.getAttribute(attrs.tagsAttr)).filter(isPickable);
      if (tags.length === 0) return;
      if (!shared) shared = createTagOnlyTooltip(signal);
      shared.bind(part, tags);
    });
  }

  // Ctrl/Cmd+Z, and Ctrl/Cmd+Shift+Z or Ctrl+Y; not in a text field, which
  // has its own undo.
  function handleHistoryKey(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || isTypingTarget(event.target)) return false;
    const key = event.key.toLowerCase();
    const step = key === "z" ? (event.shiftKey ? redo : undo) : key === "y" && event.ctrlKey ? redo : null;
    if (!step) return false;
    event.preventDefault();
    step();
    return true;
  }

  // Keys: Escape closes the Make final dialog; undo/redo; 1-9 pick in the
  // open tooltip (event.code: the key is the same on every layout).
  function handleKeyDown(event) {
    if (isFinalOpen()) {
      if (event.key !== "Escape") return false;
      event.preventDefault();
      closeFinal();
      return true;
    }
    if (on && handleHistoryKey(event)) return true;
    const pick = PICK_CODE.exec(event.code);
    if (!on || !pick || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return false;
    const line = openTooltipLine();
    const chip = line ? /** @type {HTMLElement | undefined} */ (line.querySelectorAll(`[${TAG_ATTR}]`)[PICK_KEYS.indexOf((pick[1] || pick[2]).toLowerCase())]) : undefined;
    if (!chip) return false;
    event.preventDefault();
    toggle(chip.dataset.pickerTag);
    return true;
  }

  // After each diagram load, once tags and help records exist.
  function initialize() {
    if (bindController) bindController.abort();
    bindController = new AbortController();
    const unknown = selected.filter((tag) => !isPickable(tag));
    if (unknown.length > 0) {
      console.warn(`diagram-webkit: ${PARAMS.tagPickerMode}: dropped tags that are not topics in a tag tree of this diagram: ${unknown.join(", ")}`);
      selected = selected.filter(isPickable);
      writeUrl();
    }
    if (available) addTooltipLines(AbortSignal.any([ctx.signal, bindController.signal]));
    if (on) resetHistory();
    refresh();
  }

  ctx.root.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof ctx.win.Element ? event.target.closest(`.tooltip-picker [${TAG_ATTR}]`) : null;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      toggle(/** @type {HTMLElement} */ (target).dataset.pickerTag);
    },
    { signal: ctx.signal },
  );
  sv.filter.onFilterApplied(() => {
    if (on) refresh();
  });
  bindFinal();

  return {
    initialize,
    refresh,
    available: () => available,
    isOn: () => on,
    setMode,
    toggle,
    renderTreeButton,
    handleKeyDown,
    beforeTooltipShow,
    tooltipHideDelay,
    onModeChange(listener) {
      modeListeners.add(listener);
      return () => modeListeners.delete(listener);
    },
  };
}
