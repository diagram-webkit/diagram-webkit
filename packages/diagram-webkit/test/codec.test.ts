import { describe, expect, it } from "vitest";
import {
  canonicalView,
  diffView,
  mergeView,
  normalizeState,
  parseHighlightParam,
  parseSlideSnippet,
  parseStateUrlAttribute,
  formatHighlightParam,
  resolveSlideView,
  serializeSlide,
  slideDelta,
  stateFromJson,
  stateToJson,
  stateToSearch,
  urlToState,
  viewsEqual,
  type DiagramState,
  type DiagramView,
  type Rect,
} from "../src/core";
import { goldenTagModel } from "./helpers";
import { decodeEmbeddedSvg, EmbedDecodeError, embedLinkLevel, encodeEmbeddedSvg } from "../src/dom/embed-codec.js";

function rng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAGS = ["Api", "Api.Rbac", "Network", "Network.Egress", "Logging", "pri-1", "info", "Data.Cache"];
const SLUGS = ["Rbac", "KubeApi", "WebApp", "Cache", "DbAccess"];
const DEFAULT_LEVEL = 3;

function pick<T>(random: () => number, list: readonly T[], max = list.length): T[] {
  return list.filter(() => random() < max / list.length / 2);
}

function randomRect(random: () => number): Rect {
  const round = (value: number) => Math.round(value * 10000) / 10000;
  return [round(random()), round(random()), round(0.01 + random() * 0.99), round(0.01 + random() * 0.99)];
}

function randomView(random: () => number): DiagramView {
  const view: DiagramView = {};
  const cameraRoll = random();
  if (cameraRoll < 0.3) view.camera = { fit: true };
  else if (cameraRoll < 0.8) view.camera = { rect: randomRect(random) };
  if (random() < 0.5) view.level = Math.floor(random() * DEFAULT_LEVEL);
  if (random() < 0.5) view.hiddenTags = pick(random, ["Api", "Logging", "pri-1", "Data.Cache"]);
  else if (random() < 0.3) view.onlyTags = pick(random, ["Network", "Api.Rbac"]).concat(["Data.Cache"]);
  if (random() < 0.5) view.query = ["rbac", "api server", "a,b", "ünïcode ✓"][Math.floor(random() * 4)];
  if (random() < 0.6) view.pins = pick(random, SLUGS);
  if (random() < 0.4) {
    view.highlight = { slugs: pick(random, SLUGS), tags: pick(random, TAGS) };
    if (random() < 0.5) view.highlight.mode = random() < 0.5 ? "pulse" : "dim-others";
  }
  // Without a camera, focus= also sets the camera (see "focus param").
  if (view.camera && random() < 0.3) {
    view.focus = { tags: pick(random, TAGS) };
    if (random() < 0.5) view.focus.mode = "dim-others";
  }
  if (random() < 0.3) {
    view.annotations = [
      { x: 0.25, y: 0.5, type: "user-info", title: "Title ✓", description: "a <b>b</b>", shape: "circle" },
      { x: 0.1, y: 0.2, x2: 0.4, y2: 0.8, type: "arrow-info", title: "", description: "", shape: "rectangle" },
    ];
  }
  return view;
}

function randomState(random: () => number): DiagramState {
  const ui: DiagramState["ui"] = {};
  if (random() < 0.5) ui.panelOpen = true;
  if (random() < 0.3) ui.tagTreeExpanded = true;
  return { version: 1, view: randomView(random), ui };
}

