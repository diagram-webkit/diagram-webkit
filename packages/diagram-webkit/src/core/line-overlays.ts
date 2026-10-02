// Geometry of line overlays: translucent bands drawn along lines with the
// property overlay=<name>, styled like the line with overlay-definition=<name>
// (docs/user-guide.md#lines-overlays).
// Pure: points and boxes come in root coordinates, path data goes out.
//
// - A band runs from arrow tip to arrow tip, so it reaches what the line points at.
// - Arrows give the direction of flow: a line with an arrow at one end flows
//   towards it; one with arrows at both ends or none takes its direction from
//   the lines it meets. Where a line arrives at a box and another leaves it
//   (or they meet at a point), their bands are joined inside the box.
// - Several overlays on one line lie side by side, centred on the line. Lines
//   are oriented along their joins, so each band keeps its side through a flow
//   however the lines were drawn.

// An overlay property's value: names separated by commas or spaces, in order,
// without duplicates.
export function parseOverlayNames(value: string | null | undefined): string[] {
  return Array.from(new Set(`${value || ""}`.split(/[\s,]+/).filter(Boolean)));
}

// A true/false property (arrow-at-each-box, overlay-destination): "true" or
// "false" in any case, else null.
export function parseFlag(value: string | null | undefined): boolean | null {
  const text = `${value ?? ""}`.trim().toLowerCase();
  return text === "true" ? true : text === "false" ? false : null;
}

// Path data or geometry that cannot be drawn as an overlay.
export class LineOverlayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LineOverlayError";
  }
}

export interface Point {
  x: number;
  y: number;
}

// r: radius of the rounded corner at this point, 0 for a sharp one.
export interface LinePoint extends Point {
  r: number;
}

export interface Box {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  // The box is an ellipse inscribed in the bounds (entries are exact).
  ellipse?: boolean;
  // overlay-destination: bands go to and from it, never through it.
  destination?: boolean;
}

// Where a line enters a box that covers it, for an arrowhead there.
export interface BoxEntry {
  box: string;
  tip: Point;
  dir: Point;
}

// An arrowhead as drawn: its outline (root coordinates, in path order) and
// the stroke around it. The drawn tip lies beyond the outline's tip by the
// stroke's miter (or bevel), as SVG strokes it: draw.io places an arrow so
// that the drawn tip touches the box (1.12 px beyond for its 1 px classic).
export interface Arrowhead {
  points: Point[];
  strokeWidth: number;
  miterLimit: number;
}

// Which ends of a line have an arrowhead.
export interface Arrows {
  start: boolean;
  end: boolean;
}

export interface OverlayLine {
  id: string;
  points: LinePoint[];
  arrows: Arrows;
  // Overlay names, in the order the bands are laid out.
  overlays: string[];
}

export interface OverlayBand {
  overlay: string;
  // Lines whose visibility the band follows.
  lines: string[];
  d: string;
}

// draw.io lines are often a fraction of a degree off axis; within ~6 degrees counts as parallel.
const PARALLEL_SIN = 0.1;
// How far an arrowhead may sit from the line end it belongs to.
const ARROW_REACH = 12;
// How far a line end may sit from the border of the box it ends at, and how
// close two line ends must be to meet without a box.
const BORDER_REACH = 4;
// Line ends this much nearer one box border than another count as on both.
const BORDER_TIE = 0.5;
const CURVE_STEPS = 12;
// Corner radius where a join turns inside a box (draw.io's rounded edges use 10).
export const JOIN_RADIUS = 10;
const EPSILON = 0.01;

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const along = (p: Point, dir: Point, t: number): Point => ({ x: p.x + dir.x * t, y: p.y + dir.y * t });
const rightNormal = (dir: Point): Point => ({ x: -dir.y, y: dir.x });

function unit(v: Point): Point {
  const length = Math.hypot(v.x, v.y);
  if (length < EPSILON) throw new LineOverlayError(`zero-length direction (${v.x}, ${v.y})`);
  return { x: v.x / length, y: v.y / length };
}

