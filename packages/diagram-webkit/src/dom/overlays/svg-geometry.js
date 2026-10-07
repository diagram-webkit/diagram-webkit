// Reading draw.io geometry from attributes (path data, shape attributes,
// transforms), not from layout: cells may already be display:none. Shared by
// the line overlays and the box arrows.
import { excludingExampleMarkers } from "../../core/help";
import { LineOverlayError, arrowheadsAtEnds, boundsOf, centreLine, extendToArrowTips, parseFlag, pathVertices } from "../../core/line-overlays";

// draw.io writes type="edge" / type="vertex" on every cell.
export const CELL_TYPE_ATTR = "type";
const SHAPES = excludingExampleMarkers("rect, ellipse, circle, path, polygon, polyline, line, image");
// Label parts: draw.io's <switch> holds the foreignObject and a fallback <text>.
const NOT_SHAPE = "switch, foreignObject, text";

export const warn = (message) => console.warn(`diagram-webkit: line overlay: ${message}`);
export const byId = (svg, id) => svg.querySelector(`[id="${id.replace(/["\\]/g, "\\$&")}"]`);

export function cellName(element, metadata) {
  return element.getAttribute(metadata.idAttr) || element.id || element.closest("[id]")?.id || "(no id)";
}

// From an element's own coordinates to the diagram's root coordinates.
export function rootMatrix(element, svg) {
  const DOMMatrix = svg.ownerDocument.defaultView.DOMMatrix;
  let matrix = new DOMMatrix();
  for (let node = element; node && node !== svg; node = node.parentElement) {
    const list = /** @type {SVGGraphicsElement} */ (node).transform?.baseVal;
    if (!list) continue;
    // Not consolidate(): that rewrites the element's transform attribute.
    let own = new DOMMatrix();
    for (let index = 0; index < list.numberOfItems; index++) own = own.multiply(DOMMatrix.fromMatrix(list.getItem(index).matrix));
    matrix = own.multiply(matrix);
  }
  return matrix;
}

export function toRoot(element, svg) {
  const matrix = rootMatrix(element, svg);
  return (point) => {
    const p = matrix.transformPoint({ x: point.x, y: point.y });
    return { ...point, x: p.x, y: p.y };
  };
}

const num = (element, name) => Number.parseFloat(element.getAttribute(name) || "0");

function shapePoints(shape) {
  switch (shape.localName) {
    case "rect":
    case "image": {
      const [x, y, w, h] = ["x", "y", "width", "height"].map((name) => num(shape, name));
      return [{ x, y }, { x: x + w, y }, { x, y: y + h }, { x: x + w, y: y + h }];
    }
    case "ellipse":
    case "circle": {
      const cx = num(shape, "cx");
      const cy = num(shape, "cy");
      const rx = shape.localName === "circle" ? num(shape, "r") : num(shape, "rx");
      const ry = shape.localName === "circle" ? num(shape, "r") : num(shape, "ry");
      return [{ x: cx - rx, y: cy - ry }, { x: cx + rx, y: cy + ry }];
    }
    case "line":
      return [{ x: num(shape, "x1"), y: num(shape, "y1") }, { x: num(shape, "x2"), y: num(shape, "y2") }];
    case "polygon":
    case "polyline":
      return pathVertices(`M ${shape.getAttribute("points") || ""}`).flat();
    default:
      return pathVertices(shape.getAttribute("d") || "").flat();
  }
}

// A shape covers what is under it unless it has no paint inside.
function isFilled(shape) {
  if (shape.localName === "image") return true;
  if (shape.localName === "line" || shape.localName === "polyline") return false;
  const fill = (shape.style.getPropertyValue("fill") || shape.getAttribute("fill") || "black").trim();
  const opacity = shape.getAttribute("fill-opacity") ?? shape.style.getPropertyValue("fill-opacity");
  return fill !== "none" && fill !== "transparent" && !(opacity !== null && opacity !== "" && Number.parseFloat(opacity) === 0);
}

/**
 * The drawn outline of every box (draw.io vertex), without its label: a
 * label's foreignObject spans the whole diagram.
 * @returns {{ element: Element, box: import("../../core/line-overlays").Box, filled: boolean }[]}
 */
export function readBoxes(svg, metadata) {
  const boxes = [];
  svg.querySelectorAll(`[${CELL_TYPE_ATTR}="vertex"]`).forEach((cell) => {
    const points = [];
    const shapes = Array.from(cell.querySelectorAll(SHAPES)).filter((shape) => shape.closest(`[${CELL_TYPE_ATTR}]`) === cell && !shape.closest(NOT_SHAPE));
    shapes.forEach((shape) => {
      try {
        points.push(...shapePoints(shape).map(toRoot(shape, svg)));
      } catch (error) {
        if (!(error instanceof LineOverlayError)) throw error;
        warn(`box ${cellName(cell, metadata)} left out: ${error.message}`);
      }
    });
    if (points.length === 0) return;
    const box = boundsOf(cell.id || cellName(cell, metadata), points);
    if (shapes.length === 1 && (shapes[0].localName === "ellipse" || shapes[0].localName === "circle")) box.ellipse = true;
    const destination = cell.getAttribute(metadata.overlayDestinationAttr);
    if (destination !== null) {
      const flag = parseFlag(destination);
      if (flag === null) warn(`overlay-destination on ${cellName(cell, metadata)} ignored: must be true or false, got "${destination}"`);
      else box.destination = flag;
    }
    boxes.push({ element: cell, box, filled: shapes.some(isFilled) });
  });
  return boxes;
}

// The stroke a path is drawn with, in root units (its transforms scale it).
function strokeOf(path, svg) {
  const stroke = path.style.getPropertyValue("stroke") || path.getAttribute("stroke") || "none";
  const width = stroke === "none" ? 0 : Number.parseFloat(path.style.getPropertyValue("stroke-width") || path.getAttribute("stroke-width") || "1");
  const miter = Number.parseFloat(path.style.getPropertyValue("stroke-miterlimit") || path.getAttribute("stroke-miterlimit") || "4");
  const m = rootMatrix(path, svg);
  return { strokeWidth: width * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)), miterLimit: miter };
}

/**
 * Centre line from drawn arrow tip to drawn arrow tip, in root coordinates,
 * which ends have an arrowhead, and the paths that draw them.
 * @returns {{ points: import("../../core/line-overlays").LinePoint[], arrows: { start: boolean, end: boolean }, heads: { start: SVGPathElement[], end: SVGPathElement[] } }}
 */
export function readLine(element, svg) {
  const [linePath, ...headPaths] = /** @type {SVGPathElement[]} */ (Array.from(element.querySelectorAll("path")));
  if (!linePath) throw new LineOverlayError("no path to follow");
  const centre = centreLine(linePath.getAttribute("d") || "").map(toRoot(linePath, svg));
  const headPoints = headPaths.map((path) => ({ points: pathVertices(path.getAttribute("d") || "").flat().map(toRoot(path, svg)), ...strokeOf(path, svg) }));
  const { points, arrows } = extendToArrowTips(centre, headPoints);
  const at = arrowheadsAtEnds(centre[0], centre[centre.length - 1], headPoints);
  return { points, arrows, heads: { start: at.start.map((index) => headPaths[index]), end: at.end.map((index) => headPaths[index]) } };
}
