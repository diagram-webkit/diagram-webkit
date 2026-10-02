import { describe, expect, it } from "vitest";
import {
  JOIN_RADIUS,
  LineOverlayError,
  boxEntries,
  parseFlag,
  centreLine,
  extendToArrowTips,
  layoutOverlays,
  offsetLine,
  parsePathData,
  type Box,
  type LinePoint,
  type OverlayLine,
} from "../src/core/line-overlays";

const pts = (...xy: number[][]): LinePoint[] => xy.map(([x, y, r = 0]) => ({ x, y, r }));
const round = (points: LinePoint[]) => points.map(({ x, y, r }) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100, r]);
const line = (id: string, points: LinePoint[], overlays: string[], arrows = { start: false, end: true }): OverlayLine => ({ id, points, overlays, arrows });
const widths = new Map([
  ["egress", 12],
  ["ingress", 12],
]);
// The points a band's path data runs through ([x, y]; an arc's end point),
// and its arcs' radii.
const coords = (d: string) => (d.match(/[MLA][^MLA]*/g) || []).map((part) => part.trim().split(/\s+/).slice(1).map(Number).slice(-2));
const radii = (d: string) => (d.match(/A [^A-Z]*/g) || []).map((arc) => Number(arc.split(/\s+/)[1]));

describe("path data", () => {
  it("reads absolute, relative and shorthand commands", () => {
    expect(parsePathData("m 10 10 h 5 v 5 L 0 0 z")).toEqual([
      { type: "M", to: { x: 10, y: 10 } },
      { type: "L", to: { x: 15, y: 10 } },
      { type: "L", to: { x: 15, y: 15 } },
      { type: "L", to: { x: 0, y: 0 } },
      { type: "Z" },
    ]);
    expect(parsePathData("M0 0 10 0")[1]).toEqual({ type: "L", to: { x: 10, y: 0 } });
    expect(() => parsePathData("M 0 0 X 1")).toThrow(LineOverlayError);
  });

  it("turns draw.io rounded corners into corners with a radius", () => {
    // Down, then a rounded turn to the left, as draw.io writes it.
    expect(round(centreLine("M 818 912 L 818 878 Q 818 868 808 868 L 355 868"))).toEqual([
      [818, 912, 0],
      [818, 868, 10],
      [355, 868, 0],
    ]);
  });

  it("takes the middle of a double line", () => {
    expect(round(centreLine("M 0 0 L 0 10 M 4 10 L 4 0 M 4 10"))).toEqual([
      [2, 0, 0],
      [2, 10, 0],
    ]);
  });

  it("extends a line to its arrow tips and reports them", () => {
    // draw.io's classic arrow: tip 5.25 beyond the line end, wings 3.5 to each side 7 back.
    const outline = [
      { x: 105.25, y: 0 },
      { x: 98.25, y: 3.5 },
      { x: 100, y: 0 },
      { x: 98.25, y: -3.5 },
    ];
    const unstroked = extendToArrowTips(pts([0, 0], [100, 0]), [{ points: outline, strokeWidth: 0, miterLimit: 10 }]);
    expect(round(unstroked.points)).toEqual([
      [0, 0, 0],
      [105.25, 0, 0],
    ]);
    expect(unstroked.arrows).toEqual({ start: false, end: true });
    // With its 1 px stroke the drawn tip is 0.5 / sin(atan(3.5 / 7)) = 1.118 further: where draw.io
    // lets it touch the box.
    const stroked = extendToArrowTips(pts([0, 0], [100, 0]), [{ points: outline, strokeWidth: 1, miterLimit: 10 }]);
    expect(stroked.points[1].x).toBeCloseTo(105.25 + 0.5 / Math.sin(Math.atan(3.5 / 7)), 6);
    // Beyond the miter limit SVG bevels the corner.
    const beveled = extendToArrowTips(pts([0, 0], [100, 0]), [{ points: outline, strokeWidth: 1, miterLimit: 1 }]);
    expect(beveled.points[1].x).toBeCloseTo(105.25 + 0.5 * Math.sin(Math.atan(3.5 / 7)), 6);
  });
});

describe("offsetLine", () => {
  it("keeps a rounded corner concentric: smaller inside the turn, larger outside", () => {
    // Right, then down: a right turn (SVG y points down).
    const corner = pts([0, 0], [100, 0, 10], [100, 100]);
    expect(round(offsetLine(corner, 6))).toEqual([
      [0, 6, 0],
      [94, 6, 4],
      [94, 100, 0],
    ]);
    expect(round(offsetLine(corner, -6))).toEqual([
      [0, -6, 0],
      [106, -6, 16],
      [106, 100, 0],
    ]);
  });
});

