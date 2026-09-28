// The diagram in the dark theme: every colour it draws is rewritten inline
// to its dark form (core/dark.ts), and put back for light. No filter stays on
// the diagram, so animating cells costs the same in both themes. Raster
// images keep a filter of their own.
import { DARK_FILTER_CSS, darkCssColor } from "../core/dark";

const XHTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_PROPS = ["fill", "stroke", "color", "stop-color", "flood-color", "lighting-color"];
const HTML_PROPS = ["color", "background-color", "outline-color", "text-decoration-color"];
const BORDER_SIDES = ["top", "right", "bottom", "left"];
const IMAGES = "image, img";

/** @param {import("./context").Context & Record<string, any>} ctx */
export function createDarkCanvas(ctx) {
  // Read once per diagram: each colour's dark value and its own inline value
  // (restored per property: the engine sets display and opacity inline too).
  /** @type {{ element: Element & ElementCSSInlineStyle, prop: string, inline: string, priority: string, value: string }[] | null} */
  let overrides = null;
  // Elements that had no style attribute: back to none when light.
  let unstyled = new Set();
  // What the diagram shows, which trails the theme until it has loaded.
  let dark = false;

  function propsOf(element, style, svg) {
    if (element.namespaceURI !== XHTML_NS) return element === svg ? [...SVG_PROPS, "background-color"] : SVG_PROPS;
    const borders = BORDER_SIDES.filter((side) => style.getPropertyValue(`border-${side}-width`) !== "0px").map((side) => `border-${side}-color`);
    return [...HTML_PROPS, ...borders];
  }

  function diagramSvg() {
    return ctx.els.image.querySelector(":scope > svg");
  }

  // Reads every colour while the diagram is still light, before the first
  // write, so no element reads a dark value inherited from its parent.
  function collect(svg) {
    const out = [];
    const unsupported = new Set();
    unstyled = new Set();
    [svg, ...svg.querySelectorAll("*")].forEach((element) => {
      const style = ctx.win.getComputedStyle(element);
      propsOf(element, style, svg).forEach((prop) => {
        const value = style.getPropertyValue(prop);
        const darkValue = darkCssColor(value);
        if (!darkValue) {
          if (/^(?:color|oklch|oklab|lab|lch|hwb|hsl)a?\(/.test(value)) unsupported.add(value);
          return;
        }
        const target = /** @type {Element & ElementCSSInlineStyle} */ (element);
        if (!target.hasAttribute("style")) unstyled.add(target);
        out.push({ element: target, prop, inline: target.style.getPropertyValue(prop), priority: target.style.getPropertyPriority(prop), value: darkValue });
      });
    });
    if (unsupported.size > 0) console.warn(`diagram-webkit: dark theme: colours left as they are (not rgb): ${Array.from(unsupported).join(", ")}`);
    return out;
  }

  function write(on) {
    (overrides || []).forEach(({ element, prop, inline, priority, value }) => {
      if (on) element.style.setProperty(prop, value, "important");
      else if (inline) element.style.setProperty(prop, inline, priority);
      else element.style.removeProperty(prop);
    });
    if (!on) unstyled.forEach((element) => element.style.length === 0 && element.removeAttribute("style"));
    const svg = diagramSvg();
    if (svg) {
      svg.querySelectorAll(IMAGES).forEach((image) => {
        /** @type {HTMLElement} */ (image).style.filter = on ? DARK_FILTER_CSS : "";
      });
    }
  }

  // On a theme switch, and once the diagram has loaded (after its custom-*
  // classes, which may set colours).
  function render(on) {
    const svg = diagramSvg();
    if (!svg || on === dark) return;
    if (!overrides) overrides = collect(svg);
    write(on);
    dark = on;
    ctx.services.highlight.redraw();
  }

  // For a copy of the diagram (view-export.js): its colours as in the light
  // theme. copyOf maps each diagram element to its copy.
  function lightenCopy(copyOf) {
    if (!dark) return;
    (overrides || []).forEach(({ element, prop, inline, priority }) => {
      const copy = copyOf.get(element);
      if (!copy) return;
      if (inline) copy.style.setProperty(prop, inline, priority);
      else copy.style.removeProperty(prop);
    });
    unstyled.forEach((element) => {
      const copy = copyOf.get(element);
      if (copy && copy.style.length === 0) copy.removeAttribute("style");
    });
    copyOf.forEach((copy, element) => {
      if (element.matches && element.matches(IMAGES)) copy.style.removeProperty("filter");
    });
  }

  return { render, lightenCopy };
}
