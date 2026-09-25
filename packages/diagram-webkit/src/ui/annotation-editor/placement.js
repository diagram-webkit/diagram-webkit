// Placing a new annotation: point, area or arrow.
import { formatText } from "../../core/texts";
import { getScale, toLocal } from "../../dom/context.js";

const SVG_NS = "http://www.w3.org/2000/svg";
// An arrow shorter than this is a mis-click, not a placement.
export const MIN_ARROW_LENGTH_PX = 12;

export function createPlacement(ctx, editor) {
  const s = ctx.s;
  const sv = ctx.services;
  const wrapper = ctx.els.wrapper;
  let active = false;
  let placementData = null;
  let controller = null;
  let dragGhost = null;
  let arrowPreview = null;
  let arrowTailPoint = null;

  function cleanupPlacementMode() {
    if (!active) return;
    if (controller) controller.abort();
    controller = null;
    if (dragGhost) dragGhost.remove();
    dragGhost = null;
    if (arrowPreview) arrowPreview.remove();
    arrowPreview = null;
    arrowTailPoint = null;
    wrapper.style.cursor = "";
    active = false;
    placementData = null;
  }

  function imageRelativePoint(clientX, clientY) {
    const imageRect = ctx.els.image.getBoundingClientRect();
    return { x: (clientX - imageRect.left) / imageRect.width, y: (clientY - imageRect.top) / imageRect.height };
  }

  function hasRoomForAnotherAnnotation() {
    const max = ctx.config.annotations.max;
    if (s.userAnnotations.length < max) return true;
    ctx.win.alert(formatText(ctx.texts.maxAnnotations, { max }));
    cleanupPlacementMode();
    return false;
  }

  // Store it, drop out of placement mode, render, and enter edit mode so the
  // new annotation can be adjusted straight away.
  function commitAnnotation(annotation) {
    s.userAnnotations.push(annotation);
    cleanupPlacementMode();
    editor.forms.clearInlineForm();
    sv.urlSync.updateURLState();
    ctx.timers.requestAnimationFrame(() => {
      sv.annotations.renderAllMarkers();
      editor.list.updateUserAnnotationsList();
      ctx.timers.setTimeout(() => editor.setEditMode(true), 150);
    });
  }

  function startAddAnnotationModeWithData(data) {
    if (active) cleanupPlacementMode();
    const style = ctx.annotationStyle(data.type);
    if (!data.type || !style) return;
    active = true;
    placementData = data;
    controller = new AbortController();
    const signal = AbortSignal.any([ctx.signal, controller.signal]);
    if (style.annotationType === "arrow") {
      startArrowPlacement(style, signal);
      return;
    }

    const isArea = style.annotationType === "area";
    dragGhost = ctx.doc.createElement("div");
    dragGhost.className = "user-annotation-ghost";
    Object.assign(dragGhost.style, {
      position: "absolute",
      background: style.bg,
      color: style.color,
      border: `${style.borderWidth || "3px"} ${style.borderStyle || "solid"} ${style.border}`,
      cursor: "move",
      zIndex: "1000",
      pointerEvents: "none",
      opacity: "0.8",
      width: isArea ? `${style.defaultSize.width}px` : "32px",
      height: isArea ? `${style.defaultSize.height}px` : "32px",
      borderRadius: data.shape === "circle" ? "50%" : isArea ? "4px" : "8px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: "bold",
      fontSize: "14px",
    });
    dragGhost.textContent = "+";
    wrapper.appendChild(dragGhost);
    wrapper.style.cursor = "crosshair";

    wrapper.addEventListener(
      "mousemove",
      (event) => {
        if (!dragGhost) return;
        const point = toLocal(wrapper, event.clientX, event.clientY);
        dragGhost.style.left = `${point.x - Number.parseInt(dragGhost.style.width, 10) / 2}px`;
        dragGhost.style.top = `${point.y - Number.parseInt(dragGhost.style.height, 10) / 2}px`;
      },
      { signal },
    );
    wrapper.addEventListener(
      "click",
      (event) => {
        if (!active || !placementData) return;
        const current = ctx.annotationStyle(placementData.type);
        const currentIsArea = current && current.annotationType === "area";
        const bounds = sv.geometry.getImageBounds(true);
        let { x, y } = imageRelativePoint(event.clientX, event.clientY);
        if (currentIsArea && current.defaultSize) {
          x -= current.defaultSize.width / 2 / bounds.width;
          y -= current.defaultSize.height / 2 / bounds.height;
        }
        if (x < 0 || x > 1 || y < 0 || y > 1) {
          cleanupPlacementMode();
          return;
        }
        if (!hasRoomForAnotherAnnotation()) return;
        const annotation = {
          x,
          y,
          title: placementData.title,
          description: placementData.description,
          type: placementData.type,
          shape: placementData.shape || "rectangle",
        };
        if (currentIsArea) {
          annotation.widthRel = current.defaultSize.width / bounds.width;
          annotation.heightRel = current.defaultSize.height / bounds.height;
        }
        commitAnnotation(annotation);
      },
      { signal },
    );
  }

  // The arrow is placed with two clicks - tail, then head - so the preview is
  // a rubber band from the first click to the pointer.
  function startArrowPlacement(style, signal) {
    const svg = ctx.doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "arrow-placement-preview");
    Object.assign(svg.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "1000", overflow: "visible" });
    const line = ctx.doc.createElementNS(SVG_NS, "line");
    line.setAttribute("stroke", style.border);
    line.setAttribute("stroke-width", `${style.strokeWidth || 3}`);
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-dasharray", "8 6");
    svg.appendChild(line);
    wrapper.appendChild(svg);
    arrowPreview = svg;
    wrapper.style.cursor = "crosshair";

    wrapper.addEventListener(
      "mousemove",
      (event) => {
        if (!arrowTailPoint || !arrowPreview) return;
        const point = toLocal(wrapper, event.clientX, event.clientY);
        line.setAttribute("x2", `${point.x}`);
        line.setAttribute("y2", `${point.y}`);
      },
      { signal },
    );
    wrapper.addEventListener(
      "click",
      (event) => {
        if (!active || !placementData) return;
        const point = imageRelativePoint(event.clientX, event.clientY);
        if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
          cleanupPlacementMode();
          return;
        }
        const local = toLocal(wrapper, event.clientX, event.clientY);
        if (!arrowTailPoint) {
          arrowTailPoint = point;
          ["x1", "x2"].forEach((name) => line.setAttribute(name, `${local.x}`));
          ["y1", "y2"].forEach((name) => line.setAttribute(name, `${local.y}`));
          return;
        }
        const length = Math.hypot(local.x - Number.parseFloat(line.getAttribute("x1")), local.y - Number.parseFloat(line.getAttribute("y1")));
        if (length * getScale(wrapper) < MIN_ARROW_LENGTH_PX) return;
        if (!hasRoomForAnotherAnnotation()) return;
        commitAnnotation({
          x: arrowTailPoint.x,
          y: arrowTailPoint.y,
          x2: point.x,
          y2: point.y,
          title: placementData.title,
          description: placementData.description,
          type: placementData.type,
        });
      },
      { signal },
    );
  }

  return { cleanupPlacementMode, startAddAnnotationModeWithData, isPlacementModeActive: () => active };
}