describe("layoutOverlays", () => {
  // Line a arrives at the box from the left; line b leaves it from the bottom.
  const box: Box = { id: "box", x1: 100, y1: -20, x2: 200, y2: 20 };
  const a = line("a", pts([0, 0], [100, 0]), ["egress"]);
  const b = line("b", pts([150, 20], [150, 100]), ["egress"]);

  it("draws one band per line and joins them inside the box", () => {
    const bands = layoutOverlays([a, b], [box], widths);
    expect(bands.map(({ overlay, lines }) => [overlay, lines])).toEqual([
      ["egress", ["a"]],
      ["egress", ["b"]],
      ["egress", ["a", "b"]],
    ]);
    // The join turns where the two lines cross, as a circular arc.
    expect(bands[2].d).toBe(`M 88 0 L ${150 - JOIN_RADIUS} 0 A ${JOIN_RADIUS} ${JOIN_RADIUS} 0 0 1 150 ${JOIN_RADIUS} L 150 32`);
  });

  it("lays several overlays side by side, centred on the line", () => {
    const bands = layoutOverlays([line("a", pts([0, 0], [100, 0]), ["egress", "ingress"])], [], widths);
    expect(bands.map((band) => band.d)).toEqual(["M 0 -6 L 100 -6", "M 0 6 L 100 6"]);
    const three = layoutOverlays([line("a", pts([0, 0], [100, 0]), ["egress", "ingress", "x"])], [], new Map([...widths, ["x", 12]]));
    expect(three.map((band) => band.d)).toEqual(["M 0 -12 L 100 -12", "M 0 0 L 100 0", "M 0 12 L 100 12"]);
  });

  it("lays the bands in the property's order, the first on the left looking along the arrow", () => {
    // Drawn left to right, the arrow at the start: it points left, so "left" is below.
    const leftwards = (overlays: string[]) => layoutOverlays([line("a", pts([0, 0], [100, 0]), overlays, { start: true, end: false })], [], widths);
    expect(leftwards(["egress", "ingress"]).map((band) => [band.overlay, band.d])).toEqual([
      ["egress", "M 100 6 L 0 6"],
      ["ingress", "M 100 -6 L 0 -6"],
    ]);
    expect(leftwards(["ingress", "egress"]).map((band) => [band.overlay, band.d])).toEqual([
      ["ingress", "M 100 6 L 0 6"],
      ["egress", "M 100 -6 L 0 -6"],
    ]);
  });

  describe("a line with arrows at both ends carrying two flows", () => {
    // trunk: from the box's left edge away to the left, both ways. ingress
    // arrives at the right edge (upper), egress leaves it (lower).
    const room: Box = { id: "room", x1: 100, y1: -40, x2: 200, y2: 40 };
    const trunk = line("trunk", pts([100, 0], [0, 0]), ["ingress", "egress"], { start: true, end: true });
    const ingressIn = line("in", pts([300, -20], [200, -20]), ["ingress"]);
    const egressOut = line("out", pts([200, 20], [300, 20]), ["egress"]);
    const bands = () => layoutOverlays([trunk, ingressIn, egressOut], [room], widths);

    it("joins each flow its own way through the box", () => {
      expect(bands().filter((band) => band.lines.length === 2).map((band) => `${band.overlay}: ${band.lines.join(">")}`)).toEqual([
        "ingress: in>trunk",
        "egress: trunk>out",
      ]);
    });

    it("runs them side by side along the shared line, then parts both at the box's centre line", () => {
      const joins = bands().filter((band) => band.lines.length === 2);
      // Along the trunk (drawn leftwards): ingress on its left (below, y 6), egress above (y -6).
      const ingress = coords(joins[0].d);
      const egress = coords(joins[1].d);
      expect(ingress[ingress.length - 1]).toEqual([88, 6]);
      expect(egress[0]).toEqual([88, -6]);
      // Both cross over on the centre line, x 150: each has a vertical stretch there.
      const crossing = (points: number[][]) => points.filter(([x], index) => x === 150 && index > 0 && points[index - 1][0] === 150);
      expect(crossing(ingress)).toHaveLength(1);
      expect(crossing(egress)).toHaveLength(1);
      expect(joins[1].d).toBe("M 88 -6 L 140 -6 A 10 10 0 0 1 150 4 L 150 10 A 10 10 0 0 0 160 20 L 212 20");
    });
  });

  it("turns bands that stay together concentrically", () => {
    const aa = line("a", pts([0, 0], [100, 0]), ["egress", "ingress"]);
    const bb = line("b", pts([150, 20], [150, 100]), ["egress", "ingress"]);
    const joins = layoutOverlays([aa, bb], [box], widths).filter((band) => band.lines.length === 2);
    // Right turn: egress (left, outside) wider, ingress (right, inside) tighter, one centre.
    expect(joins.map((band) => radii(band.d))).toEqual([[JOIN_RADIUS + 6], [JOIN_RADIUS - 6]]);
  });

  it("makes no way through an overlay-destination box", () => {
    const joins = (destination: boolean) =>
      layoutOverlays([a, b], [{ ...box, destination }], widths).filter((band) => band.lines.length === 2).length;
    expect([joins(false), joins(true)]).toEqual([1, 0]);
  });

  it("does not join two lines that both leave a box", () => {
    const left = line("left", pts([100, 0], [0, 0]), ["egress"]);
    const right = line("right", pts([200, 0], [300, 0]), ["egress"]);
    expect(layoutOverlays([left, right], [box], widths)).toHaveLength(2);
    const into = line("into", pts([150, -100], [150, -20]), ["egress"]);
    expect(layoutOverlays([into, left, right], [box], widths).map((band) => band.lines.join(">"))).toEqual(["into", "left", "right", "into>left", "into>right"]);
  });

  it("gives a line end to the box whose border it sits on, not a smaller box just inside it", () => {
    // A small box 3px inside the right edge of `box`, where line c leaves it.
    const inner: Box = { id: "inner", x1: 160, y1: 0, x2: 197, y2: 18 };
    const c = line("c", pts([200, 10], [300, 10]), ["egress"]);
    const joins = layoutOverlays([a, c], [box, inner], widths).filter((band) => band.lines.length === 2);
    expect(joins.map((band) => band.lines.join(">"))).toEqual(["a>c"]);
    // A line that ends on the small box's own border still belongs to it.
    const d = line("d", pts([197, 60], [197, 18]), ["egress"]);
    const e = line("e", pts([160, 10], [130, 10]), ["egress"]);
    expect(layoutOverlays([d, e], [box, inner], widths).filter((band) => band.lines.length === 2).map((band) => band.lines.join(">"))).toEqual(["d>e"]);
  });

  it("joins only overlays both lines have", () => {
    const bands = layoutOverlays([line("a", pts([0, 0], [100, 0]), ["egress", "ingress"]), b], [box], widths);
    expect(bands.filter((band) => band.lines.length === 2).map((band) => band.overlay)).toEqual(["egress"]);
  });
});

