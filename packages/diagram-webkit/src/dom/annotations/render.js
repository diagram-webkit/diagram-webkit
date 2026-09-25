// Renders user annotations (point, area, arrow). Each render replaces the previous one's
// elements and listeners.
import { escapeHTML } from "../../core/html";

const SVG_NS = "http://www.w3.org/2000/svg";
// Both ends must stay grabbable at any zoom, so the hit stroke is far wider
// than the drawn one and the handles keep a fixed screen size.
export const SHAFT_HIT_WIDTH_PX = 18;
export const HANDLE_RADIUS_PX = 7;

/** @param {import("../context").Context & Record<string, any>} ctx */
export function createAnnotationRender(ctx) {
  const s = ctx.s;
  let renderController = null;
  // Marker ids are document-wide, and the same style is drawn in several
  // places; prefix per instance so two diagrams never share one.
  let swatchSequence = 0;

  function hover() {
    return ctx.services.annotationHover;
  }

  function drag() {
    return ctx.services.annotationDrag || null;
  }

  function strokeWidthOf(style) {
    const parsed = Number.parseFloat(style && style.strokeWidth);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
  }

  function createArrowSwatch(style) {
    const svg = ctx.doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "type-btn-arrow-svg");
    svg.setAttribute("viewBox", "0 0 40 40");
    svg.setAttribute("aria-hidden", "true");

    swatchSequence += 1;
    const markerId = `${ctx.idPrefix}-arrow-swatch-head-${swatchSequence}`;
    const defs = ctx.doc.createElementNS(SVG_NS, "defs");
    const marker = ctx.doc.createElementNS(SVG_NS, "marker");
    marker.setAttribute("id", markerId);
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "11");
    marker.setAttribute("markerHeight", "11");
    marker.setAttribute("orient", "auto-start-reverse");
    // Fixed size, not strokeWidth-relative: on the 5px types a scaled head
    // swallowed the whole swatch and every thick arrow looked the same.
    marker.setAttribute("markerUnits", "userSpaceOnUse");
    marker.setAttribute("refX", "8");
    const head = ctx.doc.createElementNS(SVG_NS, "path");
    head.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    head.setAttribute("fill", style.border);
    marker.appendChild(head);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const line = ctx.doc.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", "8");
    line.setAttribute("y1", "31");
    line.setAttribute("x2", "27");
    line.setAttribute("y2", "14");
    line.setAttribute("stroke", style.border);
    line.setAttribute("stroke-width", `${style.strokeWidth || 3}`);
    line.setAttribute("stroke-linecap", "round");
    const dash = { dashed: "6 4", dotted: "1 4", double: "12 3" }[style.borderStyle];
    if (dash) line.setAttribute("stroke-dasharray", dash);
    line.setAttribute("marker-end", `url(#${markerId})`);
    svg.appendChild(line);
    return svg;
  }

  // The wrapper spans the whole image frame, so arrow coordinates stay plain
  // fractions of the diagram and survive zoom and pan untouched.
  function getArrowPoints(ann, frame) {
    return {
      x1: ann.x * frame.width,
      y1: ann.y * frame.height,
      x2: (Number.isFinite(ann.x2) ? ann.x2 : ann.x) * frame.width,
      y2: (Number.isFinite(ann.y2) ? ann.y2 : ann.y) * frame.height,
    };
  }

  function createArrowElements(index, style) {
    const svg = ctx.doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "arrow-annotation");
    Object.assign(svg.style, { position: "absolute", left: "0", top: "0", overflow: "visible", pointerEvents: "none" });

    const markerId = `${ctx.idPrefix}-user-arrow-head-${index}`;
    const defs = ctx.doc.createElementNS(SVG_NS, "defs");
    const marker = ctx.doc.createElementNS(SVG_NS, "marker");
    marker.setAttribute("id", markerId);
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto-start-reverse");
    marker.setAttribute("markerUnits", "strokeWidth");
    const head = ctx.doc.createElementNS(SVG_NS, "path");
    head.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    head.setAttribute("fill", style.border);
    marker.appendChild(head);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const shaft = ctx.doc.createElementNS(SVG_NS, "line");
    shaft.setAttribute("class", "arrow-annotation-shaft");
    shaft.setAttribute("stroke", style.border);
    shaft.setAttribute("stroke-width", `${strokeWidthOf(style)}`);
    shaft.setAttribute("stroke-linecap", "round");
    const dash = { dashed: "10 6", dotted: "2 6" }[style.borderStyle];
    if (dash) shaft.setAttribute("stroke-dasharray", dash);
    shaft.setAttribute("marker-end", `url(#${markerId})`);

    const hit = ctx.doc.createElementNS(SVG_NS, "line");
    hit.setAttribute("class", "arrow-annotation-hit");
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", `${SHAFT_HIT_WIDTH_PX}`);
    hit.setAttribute("stroke-linecap", "round");
    hit.style.pointerEvents = "stroke";
    svg.append(shaft, hit);

    const handles = ["tail", "head"].map((end) => {
      const handle = ctx.doc.createElementNS(SVG_NS, "circle");
      handle.setAttribute("class", `arrow-annotation-handle arrow-handle-${end}`);
      handle.setAttribute("r", `${HANDLE_RADIUS_PX}`);
      handle.setAttribute("fill", "#ffffff");
      handle.setAttribute("stroke", style.border);
      handle.setAttribute("stroke-width", "2");
      handle.dataset.arrowEnd = end;
      svg.appendChild(handle);
      return handle;
    });
    return { svg, shaft, hit, handles };
  }

  function updateArrowLayout(ann, frame) {
    const parts = ann._arrow;
    if (!parts || !ann._el) return;
    Object.assign(ann._el.style, {
      left: `${frame.left}px`,
      top: `${frame.top}px`,
      width: `${frame.width}px`,
      height: `${frame.height}px`,
    });
    parts.svg.setAttribute("width", `${frame.width}`);
    parts.svg.setAttribute("height", `${frame.height}`);

    const points = getArrowPoints(ann, frame);
    [parts.shaft, parts.hit].forEach((line) => {
      line.setAttribute("x1", `${points.x1}`);
      line.setAttribute("y1", `${points.y1}`);
      line.setAttribute("x2", `${points.x2}`);
      line.setAttribute("y2", `${points.y2}`);
    });
    parts.handles[0].setAttribute("cx", `${points.x1}`);
    parts.handles[0].setAttribute("cy", `${points.y1}`);
    parts.handles[1].setAttribute("cx", `${points.x2}`);
    parts.handles[1].setAttribute("cy", `${points.y2}`);

    const editing = s.editModeEnabled;
    parts.handles.forEach((handle) => {
      handle.style.display = editing ? "block" : "none";
      handle.style.pointerEvents = editing ? "auto" : "none";
    });
    parts.hit.style.cursor = editing ? "move" : "pointer";
  }

  function clearUserAnnotationVisuals() {
    if (renderController) renderController.abort();
    renderController = null;
    ctx.els.wrapper.querySelectorAll(".user-annotation-wrapper").forEach((element) => element.remove());
    ctx.els.tooltipLayer.querySelectorAll(".tooltip-box:not(.svg-property-tooltip)").forEach((element) => element.remove());
    s.userAnnotations.forEach((ann) => {
      delete ann._el;
      delete ann._tooltip;
      delete ann._index;
      delete ann._arrow;
    });
  }

  // Title and description are both optional, so an annotation can have
  // nothing to say - in which case it gets no tooltip rather than an empty box.
  function createAnnotationTooltip(ann) {
    if (!ctx.features.tooltips) return null;
    const title = `${ann.title || ""}`.trim();
    const description = `${ann.description || ""}`.trim();
    if (!title && !description) return null;
    const tooltip = ctx.doc.createElement("div");
    tooltip.className = "tooltip-box user-annotation-tooltip";
    const titleHtml = title ? `<b>${escapeHTML(title)}</b>` : "";
    const separator = title && description ? "<br><br>" : "";
    tooltip.innerHTML = `${titleHtml}${separator}${description ? ctx.processUserDescription(ann.description) : ""}`;
    tooltip.style.display = "none";
    tooltip.style.whiteSpace = "pre-wrap";
    ctx.els.tooltipLayer.appendChild(tooltip);
    return tooltip;
  }

  function renderPointAnnotation(ann, index, style, signal) {
    const wrapperEl = ctx.doc.createElement("div");
    wrapperEl.className = "user-annotation-wrapper";
    Object.assign(wrapperEl.style, { position: "absolute", transform: "translate(-50%, -50%)", zIndex: "15" });

    const marker = ctx.doc.createElement("div");
    marker.className = "marker user-annotation-marker";
    Object.assign(marker.style, {
      background: style.bg,
      color: style.color,
      borderRadius: (ann.shape || "rectangle") === "circle" ? "50%" : "8px",
      borderColor: style.border,
      borderWidth: style.borderWidth || "3px",
      borderStyle: style.borderStyle || "solid",
      cursor: s.editModeEnabled ? "move" : "pointer",
    });
    marker.setAttribute("data-user-index", `${index}`);

    const tooltip = createAnnotationTooltip(ann);
    if (tooltip) hover().addPointAnnotationHoverEvents(wrapperEl, tooltip, ann, signal);
    if (drag()) drag().addUserAnnotationDragListeners(wrapperEl, marker, index, signal);

    wrapperEl.appendChild(marker);
    ctx.els.wrapper.appendChild(wrapperEl);
    ann._el = wrapperEl;
    ann._tooltip = tooltip;
    ann._index = index;
  }

  function renderAreaAnnotation(ann, index, style, signal) {
    const wrapperEl = ctx.doc.createElement("div");
    wrapperEl.className = "user-annotation-wrapper area-annotation-wrapper";
    Object.assign(wrapperEl.style, { position: "absolute", zIndex: "5" });

    const areaElement = ctx.doc.createElement("div");
    areaElement.className = `area-annotation ${ann.shape || "rectangle"}`;
    const bounds = ctx.services.geometry.getImageBounds(true);
    Object.assign(areaElement.style, {
      background: style.bg,
      borderColor: style.border,
      borderWidth: style.borderWidth || "3px",
      borderStyle: style.borderStyle || "solid",
      width: `${ann.widthRel * bounds.width}px`,
      height: `${ann.heightRel * bounds.height}px`,
      cursor: s.editModeEnabled ? "move" : "pointer",
      pointerEvents: s.editModeEnabled ? "auto" : "none",
    });
    areaElement.setAttribute("data-user-index", `${index}`);

    if (s.editModeEnabled && drag()) {
      areaElement.classList.add("edit-mode");
      drag().addAreaResizeHandles(areaElement, ann, index, signal);
    }
    const tooltip = createAnnotationTooltip(ann);
    if (tooltip) hover().addAreaAnnotationHoverEvents(areaElement, tooltip, ann, signal);
    if (drag()) drag().addAreaAnnotationDragListeners(wrapperEl, areaElement, index, signal);

    wrapperEl.appendChild(areaElement);
    ctx.els.wrapper.appendChild(wrapperEl);
    ann._el = wrapperEl;
    ann._tooltip = tooltip;
    ann._index = index;
  }

  function renderArrowAnnotation(ann, index, style, signal) {
    const tooltip = createAnnotationTooltip(ann);
    const wrapperEl = ctx.doc.createElement("div");
    wrapperEl.className = "user-annotation-wrapper arrow-annotation-wrapper";
    Object.assign(wrapperEl.style, { position: "absolute", zIndex: "10", pointerEvents: "none" });
    const parts = createArrowElements(index, style);
    wrapperEl.appendChild(parts.svg);
    ctx.els.wrapper.appendChild(wrapperEl);

    ann._el = wrapperEl;
    ann._arrow = parts;
    ann._tooltip = tooltip;
    ann._index = index;

    updateArrowLayout(ann, ctx.services.annotationPositioning.getImageFrameInWrapper());
    if (tooltip) hover().addArrowHoverEvents(ann, tooltip, signal);
    if (drag()) drag().addArrowDragListeners(ann, signal);
  }

  function renderAllMarkers() {
    clearUserAnnotationVisuals();
    if (!ctx.els.image.querySelector("svg")) return;

    ctx.services.filter.applyAnnotationFilter();
    renderController = new AbortController();
    const signal = AbortSignal.any([ctx.signal, renderController.signal]);
    s.userAnnotations.forEach((ann, index) => {
      const style = ctx.annotationStyle(ann.type);
      if (!style) return;
      if (style.annotationType === "arrow") renderArrowAnnotation(ann, index, style, signal);
      else if (style.annotationType === "area") renderAreaAnnotation(ann, index, style, signal);
      else renderPointAnnotation(ann, index, style, signal);
    });
    ctx.timers.requestAnimationFrame(() => ctx.services.overlays.scheduleMarkerPositioning());
  }

  return {
    clearUserAnnotationVisuals,
    renderAllMarkers,
    updateArrowLayout,
    createArrowSwatch,
    createAnnotationTooltip,
  };
}