type Segment =
  | { type: "M" | "L" | "A"; to: Point }
  | { type: "Q"; c: Point; to: Point }
  | { type: "C"; c1: Point; c2: Point; to: Point }
  | { type: "Z" };

const PARAM_COUNT: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

// SVG path data as absolute segments. H/V become L, S/T their full forms;
// an arc keeps only its end point (draw.io uses arcs for line jumps).
export function parsePathData(d: string): Segment[] {
  const tokens = d.match(/[a-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) || [];
  const segments: Segment[] = [];
  let i = 0;
  let command = "";
  let current: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let lastControl: Point | null = null;
  let lastType = "";
  const num = () => {
    const value = Number.parseFloat(tokens[i++]);
    if (!Number.isFinite(value)) throw new LineOverlayError(`bad number in path data "${d}"`);
    return value;
  };
  while (i < tokens.length) {
    if (/^[a-z]$/i.test(tokens[i])) command = tokens[i++];
    else if (!command) throw new LineOverlayError(`path data must start with a command: "${d}"`);
    const upper = command.toUpperCase();
    if (!(upper in PARAM_COUNT)) throw new LineOverlayError(`unsupported path command ${command} in "${d}"`);
    const relative = command !== upper;
    const point = (): Point => {
      const x = num();
      const y = num();
      return relative ? { x: current.x + x, y: current.y + y } : { x, y };
    };
    const reflected = (): Point => (lastControl && lastType === upper.replace("S", "C").replace("T", "Q") ? { x: 2 * current.x - lastControl.x, y: 2 * current.y - lastControl.y } : current);
    let segment: Segment;
    switch (upper) {
      case "M":
        segment = { type: "M", to: point() };
        start = segment.to;
        // Further pairs after M are line-tos.
        command = relative ? "l" : "L";
        break;
      case "L":
        segment = { type: "L", to: point() };
        break;
      case "H": {
        const x = num();
        segment = { type: "L", to: { x: relative ? current.x + x : x, y: current.y } };
        break;
      }
      case "V": {
        const y = num();
        segment = { type: "L", to: { x: current.x, y: relative ? current.y + y : y } };
        break;
      }
      case "Q": {
        const c = point();
        segment = { type: "Q", c, to: point() };
        break;
      }
      case "T":
        segment = { type: "Q", c: reflected(), to: point() };
        break;
      case "C": {
        const c1 = point();
        const c2 = point();
        segment = { type: "C", c1, c2, to: point() };
        break;
      }
      case "S": {
        const c1 = reflected();
        const c2 = point();
        segment = { type: "C", c1, c2, to: point() };
        break;
      }
      case "A": {
        i += 5;
        segment = { type: "A", to: point() };
        break;
      }
      default:
        segment = { type: "Z" };
    }
    segments.push(segment);
    lastType = segment.type;
    lastControl = segment.type === "Q" ? segment.c : segment.type === "C" ? segment.c2 : null;
    current = segment.type === "Z" ? start : segment.to;
    if (upper === "Z") command = "";
  }
  return segments;
}

// Every point a path passes or is pulled towards, per subpath: for bounds and arrowheads.
export function pathVertices(d: string): Point[][] {
  const subpaths: Point[][] = [];
  parsePathData(d).forEach((segment) => {
    if (segment.type === "M") subpaths.push([segment.to]);
    else if (segment.type === "Q") subpaths[subpaths.length - 1].push(segment.c, segment.to);
    else if (segment.type === "C") subpaths[subpaths.length - 1].push(segment.c1, segment.c2, segment.to);
    else if (segment.type !== "Z") subpaths[subpaths.length - 1].push(segment.to);
  });
  return subpaths;
}

function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return { x: w[0] * p0.x + w[1] * p1.x + w[2] * p2.x + w[3] * p3.x, y: w[0] * p0.y + w[1] * p1.y + w[2] * p2.y + w[3] * p3.y };
}

// draw.io draws a rounded corner as L to where the rounding starts, then Q
// with the corner as control point. Such a Q (one that starts on the way to
// its control point) becomes that corner, with the shorter arm as radius:
// draw.io shortens one arm when a leg is short. Any other curve is sampled.
type RoundingPoint = LinePoint & { ends?: boolean };

