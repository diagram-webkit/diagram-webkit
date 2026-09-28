// Box arrows: a line with arrow-at-each-box=true (data-arrow-at-each-box)
// gets a copy of its own arrowhead where it enters each box that covers it,
// so one line reads as --> box1 --> box2 --> box3. A box covers the line when
// it is drawn after it (later in the SVG), has a fill, and is not a marker (a
// cell with a priority or info tag: the circles and "?" put on top of lines).
// The same property on a box overrides that: true always, false never. The
// boxes the line starts and ends at are left out (core boxEntries). Each copy
// is placed right after the line, at the line's depth, and follows the
// visibility of the line and of its box (line-overlays.js connects that).
import { LineOverlayError, boxEntries, parseFlag } from "../../core/line-overlays";
import { CELL_TYPE_ATTR, cellName, readLine, rootMatrix, warn } from "./svg-geometry.js";

const SVG_NS = "http://www.w3.org/2000/svg";
export const BOX_ARROW_CLASS = "dwk-box-arrow";

const matrixAttr = (m) => `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;

function direction(from, to) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
}

// The boxes `line` passes under: after it in the document and not wrapped
// around it (a container the line is drawn in); of those, the ones that say so
// (arrow-at-each-box on the box), else the filled ones that are no marker.
function coveringBoxes(line, boxes, attr, isMarker) {
  return boxes.filter(({ element, filled }) => {
    if (!(line.compareDocumentPosition(element) & 4) || element.contains(line) || line.contains(element)) return false;
    const own = parseFlag(element.getAttribute(attr));
    return own ?? (filled && !isMarker(element));
  });
}

/**
 * @param {SVGSVGElement} svg
 * @param {import("../../core/validate").MetadataAttrs} metadata
 * @param {ReturnType<typeof import("./svg-geometry.js").readBoxes>} boxes
 * @param {(ids: string[]) => string | null} linesAttr the data-lines value for these cells
 * @param {(cell: Element) => boolean} isMarker whether a box is a marker (priority or info tag)
 * @returns {{ element: SVGGElement, lines: Element[] }[]}
 */
export function drawBoxArrows(svg, metadata, boxes, linesAttr, isMarker) {
  const attr = metadata.arrowAtEachBoxAttr;
  const DOMMatrix = svg.ownerDocument.defaultView.DOMMatrix;
  const marks = [];
  svg.querySelectorAll(`[${attr}]`).forEach((line) => {
    const value = line.getAttribute(attr);
    const on = parseFlag(value);
    const name = cellName(line, metadata);
    if (on === null) {
      warn(`arrow-at-each-box on ${name} ignored: must be true or false, got "${value}"`);
      return;
    }
    if (!on) return;
    // On a box, the property says whether lines get an arrow there (coveringBoxes).
    const type = line.getAttribute(CELL_TYPE_ATTR);
    if (type === "vertex") return;
    if (type && type !== "edge") {
      warn(`arrow-at-each-box on ${name} ignored: only lines and boxes can have it (it is a ${type})`);
      return;
    }
    let read;
    try {
      read = readLine(line, svg);
    } catch (error) {
      if (!(error instanceof LineOverlayError)) throw error;
      warn(`arrow-at-each-box on ${name} left out: ${error.message}`);
      return;
    }
    // The arrowhead to repeat: the one at the end, else the one at the start
    // (the line then runs the other way).
    const forward = read.heads.end.length > 0;
    const heads = forward ? read.heads.end : read.heads.start;
    if (heads.length === 0) {
      warn(`arrow-at-each-box on ${name}: the line has no arrowhead to repeat`);
      return;
    }
    const points = forward ? read.points : [...read.points].reverse();
    const tip = points[points.length - 1];
    const angle = (dir) => (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    const own = angle(direction(points[points.length - 2], tip));

    const covering = coveringBoxes(line, boxes, attr, isMarker);
    const elementOf = new Map(covering.map(({ box, element }) => [box.id, element]));
    const toParent = rootMatrix(line.parentElement, svg).inverse();
    let after = line;
    boxEntries(points, covering.map(({ box }) => box)).forEach((entry) => {
      const box = elementOf.get(entry.box);
      const move = new DOMMatrix().translate(entry.tip.x, entry.tip.y).rotate(angle(entry.dir) - own).translate(-tip.x, -tip.y);
      const group = /** @type {SVGGElement} */ (svg.ownerDocument.createElementNS(SVG_NS, "g"));
      group.classList.add(BOX_ARROW_CLASS);
      group.setAttribute("aria-hidden", "true");
      const ids = linesAttr([line.id, box.id]);
      if (ids) group.setAttribute("data-lines", ids);
      heads.forEach((head) => {
        const copy = /** @type {Element} */ (head.cloneNode(true));
        copy.removeAttribute("id");
        copy.setAttribute("transform", matrixAttr(toParent.multiply(move).multiply(rootMatrix(head, svg))));
        group.appendChild(copy);
      });
      after.after(group);
      after = group;
      marks.push({ element: group, lines: [line, box] });
    });
  });
  return marks;
}