describe("boxEntries", () => {
  // A line from x=0 to x=400 at y=50, under three boxes; it ends at the last.
  const line = [{ x: 0, y: 50 }, { x: 400, y: 50 }];
  const rect = (id: string, x1: number, x2: number, ellipse = false): Box => ({ id, x1, y1: 30, x2, y2: 70, ellipse });

  it("finds where the line enters each box, in order, tip at the edge", () => {
    const entries = boxEntries(line, [rect("b2", 200, 260), rect("b1", 100, 160), rect("end", 380, 440)]);
    expect(entries).toEqual([
      { box: "b1", tip: { x: 100, y: 50 }, dir: { x: 1, y: 0 } },
      { box: "b2", tip: { x: 200, y: 50 }, dir: { x: 1, y: 0 } },
    ]);
  });

  it("is exact on ellipses", () => {
    // Centre (130, 50), rx 30: entered at x=100; off-centre it is inside the bounds.
    const centre = boxEntries(line, [rect("e", 100, 160, true)])[0].tip;
    expect([centre.x, centre.y]).toEqual([expect.closeTo(100, 6), 50]);
    const high = boxEntries([{ x: 0, y: 40 }, { x: 400, y: 40 }], [rect("e", 100, 160, true)])[0].tip;
    expect(high.x).toBeCloseTo(130 - 30 * Math.sqrt(1 - (10 / 20) ** 2), 6);
  });

  it("leaves out the boxes the line starts or ends at, and lines that only touch", () => {
    expect(boxEntries(line, [rect("start", -20, 40), rect("end", 380, 440)])).toEqual([]);
    expect(boxEntries([{ x: 0, y: 30 }, { x: 400, y: 30 }], [{ id: "above", x1: 100, y1: 0, x2: 160, y2: 29 }])).toEqual([]);
  });

  it("counts every entry of a line that comes back into a box", () => {
    const zigzag = [{ x: 0, y: 50 }, { x: 300, y: 50 }, { x: 300, y: 150 }, { x: 0, y: 150 }, { x: 0, y: 250 }];
    const tall = { id: "tall", x1: 100, y1: 30, x2: 200, y2: 170 };
    expect(boxEntries(zigzag, [tall]).map((entry) => [entry.tip, entry.dir])).toEqual([
      [{ x: 100, y: 50 }, { x: 1, y: 0 }],
      [{ x: 200, y: 150 }, { x: -1, y: 0 }],
    ]);
  });

  it("reads the property", () => {
    expect([parseFlag("true"), parseFlag(" TRUE "), parseFlag("false"), parseFlag("yes"), parseFlag(null)]).toEqual([true, true, false, null, null]);
  });
});
