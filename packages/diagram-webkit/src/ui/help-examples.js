// Help examples (help.<formatter>.<name>): their tabs and code panels, shared
// by the tooltip and the result list. The selected tab is record.exampleTab.
import { escapeHTML } from "../core/html";
import { buildHelpExample, EXAMPLE_MARKER_CLASS, HELP_TAB, highlightExample, isKnownExampleFormatter, parseExampleAttrName } from "../core/help";
import { copyWithFeedback } from "./link-info.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MARKER_RADIUS = 4.5;
const MARKER_SHAPES = "rect, ellipse, circle";

/** @param {Element} element @param {string} helpAttr @param {string} slug */
export function collectExamples(element, helpAttr, slug) {
  const examples = [];
  Array.from(element.attributes).forEach((attribute) => {
    const parsed = parseExampleAttrName(attribute.name, helpAttr);
    if (!parsed) return;
    if (!parsed.formatter || !parsed.name.trim()) {
      console.warn(`diagram-webkit: ${slug || "(no slug)"}: ${attribute.name} left out, write help.<formatter>.<name>`);
      return;
    }
    if (!isKnownExampleFormatter(parsed.formatter)) {
      console.warn(`diagram-webkit: ${slug || "(no slug)"}: ${attribute.name}: unknown formatter ${parsed.formatter}, shown as text`);
    }
    examples.push(buildHelpExample(parsed.formatter, parsed.name, attribute.value));
  });
  return examples;
}

export function exampleTabsHtml(record, texts) {
  if (!record.examples.length) return "";
  const tab = (index, label) =>
    `<button type="button" class="dwk-example-tab" role="tab" data-example-tab="${index}" aria-selected="false">${escapeHTML(label)}</button>`;
  const tabs = [tab(HELP_TAB, texts.exampleHelpTab), ...record.examples.map((example, index) => tab(index, example.title))];
  return `<div class="dwk-example-tabs" role="tablist" aria-label="${escapeHTML(texts.exampleTabsLabel)}">${tabs.join("")}</div>`;
}

export function examplePanelsHtml(record, texts) {
  return record.examples
    .map(
      (example, index) =>
        `<div class="dwk-example-panel" role="tabpanel" data-example-panel="${index}" data-example-title="${escapeHTML(example.title)}" hidden>` +
        `<div class="dwk-example-bar"><span class="dwk-example-formatter">${escapeHTML(example.formatter)}</span>` +
        `<button type="button" class="dwk-example-copy" data-example-copy="${index}" title="${escapeHTML(texts.exampleCopyTitle)}">${escapeHTML(texts.linkCopy)}</button></div>` +
        `<pre class="dwk-example-code"><code>${highlightExample(example.code, example.formatter)}</code></pre></div>`,
    )
    .join("");
}

// The help body carries data-example-panel="-1" so it switches with the tabs.
export function applyExampleTab(container, tab) {
  container.classList.toggle("dwk-example-open", tab !== HELP_TAB);
  container.querySelectorAll("[data-example-tab]").forEach((button) => {
    button.setAttribute("aria-selected", Number(button.getAttribute("data-example-tab")) === tab ? "true" : "false");
  });
  let title = "";
  container.querySelectorAll("[data-example-panel]").forEach((panel) => {
    const shown = Number(panel.getAttribute("data-example-panel")) === tab;
    /** @type {HTMLElement} */ (panel).hidden = !shown;
    if (shown) title = panel.getAttribute("data-example-title") || "";
  });
  // The example's name beside the title, where the tabs are not shown.
  const current = container.querySelector(".dwk-example-current");
  if (current) current.textContent = title;
}

export const isExampleControl = (target) => Boolean(target && typeof target.closest === "function" && target.closest("[data-example-tab], [data-example-copy]"));

// A click inside a container with examples: the selected tab, or null when
// the click was not on a tab (a copy button copies here).
export function handleExampleClick(ctx, event, record) {
  const target = event.target instanceof ctx.win.Element ? event.target : null;
  if (!target) return null;
  const copy = target.closest("[data-example-copy]");
  if (copy) {
    event.preventDefault();
    event.stopPropagation();
    copyWithFeedback(ctx, record.examples[Number(copy.getAttribute("data-example-copy"))].code, copy);
    return null;
  }
  const tab = target.closest("[data-example-tab]");
  if (!tab) return null;
  event.preventDefault();
  event.stopPropagation();
  return Number(tab.getAttribute("data-example-tab"));
}

// A dot on the top right of the cell's first shape. Drawn inside the cell, so
// it hides with it.
export function addExampleMarker(ctx, element, slug) {
  const shape = element.querySelector(MARKER_SHAPES);
  if (!shape || !shape.parentNode) {
    console.warn(`diagram-webkit: ${slug || "(no slug)"} has examples, but no rect or ellipse to mark`);
    return;
  }
  const number = (name) => Number.parseFloat(shape.getAttribute(name) || "0");
  let cx;
  let cy;
  if (shape.localName === "rect") {
    cx = number("x") + number("width");
    cy = number("y");
  } else {
    const rx = shape.localName === "circle" ? number("r") : number("rx");
    const ry = shape.localName === "circle" ? number("r") : number("ry");
    cx = number("cx") + rx * Math.SQRT1_2;
    cy = number("cy") - ry * Math.SQRT1_2;
  }
  const marker = ctx.doc.createElementNS(SVG_NS, "circle");
  marker.setAttribute("class", EXAMPLE_MARKER_CLASS);
  marker.setAttribute("cx", `${cx}`);
  marker.setAttribute("cy", `${cy}`);
  marker.setAttribute("r", `${MARKER_RADIUS}`);
  marker.setAttribute("pointer-events", "none");
  shape.parentNode.insertBefore(marker, shape.nextSibling);
}