describe("url codec", () => {
  it("parse(write(s)) == s", () => {
    const random = rng(42);
    for (let run = 0; run < 500; run += 1) {
      const state = normalizeState(randomState(random));
      const search = stateToSearch(state, { defaultLevel: DEFAULT_LEVEL });
      const parsed = urlToState(search, 10);
      const context = `${JSON.stringify(state)} -> ${search}`;
      expect(viewsEqual(parsed.view, state.view), context).toBe(true);
      expect(parsed.ui, context).toEqual(state.ui);
    }
  });

  it("keeps unknown parameters and their order", () => {
    const state = normalizeState({ view: { pins: ["B", "A"], level: 1 }, ui: { panelOpen: true } });
    expect(stateToSearch(state, { defaultLevel: 3, search: "?x=1&pins=Z&y=2" })).toBe("?x=1&pins=A,B&y=2&menu=true&filter-level=1");
  });

  it("filters hidden tags through the tag model", () => {
    const model = goldenTagModel();
    const state = normalizeState({ view: { hiddenTags: ["Network.Egress", "Network", "Api"] } });
    const search = stateToSearch(state, {
      defaultLevel: 3,
      explicitHiddenTags: (tags) => model.getExplicitHiddenTags(tags.map((tag) => [tag, false])),
    });
    expect(search).toBe("?filter-hide-tags=Api,Network");
  });

  it("drops the whole filter at defaults", () => {
    expect(stateToSearch(normalizeState({ view: { level: 3 } }), { defaultLevel: 3, search: "?menu=false&tags=closed" })).toBe("");
  });

  it("highlight param", () => {
    const spec = parseHighlightParam("WebApp,tag:Data,id:cell-1,mode:pulse,mode:bogus");
    expect(spec).toEqual({ slugs: ["WebApp", "mode:bogus"], tags: ["Data"], ids: ["cell-1"], mode: "pulse" });
    expect(formatHighlightParam({ slugs: ["A"], tags: ["T"], ids: ["i"], mode: "outline" })).toBe("A,tag:T,id:i,mode:outline");
    expect(parseHighlightParam("")).toBeNull();
    expect(formatHighlightParam(null)).toBe("");
  });

  it("focus param", () => {
    expect(urlToState("?focus=Network,Api.Rbac&focus-mode=dim-others", 10).view).toEqual({
      focus: { tags: ["Network", "Api.Rbac"], mode: "dim-others" },
      camera: { focus: { tags: ["Network", "Api.Rbac"] } },
    });
    // v= wins for the camera; an unknown mode is outline; no tags, no focus.
    expect(urlToState("?focus=Api&focus-mode=pulse&v=fit", 10).view).toEqual({ focus: { tags: ["Api"] }, camera: { fit: true } });
    expect(urlToState("?focus=&focus-mode=pulse", 10).view).toEqual({});
    const write = (focus: DiagramView["focus"]) => stateToSearch(normalizeState({ view: { focus } }), { defaultLevel: 3 });
    expect(write({ tags: ["A", "B"], mode: "dim-others" })).toBe("?focus=A,B&focus-mode=dim-others");
    expect(write({ tags: ["A"], mode: "outline" })).toBe("?focus=A");
    expect(write({ tags: [] })).toBe("");
  });

  it("only-tags wins over hidden tags", () => {
    const state = urlToState("?only-tags=Network&filter-hide-tags=Api", 10);
    expect(state.view).toEqual({ onlyTags: ["Network"] });
    expect(stateToSearch(normalizeState({ view: { onlyTags: ["Network"], hiddenTags: ["Api"] } }), { defaultLevel: 3 })).toBe(
      "?only-tags=Network",
    );
  });
});

