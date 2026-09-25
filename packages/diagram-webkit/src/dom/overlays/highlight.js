// view.highlight and view.focus: outline, pulse or dim everything else.
// Both are drawn as one: the union of their elements, with
// the focus mode when there is a focus.
//
// The outline (a CSS filter on .dwk-highlighted) is drawn on a layer above
// the diagram: an <svg> with the same viewBox holding copies of the
// highlighted cells. Fading that layer is a compositor opacity change;
// animating a filter inside the diagram repaints the whole SVG every frame.

const TARGET_CLASS = "dwk-highlight-target";
const OUTLINE_CLASS = "dwk-highlighted";
const LAYER_CLASS = "dwk-highlight-layer";
const DIM_CLASS = "dwk-dim-others";
const SVG_NS = "http://www.w3.org/2000/svg";

/** @param {import("../context").Context & Record<string, any>} ctx */
export function createHighlight(ctx) {
  const s = ctx.s;
  const attrs = ctx.config.metadata;
  const copyAttrs = ["id", attrs.idAttr, attrs.tagsAttr, attrs.helpAttr, attrs.slugAttr];
  let current = [];
  let layer = null;

  function diagramSvg() {
    return /** @type {SVGSVGElement | null} */ (ctx.els.image.querySelector(`svg:not(.${LAYER_CLASS})`));
  }

  function ensureLayer() {
    const svg = diagramSvg();
    if (!svg) return null;
    if (!layer) {
      layer = /** @type {SVGSVGElement} */ (ctx.doc.createElementNS(SVG_NS, "svg"));
      layer.classList.add(LAYER_CLASS);
      layer.setAttribute("aria-hidden", "true");
      layer.style.opacity = "0";
    }
    ["viewBox", "preserveAspectRatio"].forEach((name) => {
      const value = svg.getAttribute(name);
      if (value === null) layer.removeAttribute(name);
      else layer.setAttribute(name, value);
    });
    if (layer.parentNode !== ctx.els.image) ctx.els.image.appendChild(layer);
    return layer;
  }

  // A copy of the cell in diagram user space. Metadata and ids are dropped,
  // so queries and lookups only ever find the real cell.
  function copyOf(element, svg) {
    const parent = /** @type {SVGGraphicsElement} */ (element.parentNode);
    const toRoot = svg.getScreenCTM();
    const toParent = parent && typeof parent.getScreenCTM === "function" ? parent.getScreenCTM() : null;
    const clone = /** @type {Element} */ (element.cloneNode(true));
    [clone, ...clone.querySelectorAll("*")].forEach((node) => copyAttrs.forEach((name) => node.removeAttribute(name)));
    clone.classList.remove(TARGET_CLASS);
    clone.classList.add(OUTLINE_CLASS);
    const group = ctx.doc.createElementNS(SVG_NS, "g");
    if (toRoot && toParent) {
      const m = toRoot.inverse().multiply(toParent);
      group.setAttribute("transform", `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
    }
    group.appendChild(clone);
    return group;
  }

  function visible(element) {
    if (typeof element.checkVisibility === "function") return element.checkVisibility();
    return element.getClientRects().length > 0;
  }

  function renderLayer() {
    const target = ensureLayer();
    if (!target) return;
    const svg = diagramSvg();
    target.replaceChildren(...current.filter(visible).map((element) => copyOf(element, svg)));
  }

  function setLayerVisible(on) {
    if (!layer) return;
    // From 0 in the same task: commit the 0 first, or nothing fades.
    if (on && layer.style.opacity === "0") void ctx.win.getComputedStyle(layer).opacity;
    layer.style.opacity = on ? "1" : "0";
  }

  // One spec for both; null when neither is set.
  function effectiveSpec() {
    const focus = s.focus && s.focus.tags.length ? s.focus : null;
    if (!focus) return s.highlight;
    const highlight = s.highlight || {};
    return { ...highlight, tags: [...(highlight.tags || []), ...focus.tags], mode: focus.mode || "outline" };
  }

  function reset() {
    current.forEach((element) => element.classList.remove(TARGET_CLASS));
    current = [];
    ctx.root.classList.remove(DIM_CLASS);
    ctx.services.pulse.clear({ persistentOnly: true });
  }

  function applyNow() {
    reset();
    const spec = effectiveSpec();
    if (!spec) {
      setLayerVisible(false);
      if (layer) layer.replaceChildren();
      return;
    }
    current = ctx.queryElements(spec);
    const mode = spec.mode || "outline";
    current.forEach((element) => element.classList.add(TARGET_CLASS));
    renderLayer();
    setLayerVisible(true);
    if (mode === "dim-others") ctx.root.classList.add(DIM_CLASS);
    if (mode === "pulse") reposition();
  }

  // With phases: a highlight that changes fades out now and the new one
  // (outline, dim, pulse) fades in after the leaving cells are gone. An
  // unchanged highlight stays on screen.
  function apply() {
    const phases = ctx.services.phases;
    if (!phases.active()) {
      applyNow();
      return;
    }
    const spec = effectiveSpec();
    const next = spec ? ctx.queryElements(spec) : [];
    const same = next.length === current.length && next.every((element, index) => element === current[index]);
    const sameMode = ((spec && spec.mode) || "outline") === (layer && layer.dataset.mode);
    if (!(same && sameMode)) {
      setLayerVisible(false);
      if (current.length > 0) phases.outgoing();
    }
    phases.inPhase("highlight", () => {
      applyNow();
      if (layer) layer.dataset.mode = (spec && spec.mode) || "outline";
    });
  }

  function reposition() {
    const spec = effectiveSpec();
    if (!spec || (spec.mode || "outline") !== "pulse") return;
    const pulse = ctx.services.pulse;
    current.forEach((element) => {
      if (!pulse.has(element)) pulse.pulseGoToElement(element, { persistent: true });
    });
    pulse.repositionPersistent();
  }

  return { apply, reposition, reset, elements: () => current };
}
