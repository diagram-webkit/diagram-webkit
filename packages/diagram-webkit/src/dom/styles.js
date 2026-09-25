// The package CSS (and a definition's content.css) is adopted once per
// document and released with the last instance, so mounting needs no <link>
// and leaves no node behind.
import runtimeCss from "../ui/styles/runtime.css?inline";
import panelCss from "../ui/styles/panel.css?inline";
import tooltipCss from "../ui/styles/tooltip.css?inline";
import modalsCss from "../ui/styles/modals.css?inline";
import annotationsCss from "../ui/styles/annotations.css?inline";
import feedbackCss from "../ui/styles/feedback.css?inline";

// Same order as STYLE_FILES in vite.config.ts.
export const CSS_TEXT = [runtimeCss, panelCss, tooltipCss, modalsCss, annotationsCss, feedbackCss].join("\n");

const adopted = new WeakMap();

/**
 * Adopted sheets cascade after the document's own; the package selectors are
 * wrapped in :where(.dwk-root) so a page can still override them with more
 * specific rules. Later calls come later in the cascade.
 * @param {Document} doc
 */
export function adoptStyles(doc, cssText = CSS_TEXT) {
  if (!adopted.has(doc)) adopted.set(doc, new Map());
  const sheets = adopted.get(doc);
  let entry = sheets.get(cssText);
  if (!entry) {
    const win = /** @type {Window & typeof globalThis} */ (doc.defaultView);
    const sheet = new win.CSSStyleSheet();
    sheet.replaceSync(cssText);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    entry = { sheet, count: 0 };
    sheets.set(cssText, entry);
  }
  entry.count += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.count -= 1;
    if (entry.count > 0) return;
    doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((sheet) => sheet !== entry.sheet);
    sheets.delete(cssText);
  };
}