function subpathLines(d: string): LinePoint[][] {
  const subpaths: RoundingPoint[][] = [];
  let line: RoundingPoint[] = [];
  parsePathData(d).forEach((segment) => {
    if (segment.type === "M") {
      line = [{ ...segment.to, r: 0 }];
      subpaths.push(line);
      return;
    }
    const from = line[line.length - 1];
    if (segment.type === "Q") {
      const before = line.length > 1 ? line[line.length - 2] : null;
      const onTheWay = before && distance(before, from) > EPSILON && distance(from, segment.c) > EPSILON && Math.abs(cross(unit(sub(from, before)), unit(sub(segment.c, from)))) < PARALLEL_SIN;
      if (onTheWay) {
        const r = Math.min(distance(from, segment.c), distance(segment.c, segment.to));
        line.pop();
        line.push({ ...segment.c, r }, { ...segment.to, r: 0, ends: true });
        return;
      }
      for (let step = 1; step <= CURVE_STEPS; step++) line.push({ ...cubicAt(from, segment.c, segment.c, segment.to, step / CURVE_STEPS), r: 0 });
    } else if (segment.type === "C") {
      for (let step = 1; step <= CURVE_STEPS; step++) line.push({ ...cubicAt(from, segment.c1, segment.c2, segment.to, step / CURVE_STEPS), r: 0 });
    } else if (segment.type === "Z") line.push({ ...line[0], r: 0 });
    else line.push({ ...segment.to, r: 0 });
  });
  // A point that only ends a rounding lies on the next segment.
  return subpaths
    .map((points) => points.filter((p, index) => !(p.ends && index < points.length - 1)).map(({ x, y, r }) => ({ x, y, r })))
    .map(withoutDuplicates)
    .filter((points) => points.length > 1);
}

function withoutDuplicates<T extends Point>(points: T[]): T[] {
  return points.filter((p, index) => index === 0 || distance(p, points[index - 1]) > EPSILON);
}

// The centre line of a line's path. draw.io's double lines ("link" shape) are
// two parallel subpaths drawn in opposite directions; their centre is the average.
export function centreLine(d: string): LinePoint[] {
  const subpaths = subpathLines(d);
  if (subpaths.length === 0) throw new LineOverlayError(`no line in path data "${d}"`);
  const [first, second] = subpaths;
  if (second && second.length === first.length) {
    const back = [...second].reverse();
    return first.map((p, index) => ({ x: (p.x + back[index].x) / 2, y: (p.y + back[index].y) / 2, r: p.r }));
  }
  return first;
}

// Indexes of the arrowheads drawn at each end of a line from `start` to
// `end`. A head belongs to the end it is nearest, so on a short line one head
// is not taken for both.
export function arrowheadsAtEnds(start: Point, end: Point, arrowheads: readonly Arrowhead[]): { start: number[]; end: number[] } {
  const out = { start: [] as number[], end: [] as number[] };
  arrowheads.forEach((head, index) => {
    const near = (p: Point) => Math.min(...head.points.map((q) => distance(q, p)));
    const toStart = near(start);
    const toEnd = near(end);
    if (Math.min(toStart, toEnd) > ARROW_REACH) return;
    (toEnd <= toStart ? out.end : out.start).push(index);
  });
  return out;
}

// How far along `dir` from `end` the drawn arrowhead reaches: its outline's
// furthest corner plus what the stroke adds there (SVG miter join, or bevel
// beyond the miter limit).
export function drawnReach(head: Arrowhead, end: Point, dir: Point): number {
  const pts = head.points;
  let index = 0;
  pts.forEach((p, i) => {
    if (dot(sub(p, end), dir) > dot(sub(pts[index], end), dir)) index = i;
  });
  const tip = pts[index];
  const outline = dot(sub(tip, end), dir);
  const half = head.strokeWidth / 2;
  if (!(half > 0) || pts.length < 3) return outline + Math.max(0, half);
  const n = pts.length;
  const neighbours = [pts[(index - 1 + n) % n], pts[(index + 1) % n]].filter((p) => distance(p, tip) > EPSILON);
  if (neighbours.length < 2) return outline + half;
  const a = unit(sub(neighbours[0], tip));
  const b = unit(sub(neighbours[1], tip));
  const sinHalf = Math.sin(Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) / 2);
  if (sinHalf < EPSILON) return outline + half;
  const outward = { x: -(a.x + b.x), y: -(a.y + b.y) };
  const along = Math.hypot(outward.x, outward.y) < EPSILON ? 1 : Math.max(0, dot(unit(outward), dir));
  const extra = 1 / sinHalf <= head.miterLimit ? half / sinHalf : half * sinHalf;
  return outline + extra * along;
}