describe("slide codec", () => {
  const base: DiagramView = { level: 2, camera: { fit: true }, hiddenTags: ["Logging"] };

  it("resolve(serialize(s, base), base) == s", () => {
    const random = rng(7);
    for (let run = 0; run < 500; run += 1) {
      const view = normalizeState(randomState(random)).view;
      const snippet = serializeSlide(view, base);
      const resolved = parseSlideSnippet(snippet, base);
      expect(viewsEqual(resolved, view), `${JSON.stringify(view)}\n${snippet}`).toBe(true);
    }
  });

  it("url -> state -> slide -> state", () => {
    const random = rng(99);
    for (let run = 0; run < 300; run += 1) {
      const state = normalizeState(randomState(random));
      const fromUrl = urlToState(stateToSearch(state, { defaultLevel: DEFAULT_LEVEL }), 10);
      const snippet = serializeSlide(fromUrl.view, {});
      expect(viewsEqual(parseSlideSnippet(snippet, {}), fromUrl.view)).toBe(true);
    }
  });

  it("snippet shape", () => {
    const view: DiagramView = { level: 1, onlyTags: ["Network"], camera: { rect: [0.351234, 0.5, 0.4, 0.5] }, hiddenTags: ["Logging"] };
    expect(serializeSlide(view, base, { title: "Request path" })).toBe(
      `<section data-diagram-state='{"camera":{"rect":[0.3512,0.5,0.4,0.5]},"level":1,"onlyTags":["Network"]}'>\n` +
        "  <h2>Request path</h2>\n" +
        "  <div data-diagram-slot data-prevent-swipe></div>\n" +
        "</section>",
    );
  });

  it("always includes the camera, and null for removed keys", () => {
    expect(slideDelta({ camera: { fit: true } }, base)).toEqual({ camera: { fit: true }, level: null, hiddenTags: null });
  });

  it("escapes quotes in the attribute", () => {
    const view: DiagramView = { query: "it's <b>&" };
    const snippet = serializeSlide(view, {});
    expect(snippet).toContain("it&#39;s &lt;b&gt;&amp;");
    expect(parseSlideSnippet(snippet)).toEqual(view);
  });

  it("resolves named views and reports unknown ones", () => {
    const views = { overview: { title: "Overview", state: { camera: { fit: true as const }, level: 0 } } };
    expect(resolveSlideView(base, views, "overview", '{"pins":["Rbac"]}')).toEqual({
      level: 0,
      camera: { fit: true },
      hiddenTags: ["Logging"],
      pins: ["Rbac"],
    });
    expect(() => resolveSlideView(base, views, "nope", null)).toThrow(/unknown view/);
    expect(() => resolveSlideView(base, views, null, "{bad")).toThrow(/invalid JSON/);
    expect(() => resolveSlideView(base, views, null, '{"level":-1}')).toThrow(/non-negative/);
    expect(() => parseSlideSnippet("<div></div>")).toThrow(/No <section>/);
  });

  describe("data-diagram-state-url", () => {
    it("reads only the query of a pasted page URL", () => {
      const url = "https://example.org/some/path/?v=0.4,0.6,0.3,0.2&pins=KubeApi,Etcd&filter-level=1&menu=true&tags=open&utm_source=x#/slide/3";
      expect(parseStateUrlAttribute(url)).toEqual({ camera: { rect: [0.4, 0.6, 0.3, 0.2] }, pins: ["KubeApi", "Etcd"], level: 1 });
    });

    it("takes a bare query, fit, highlight and only-tags", () => {
      expect(parseStateUrlAttribute("v=fit&only-tags=Network&highlight=tag:Api,mode:pulse")).toEqual({
        camera: { fit: true },
        onlyTags: ["Network"],
        highlight: { tags: ["Api"], mode: "pulse" },
      });
    });

    it("ignores what it does not understand", () => {
      expect(parseStateUrlAttribute("https://example.org/")).toEqual({});
      expect(parseStateUrlAttribute("?foo=bar&v=not-a-rect")).toEqual({});
      expect(parseStateUrlAttribute("")).toEqual({});
    });

    it("sits between the named view and the JSON state", () => {
      const views = { data: { state: { onlyTags: ["Data"], level: 1 } } };
      const view = resolveSlideView(base, views, "data", '{"pins":["A"]}', { stateUrl: "/?filter-level=3&pins=B&v=fit" });
      expect(view).toEqual({ camera: { fit: true }, hiddenTags: ["Logging"], onlyTags: ["Data"], level: 3, pins: ["A"] });
    });

    it("is read from a slide snippet", () => {
      const snippet = `<section data-diagram-state-url="http://localhost:4107/?pins=Etcd&amp;v=fit"><div data-diagram-slot></div></section>`;
      expect(parseSlideSnippet(snippet, base)).toEqual({ ...base, camera: { fit: true }, pins: ["Etcd"] });
    });
  });
});

