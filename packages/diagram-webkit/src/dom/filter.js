// Applies the filter to the diagram (tag discovery, level clamp, visibility):
// everything a
// filter needs without the panel. The panel renders from onFilterApplied.
import { helpMatchesSearch, normalizeQuery } from "../core/help";
import { applyCssTagClasses } from "./tag-style.js";

/** @param {import("./context").Context & Record<string, any>} ctx */
export function createFilter(ctx) {
  const s = ctx.s;
  const model = ctx.model;
  const attrs = ctx.config.metadata;
  const appliedListeners = new Set();

  function helpIndex() {
    return ctx.services.helpIndex;
  }

  function getTaggedElements() {
    return ctx.els.image.querySelectorAll(`[${attrs.tagsAttr}]`);
  }

  function applyTagVisibility(tag) {
    const elements = s.diagramTagElements.get(tag);
    if (!elements) return;
    elements.forEach((element) => helpIndex().updateSvgElementVisibility(element));
  }

  function ensureTagVisibilityInitialized(tag) {
    if (s.tagVisibility.has(tag)) return;
    const initiallyVisible = s.initialHiddenTags ? !s.initialHiddenTags.has(tag) : true;
    s.tagVisibility.set(tag, initiallyVisible);
  }

  // Discovers tags and levels, clamps the selected level, and initializes the
  // visibility of tags seen for the first time.
  function indexTags() {
    const next = new Map();
    let maxDiscoveredLevel = 0;
    getTaggedElements().forEach((element) => {
      const tags = model.parseTags(element.getAttribute(attrs.tagsAttr));
      applyCssTagClasses(model, element, tags);
      maxDiscoveredLevel = Math.max(maxDiscoveredLevel, model.getTagLevel(tags));
      tags.forEach((tag) => {
        if (model.isLevelTag(tag) || model.isCssTag(tag)) return;
        if (!next.has(tag)) next.set(tag, []);
        next.get(tag).push(element);
      });
    });
    s.diagramTagElements = next;

    s.maxDiagramLevel = maxDiscoveredLevel;
    if (s.selectedLevel > s.maxDiagramLevel) s.selectedLevel = s.maxDiagramLevel;
    if (!s.hasInitialSelectedLevel && maxDiscoveredLevel > 0) {
      s.selectedLevel = maxDiscoveredLevel;
    } else {
      s.selectedLevel = Math.max(0, Math.min(maxDiscoveredLevel, s.selectedLevel));
    }

    if (s.initialOnlyTags) {
      s.initialHiddenTags = new Set(model.hiddenTagsForOnly(s.initialOnlyTags, Array.from(next.keys())));
      s.onlyTags = [...s.initialOnlyTags];
      s.initialOnlyTags = null;
    }
    const tags = Array.from(next.keys());
    tags.forEach(ensureTagVisibilityInitialized);
    tags.forEach(applyTagVisibility);
  }

  function getAllTags() {
    return Array.from(s.diagramTagElements.keys());
  }

  function setTagHidden(tag, hidden) {
    s.tagVisibility.set(tag, !hidden);
    applyTagVisibility(tag);
  }

  // Replaces tag visibility wholesale: the listed tags hidden, all others
  // visible.
  function setHiddenTags(hiddenTags) {
    const hidden = new Set(hiddenTags);
    getAllTags().forEach((tag) => s.tagVisibility.set(tag, !hidden.has(tag)));
    hiddenTags.forEach((tag) => {
      if (!s.diagramTagElements.has(tag)) s.tagVisibility.set(tag, false);
    });
  }

  function setOnlyTags(onlyTags) {
    if (!onlyTags || onlyTags.length === 0) {
      s.onlyTags = null;
      return;
    }
    setHiddenTags(model.hiddenTagsForOnly(onlyTags, getAllTags()));
    s.onlyTags = [...onlyTags];
  }

  // A manual tag change means onlyTags no longer describes the state.
  function clearOnlyTags() {
    s.onlyTags = null;
  }

  function getExplicitHiddenTags() {
    return model.getExplicitHiddenTags(s.tagVisibility.entries());
  }

  function isRecordPinned(record) {
    const slug = `${(record && record.slug) || ""}`.trim();
    return slug ? s.pinnedHelpSlugs.has(slug) : false;
  }

  function applyAnnotationFilter() {
    const query = normalizeQuery(s.annotationSearchQuery);
    const updated = new Set();
    s.svgHelpRecords.forEach((record) => {
      record.searchMatch = helpMatchesSearch(record, query);
      helpIndex().updateSvgElementVisibility(record.element);
      updated.add(record.element);
    });
    getTaggedElements().forEach((element) => {
      if (!updated.has(element)) helpIndex().updateSvgElementVisibility(element);
    });

    // Hiding a focused topic drops its focus (URL written by the caller).
    ctx.services.focus.prune();
    ctx.services.highlight.apply();
    appliedListeners.forEach((listener) => listener(query));
  }

  return {
    indexTags,
    getAllTags,
    getTaggedElements,
    applyTagVisibility,
    ensureTagVisibilityInitialized,
    setTagHidden,
    setHiddenTags,
    setOnlyTags,
    clearOnlyTags,
    getExplicitHiddenTags,
    isRecordPinned,
    applyAnnotationFilter,
    onFilterApplied(listener) {
      appliedListeners.add(listener);
      return () => appliedListeners.delete(listener);
    },
  };
}