// Moves both ends of a line forward to the drawn tips of the arrowheads at
// them (where draw.io lets them touch the box), and says which ends have one.
export function extendToArrowTips(points: LinePoint[], arrowheads: Arrowhead[]): { points: LinePoint[]; arrows: Arrows } {
  const out = points.map((p) => ({ ...p }));
  const last = out.length - 1;
  const at = arrowheadsAtEnds(out[0], out[last], arrowheads);
  // How far the arrowheads at `end` reach beyond it; null without one.
  const reachFor = (indexes: number[], end: Point, dir: Point) =>
    indexes.length === 0 ? null : indexes.reduce((reach, index) => Math.max(reach, drawnReach(arrowheads[index], end, dir)), 0);
  const endDir = unit(sub(out[last], out[last - 1]));
  const startDir = unit(sub(out[0], out[1]));
  const endReach = reachFor(at.end, out[last], endDir);
  const startReach = reachFor(at.start, out[0], startDir);
  out[last] = { ...along(out[last], endDir, endReach ?? 0), r: 0 };
  out[0] = { ...along(out[0], startDir, startReach ?? 0), r: 0 };
  return { points: out, arrows: { start: startReach !== null, end: endReach !== null } };
}

export function boundsOf(id: string, points: readonly Point[]): Box {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { id, x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

const area = (box: Box) => (box.x2 - box.x1) * (box.y2 - box.y1);
const inBox = (box: Box, p: Point, tolerance: number) => p.x >= box.x1 - tolerance && p.x <= box.x2 + tolerance && p.y >= box.y1 - tolerance && p.y <= box.y2 + tolerance;
const boxCentre = (box: Box): Point => ({ x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 });

// The box whose border a line end sits on, entering it along `dir`: the
// nearest border, so a small box just inside its parent's edge does not take
// the parent's lines; of borders equally near, the smallest box.
function boxAtEnd(boxes: readonly Box[], end: Point, dir: Point): Box | null {
  const ahead = along(end, dir, BORDER_REACH);
  let best: Box | null = null;
  let bestToBorder = Infinity;
  for (const box of boxes) {
    if (!inBox(box, end, BORDER_REACH) || !inBox(box, ahead, 0)) continue;
    const toBorder = Math.min(Math.abs(end.x - box.x1), Math.abs(box.x2 - end.x), Math.abs(end.y - box.y1), Math.abs(box.y2 - end.y));
    if (toBorder > BORDER_REACH) continue;
    const nearer = toBorder < bestToBorder - BORDER_TIE;
    const asNear = Math.abs(toBorder - bestToBorder) <= BORDER_TIE;
    if (!best || nearer || (asNear && area(box) < area(best))) {
      best = box;
      bestToBorder = toBorder;
    }
  }
  return best;
}

// Where the segment from `p` to `q` enters `box` from outside, as a fraction
// of the segment (0 < t <= 1), or null.
function entryOn(p: Point, q: Point, box: Box): number | null {
  const d = sub(q, p);
  if (box.ellipse) {
    const cx = (box.x1 + box.x2) / 2;
    const cy = (box.y1 + box.y2) / 2;
    const rx = (box.x2 - box.x1) / 2;
    const ry = (box.y2 - box.y1) / 2;
    if (!(rx > 0) || !(ry > 0)) return null;
    const ox = (p.x - cx) / rx;
    const oy = (p.y - cy) / ry;
    const dx = d.x / rx;
    const dy = d.y / ry;
    const a = dx * dx + dy * dy;
    const c = ox * ox + oy * oy - 1;
    if (c <= 0 || a === 0) return null; // starts inside, or no length
    const disc = (ox * dx + oy * dy) ** 2 - a * c;
    if (disc < 0) return null;
    const t = (-(ox * dx + oy * dy) - Math.sqrt(disc)) / a;
    return t > 0 && t <= 1 ? t : null;
  }
  // Liang-Barsky: the part of the segment inside the box is [enter, exit].
  let enter = 0;
  let exit = 1;
  const edges: [number, number][] = [
    [-d.x, p.x - box.x1],
    [d.x, box.x2 - p.x],
    [-d.y, p.y - box.y1],
    [d.y, box.y2 - p.y],
  ];
  for (const [toward, room] of edges) {
    if (toward === 0) {
      if (room < 0) return null;
      continue;
    }
    const t = room / toward;
    if (toward < 0) enter = Math.max(enter, t);
    else exit = Math.min(exit, t);
  }
  return enter > 0 && enter <= exit ? enter : null;
}

// Every place, in order along the line, where it enters one of `boxes` (the
// boxes that cover it). The boxes it starts or ends at are left out: its own
// arrowheads are there.
export function boxEntries(points: readonly Point[], boxes: readonly Box[]): BoxEntry[] {
  const start = points[0];
  const end = points[points.length - 1];
  const found: (BoxEntry & { at: number })[] = [];
  boxes
    .filter((box) => !inBox(box, start, BORDER_REACH) && !inBox(box, end, BORDER_REACH))
    .forEach((box) => {
      for (let index = 1; index < points.length; index++) {
        const p = points[index - 1];
        const q = points[index];
        if (distance(p, q) < EPSILON) continue;
        const t = entryOn(p, q, box);
        if (t === null) continue;
        found.push({ box: box.id, tip: along(p, sub(q, p), t), dir: unit(sub(q, p)), at: index - 1 + t });
      }
    });
  return found.sort((a, b) => a.at - b.at).map(({ box, tip, dir }) => ({ box, tip, dir }));
}

// A band's way through a box: from where it arrives at `a` along `aDir`
// to where it leaves at `b` along `bDir`, both already at the band's own
// offset (oA and oB: right of travel, negative left).
// - At right angles: one corner where the band's two lines cross.
// - Parallel (straight on with a step, or a U-turn): across at the box's
//   centre line. Bands that stay side by side (same offset on both lines)
//   cross concentrically, keeping their distance; bands that part (different
//   offsets: a shared line forks) all turn at exactly the centre line.
// Corners are rounded concentrically: tighter inside the turn, wider outside.
function bridge(a: Point, aDir: Point, oA: number, b: Point, bDir: Point, oB: number, box: Box | null): LinePoint[] {
  const radius = (turn: number, offset: number) => Math.max(0, JOIN_RADIUS - Math.sign(turn) * offset);
  const sin = cross(aDir, bDir);
  if (Math.abs(sin) > PARALLEL_SIN) {
    const corner = along(a, aDir, cross(sub(b, a), bDir) / sin);
    if (!box || inBox(box, corner, ARROW_REACH)) return [{ ...corner, r: radius(sin, oA) }];
  }
  if (!box) return [];
  const centre = boxCentre(box);
  if (Math.abs(sin) > PARALLEL_SIN) return [{ ...centre, r: 0 }];
  const step = dot(sub(b, a), rightNormal(aDir));
  if (dot(aDir, bDir) > 0 && Math.abs(step) < 0.5) return [];
  // The crossing runs from a's line to b's line: its direction decides the turns.
  const across = step > 0 ? rightNormal(aDir) : { x: -rightNormal(aDir).x, y: -rightNormal(aDir).y };
  const first = cross(aDir, across);
  const second = cross(across, bDir);
  const together = Math.abs(oA - oB) < EPSILON;
  // Concentric: the crossing moves with the band's offset, as a parallel copy would.
  const shift = together ? -Math.sign(first) * oA : 0;
  const at = dot(sub(centre, a), aDir) + shift;
  return [
    { ...along(a, aDir, at), r: together ? radius(first, oA) : JOIN_RADIUS },
    { ...along(b, bDir, dot(sub(along(a, aDir, at), b), bDir)), r: together ? radius(second, oB) : JOIN_RADIUS },
  ];
}

// Parallel offset to the right of the direction of travel (negative: left).
// Corners are where the neighbouring offset segments meet (miter); a rounded
// corner keeps its centre, so its radius shrinks on the inside of the turn
// and grows on the outside. Points that would fold back (the inside of a turn
// tighter than the offset) go.
export function offsetLine(points: LinePoint[], dist: number): LinePoint[] {
  const clean = withoutDuplicates(points);
  const last = clean.length - 1;
  if (!dist) return clean;
  const shifted = (segment: number) => {
    const d = unit(sub(clean[segment + 1], clean[segment]));
    const n = rightNormal(d);
    return { a: along(clean[segment], n, dist), b: along(clean[segment + 1], n, dist), d };
  };
  const out: LinePoint[] = clean.map((p, index) => {
    if (index === 0) return { ...shifted(0).a, r: 0 };
    if (index === last) return { ...shifted(last - 1).b, r: 0 };
    const prev = shifted(index - 1);
    const next = shifted(index);
    const sin = cross(prev.d, next.d);
    if (Math.abs(sin) < EPSILON) {
      // Straight on (or a full reversal): no corner; keep the incoming side.
      return { ...prev.b, r: 0 };
    }
    const corner = along(prev.b, prev.d, cross(sub(next.a, prev.b), next.d) / sin);
    // +1 = a turn to the right (SVG y points down): the offset side is the inside.
    const turn = Math.sign(sin);
    return { ...corner, r: Math.max(0, p.r - turn * dist) };
  });
  // Drop points that run against the line: each offset segment must still
  // point the way its centre segment does.
  const kept: LinePoint[] = [out[0]];
  const keptSource: number[] = [0];
  for (let index = 1; index <= last; index++) {
    const prev = kept[kept.length - 1];
    const dir = sub(clean[index], clean[keptSource[keptSource.length - 1]]);
    if (index < last && dot(sub(out[index], prev), dir) <= 0) continue;
    kept.push(out[index]);
    keptSource.push(index);
  }
  return kept;
}

const fmt = (value: number) => `${Math.round(value * 100) / 100}`;

// Points in the middle of a straight run carry nothing, and would cap the
// radius of a corner next to them (a join meets its bands there).
function withoutStraightPoints(points: LinePoint[]): LinePoint[] {
  return points.filter((p, index) => {
    if (index === 0 || index === points.length - 1 || p.r) return true;
    const dIn = unit(sub(p, points[index - 1]));
    const dOut = unit(sub(points[index + 1], p));
    return !(Math.abs(cross(dIn, dOut)) < EPSILON && dot(dIn, dOut) > 0);
  });
}

// Corners as circular arcs: the strokes of two bands turning together are
// then exactly concentric (a quadratic's are not, and leave a sliver).
export function toPathData(points: LinePoint[]): string {
  const pts = withoutStraightPoints(withoutDuplicates(points));
  let d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
  for (let index = 1; index < pts.length; index++) {
    const p = pts[index];
    if (!p.r || index === pts.length - 1) {
      d += ` L ${fmt(p.x)} ${fmt(p.y)}`;
      continue;
    }
    const prev = pts[index - 1];
    const next = pts[index + 1];
    const dIn = unit(sub(p, prev));
    const dOut = unit(sub(next, p));
    const turn = Math.acos(Math.max(-1, Math.min(1, dot(dIn, dOut))));
    if (turn < EPSILON || Math.PI - turn < EPSILON) {
      d += ` L ${fmt(p.x)} ${fmt(p.y)}`;
      continue;
    }
    // The arc touches both legs this far from the corner; half of each leg at most.
    const tangent = Math.min(p.r * Math.tan(turn / 2), distance(p, prev) / 2, distance(next, p) / 2);
    const r = tangent / Math.tan(turn / 2);
    const a = along(p, dIn, -tangent);
    const b = along(p, dOut, tangent);
    const sweep = cross(dIn, dOut) > 0 ? 1 : 0;
    d += ` L ${fmt(a.x)} ${fmt(a.y)} A ${fmt(r)} ${fmt(r)} 0 0 ${sweep} ${fmt(b.x)} ${fmt(b.y)}`;
  }
  return d;
}

interface LineEnd {
  line: number;
  // "end" = the line's last point, "start" = its first.
  which: "start" | "end";
  at: Point;
  // Pointing out of the line, into what it touches.
  dir: Point;
  box: Box | null;
}

// Where a line end that runs into `box` meets its edge exactly: draw.io often
// ends a line a fraction of a pixel short of (or into) the box it touches.
function onEdge(end: Point, dir: Point, box: Box): Point {
  const reach = BORDER_REACH * 2;
  const from = along(end, dir, -reach);
  const t = entryOn(from, along(end, dir, reach), box);
  return t === null ? end : along(from, dir, t * reach * 2);
}

function lineEnds(lines: readonly OverlayLine[], boxes: readonly Box[]): LineEnd[] {
  return lines.flatMap((line, index) => {
    const pts = line.points;
    const last = pts.length - 1;
    const ends: Omit<LineEnd, "box">[] = [
      { line: index, which: "end", at: pts[last], dir: unit(sub(pts[last], pts[last - 1])) },
      { line: index, which: "start", at: pts[0], dir: unit(sub(pts[0], pts[1])) },
    ];
    return ends.map((end) => ({ ...end, box: boxAtEnd(boxes, end.at, end.dir) }));
  });
}

// Two line ends a flow passes between: at the same box (unless it is a
// destination), or at the same point.
function meet(a: LineEnd, b: LineEnd): boolean {
  if (a.line === b.line) return false;
  if (a.box && b.box && a.box.id === b.box.id) return !a.box.destination;
  if ((a.box && a.box.destination) || (b.box && b.box.destination)) return false;
  return distance(a.at, b.at) <= BORDER_REACH;
}


// Per overlay: whether each line carrying it is drawn against that
// overlay's flow (other lines: null). A line with an arrow at one end flows
// towards it. The others are oriented breadth-first from the lines they meet
// so that one arrives where the next leaves: first as the continuation of a
// line arriving at their box, then from any line they meet. A line with
// arrows at both ends can so carry two flows the opposite way (ingress in,
// egress out). A branch or loop that cannot agree keeps the first direction
// it got.
function orient(lines: readonly OverlayLine[], pairs: readonly [LineEnd, LineEnd][], overlay: string): (boolean | null)[] {
  const carries = (index: number) => lines[index].overlays.includes(overlay);
  const flipped: (boolean | null)[] = lines.map((line, index) => (carries(index) && line.arrows.start !== line.arrows.end ? line.arrows.start : null));
  const neighbours = lines.map(() => [] as [LineEnd, LineEnd][]);
  pairs.forEach(([a, b]) => {
    if (!carries(a.line) || !carries(b.line)) return;
    neighbours[a.line].push([a, b]);
    neighbours[b.line].push([b, a]);
  });
  const spread = (seeds: number[], fromArrivalsOnly: boolean) => {
    const queue = [...seeds];
    while (queue.length) {
      const index = queue.shift() as number;
      neighbours[index].forEach(([own, other]) => {
        if (flipped[other.line] !== null) return;
        const ownArrives = (own.which === "end") !== flipped[index];
        if (fromArrivalsOnly && !ownArrives) return;
        flipped[other.line] = (other.which === "end") === ownArrives;
        queue.push(other.line);
      });
    }
  };
  const decided = () => lines.map((_, index) => index).filter((index) => flipped[index] !== null);
  spread(decided(), true);
  spread(decided(), false);
  lines.forEach((_, index) => {
    if (!carries(index) || flipped[index] !== null) return;
    flipped[index] = false;
    spread([index], false);
  });
  return flipped;
}

// Centre offsets of the bands on a line: side by side, centred on the line.
function bandOffsets(overlays: readonly string[], widths: ReadonlyMap<string, number>): Map<string, number> {
  const total = overlays.reduce((sum, name) => sum + (widths.get(name) as number), 0);
  const offsets = new Map<string, number>();
  let left = -total / 2;
  overlays.forEach((name) => {
    const width = widths.get(name) as number;
    offsets.set(name, left + width / 2);
    left += width;
  });
  return offsets;
}

// A line's bands lie side by side in the order of its overlays, the first on
// the left, looking the way the line's arrow points (with arrows at both
// ends, or none: from where the line starts to where it ends).
const drawnAgainstArrow = (line: OverlayLine) => line.arrows.start && !line.arrows.end;

// widths: band width per overlay name (the definition line's stroke width).
export function layoutOverlays(given: readonly OverlayLine[], boxes: readonly Box[], widths: ReadonlyMap<string, number>): OverlayBand[] {
  // Ends that touch a box are moved onto its edge, so bands meet it exactly.
  const lines = given.map((line) => {
    const pts = line.points.map((p) => ({ ...p }));
    lineEnds([line], boxes).forEach((end) => {
      if (!end.box) return;
      const index = end.which === "end" ? pts.length - 1 : 0;
      pts[index] = { ...onEdge(end.at, end.dir, end.box), r: 0 };
    });
    return { ...line, points: pts };
  });
  const ends = lineEnds(lines, boxes);
  const pairs: [LineEnd, LineEnd][] = [];
  ends.forEach((a, i) => ends.slice(i + 1).forEach((b) => meet(a, b) && pairs.push([a, b])));
  const offsets = lines.map((line) => bandOffsets(line.overlays, widths));
  const bands: OverlayBand[] = [];

  lines.forEach((line, index) => {
    const points = drawnAgainstArrow(line) ? [...line.points].reverse() : line.points;
    line.overlays.forEach((overlay) => {
      bands.push({ overlay, lines: [line.id], d: toPathData(offsetLine(points, offsets[index].get(overlay) as number)) });
    });
  });

  const names = Array.from(new Set(lines.flatMap((line) => line.overlays)));
  names.forEach((overlay) => {
    const flipped = orient(lines, pairs, overlay);
    const arrives = (end: LineEnd) => (end.which === "end") !== flipped[end.line];
    // A band's offset seen along this overlay's flow: its line's layout
    // (along the arrow) may run the other way.
    const flowOffset = (line: number) => {
      const againstLayout = (flipped[line] as boolean) !== drawnAgainstArrow(lines[line]);
      return (offsets[line].get(overlay) as number) * (againstLayout ? -1 : 1);
    };
    // One join per arriving/leaving pair; two arriving or two leaving lines
    // are not a flow through the box.
    pairs.forEach((pair) => {
      const [a, b] = pair;
      if (!lines[a.line].overlays.includes(overlay) || !lines[b.line].overlays.includes(overlay)) return;
      if (arrives(a) === arrives(b)) return;
      const [into, from] = arrives(a) ? pair : [b, a];
      const box = into.box && from.box && into.box.id === from.box.id ? into.box : null;
      const out = { x: -from.dir.x, y: -from.dir.y };
      const width = widths.get(overlay) as number;
      const stub = (end: LineEnd) => {
        const pts = lines[end.line].points;
        const neighbour = end.which === "end" ? pts[pts.length - 2] : pts[1];
        return Math.min(width, distance(end.at, neighbour));
      };
      // Each end where the band itself is: its line's end, moved to its offset.
      const oIn = flowOffset(into.line);
      const oOut = flowOffset(from.line);
      const arrive = along(into.at, rightNormal(into.dir), oIn);
      const leave = along(from.at, rightNormal(out), oOut);
      const path: LinePoint[] = withoutDuplicates([
        { ...along(arrive, into.dir, -stub(into)), r: 0 },
        { ...arrive, r: 0 },
        ...bridge(arrive, into.dir, oIn, leave, out, oOut, box),
        { ...leave, r: 0 },
        { ...along(leave, out, stub(from)), r: 0 },
      ]);
      bands.push({ overlay, lines: [lines[into.line].id, lines[from.line].id], d: toPathData(path) });
    });
  });
  return bands;
}