describe("state", () => {
  it("merge and diff are inverse", () => {
    const random = rng(3);
    for (let run = 0; run < 300; run += 1) {
      const a = normalizeState(randomState(random)).view;
      const b = normalizeState(randomState(random)).view;
      expect(viewsEqual(mergeView(b, diffView(a, b)), a)).toBe(true);
    }
  });

  it("canonical form", () => {
    expect(
      canonicalView({ pins: ["b", "a"], query: "", hiddenTags: [], camera: { rect: [0.123456, 0.5, 0.5, 0.5] } }),
    ).toEqual({ camera: { rect: [0.1235, 0.5, 0.5, 0.5] }, pins: ["a", "b"] });
    expect(canonicalView({ focus: { tags: ["b", "a"], mode: "outline" } })).toEqual({ focus: { tags: ["a", "b"] } });
    expect(canonicalView({ focus: { tags: [] } })).toEqual({});
  });

  it("rejects bad input with a path", () => {
    expect(() => normalizeState({ view: { camera: { rect: [2, 0, 0, 0] } } })).toThrow(/state\.view\.camera\.rect/);
    expect(() => normalizeState({ view: { bogus: 1 } })).toThrow(/unknown key/);
    expect(() => normalizeState({ view: { pins: [1] } })).toThrow(/array of strings/);
    expect(() => normalizeState({ view: { highlight: { mode: "blink" } } })).toThrow(/mode/);
    expect(() => normalizeState({ view: { camera: { fit: false } } })).toThrow(/must be true/);
    expect(() => normalizeState({ view: { camera: { focus: { tags: ["A"] }, padding: 2 } } })).toThrow(/padding/);
    expect(() => normalizeState({ view: { camera: {} } })).toThrow(/expected one of/);
    expect(() => normalizeState({ view: { theme: "blue" } })).toThrow(/light or dark/);
    expect(() => normalizeState({ view: { onlyPinned: true } })).toThrow(/unknown key/);
    expect(() => normalizeState({ view: { query: 1 } })).toThrow(/string/);
    expect(() => normalizeState({ view: { focus: ["A"] } })).toThrow(/state\.view\.focus/);
    expect(() => normalizeState({ view: { focus: { tags: ["A"], mode: "pulse" } } })).toThrow(/focus\.mode/);
    expect(() => normalizeState({ view: { focus: { tags: ["A"], zoom: 2 } } })).toThrow(/unknown key/);
    expect(() => normalizeState({ view: { annotations: {} } })).toThrow(/array/);
    expect(() => normalizeState({ view: { level: null } })).toThrow(/only valid in a delta/);
    expect(() => normalizeState({ ui: { panelOpen: 1 } })).toThrow(/boolean/);
    expect(() => normalizeState({ ui: { other: true } })).toThrow(/unknown key/);
    expect(() => normalizeState({ version: 2 })).toThrow(/version/);
    expect(() => normalizeState(null)).toThrow(/object/);
  });

  it("json codec", () => {
    const state = normalizeState({ view: { pins: ["b", "a"], camera: { focus: { tags: ["X"] }, padding: 0.1 } }, ui: { panelOpen: true } });
    const json = stateToJson(state);
    expect(json).toBe('{"ui":{"panelOpen":true},"version":1,"view":{"camera":{"focus":{"tags":["X"]},"padding":0.1},"pins":["a","b"]}}');
    expect(stateFromJson(json).view).toEqual({ camera: { focus: { tags: ["X"] }, padding: 0.1 }, pins: ["a", "b"] });
    expect(() => stateFromJson("{")).toThrow(/Invalid state JSON/);
  });
});

describe("embedded diagram (#svg=)", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><g data-tags="A æøå ✓"><rect width="1" height="1"/></g>${"<g/>".repeat(200)}</svg>`;

  it("round-trips, url-safe and smaller than the SVG", async () => {
    const encoded = await encodeEmbeddedSvg(svg);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded.length).toBeLessThan(svg.length);
    expect(await decodeEmbeddedSvg(encoded)).toBe(svg);
  });

  it("takes plain base64 (and base64url) of the SVG text", async () => {
    const plain = Buffer.from(svg).toString("base64");
    expect(await decodeEmbeddedSvg(plain)).toBe(svg);
    expect(await decodeEmbeddedSvg(plain.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""))).toBe(svg);
  });

  it("says why it cannot read something", async () => {
    await expect(decodeEmbeddedSvg("%%%")).rejects.toBeInstanceOf(EmbedDecodeError);
    await expect(decodeEmbeddedSvg("bm90IGFuIHN2Zw")).rejects.toBeInstanceOf(EmbedDecodeError);
  });

  it("levels: 32k and 100k warn, past 2 MiB refused", () => {
    expect([32_000, 32_001, 100_001, 2 * 1024 * 1024 + 1].map(embedLinkLevel)).toEqual(["ok", "long", "very-long", "too-large"]);
  });
});

