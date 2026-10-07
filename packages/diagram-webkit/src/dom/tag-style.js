// Tag badges and severity styles on elements (the DOM side of core/tags).

/**
 * @param {import("../core/tags").TagModel} model
 * @param {HTMLElement} element
 * @param {readonly string[]} tags
 */
export function applySeverityStyleToElement(model, element, tags) {
  const style = model.getSeverityPanelStyle(tags);
  if (!style) return;
  if (style.borderColor) element.style.borderColor = style.borderColor;
  if (style.borderWidth) element.style.borderWidth = style.borderWidth;
  if (style.boxShadow) element.style.boxShadow = style.boxShadow;
}

/**
 * css-<name> and priority tags become custom-* classes the definition's CSS
 * can style.
 * @param {import("../core/tags").TagModel} model
 * @param {Element} element
 * @param {readonly string[]} tags
 */
export function applyCssTagClasses(model, element, tags) {
  Array.from(element.classList)
    .filter((className) => className.startsWith("custom-"))
    .forEach((className) => element.classList.remove(className));
  model.getCustomCssClassesForTags(tags).forEach((className) => element.classList.add(className));
}

// Badges come from model.buildTagBadgesHtml in getSortedVisibleTags order;
// data-tag lets the tag tree show only the topics it shows itself.
export function markTagBadges(model, container, tags) {
  const sorted = model.getSortedVisibleTags(tags);
  container.querySelectorAll(".annotation-tag-badge").forEach((badge, index) => {
    if (sorted[index]) badge.setAttribute("data-tag", sorted[index]);
  });
}
