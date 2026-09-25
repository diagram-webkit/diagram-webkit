import { describe, expect, it } from "vitest";
import { defineDiagram, isDiagramDefinition, PRESETS, resolveFeatures, satisfies, VERSION } from "../src/core";

const base = defineDiagram({
  id: "base",
  source: { production: "https://example.test/base.svg", debug: "./base.svg" },
  tags: {
    groups: [{ id: "general", label: "Tags", order: 10 }],
    meta: { Api: { label: "API", order: 1 }, Net: { label: "Network" } },
  },
  content: { footer: { links: [{ label: "A", href: "https://a" }], version: "v1" }, texts: { loading: "Base..." } },
  features: "app",
  baseState: { level: 2, camera: { fit: true } },
  views: { one: { title: "One", state: { level: 1 } }, two: { state: { pins: ["X"] } } },
  hooks: { tagLabel: (tag) => `base:${tag}` },
});

describe("defineDiagram", () => {
  it("freezes and marks the definition", () => {
    expect(isDiagramDefinition(base)).toBe(true);
    expect(isDiagramDefinition({ id: "x" })).toBe(false);
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(base.tags!.meta!.Api)).toBe(true);
    expect(() => {
      (base as unknown as Record<string, unknown>).id = "y";
    }).toThrow();
    expect(Object.keys(base)).not.toContain("extend");
  });

  it("resolves features from the preset", () => {
    expect(base.features).toEqual(PRESETS.app);
    expect(defineDiagram({ id: "x" }).features).toEqual(PRESETS.app);
  });

  it("validates unknown keys and types with a path", () => {
    expect(() => defineDiagram({ id: "x", bogus: 1 } as never)).toThrow(/definition\.bogus: unknown key/);
    expect(() => defineDiagram({ id: "x", tags: { separator: 1 } } as never)).toThrow(/definition\.tags\.separator: expected a string/);
    expect(() => defineDiagram({ id: "x", ui: { tooltipMinWidth: Number.NaN } })).toThrow(/expected a number/);
    expect(() => defineDiagram({ id: "x", features: "kiosk" as never })).toThrow(/unknown preset/);
    expect(() => defineDiagram({ id: "x", features: { panel: "yes" } as never })).toThrow(/features\.panel: expected a boolean/);
    expect(() => defineDiagram({ id: "x", features: { input: { mouse: true } } as never })).toThrow(/unknown input/);
    expect(() => defineDiagram({ id: "x", baseState: { level: -1 } })).toThrow(/baseState\.level/);
    expect(() => defineDiagram({ id: "x", views: { a: { state: { pins: "A" } } } } as never)).toThrow(/views\.a\.state\.pins/);
    expect(() => defineDiagram({ id: "x", views: { a: { state: {}, extra: 1 } } } as never)).toThrow(/views\.a\.extra/);
    expect(() => defineDiagram({ id: "x", content: { texts: { nope: "x" } } } as never)).toThrow(/unknown keys nope/);
    expect(() => defineDiagram({ id: "" })).toThrow(/definition\.id: required/);
    expect(() => defineDiagram(null as never)).toThrow(/expected an object/);
    expect(() => defineDiagram({ id: "x", hooks: { parseHelp: "fn" } } as never)).toThrow(/expected a function/);
  });

  it("checks requires against the running version", () => {
    expect(() => defineDiagram({ id: "x", requires: `^${VERSION}` })).not.toThrow();
    expect(() => defineDiagram({ id: "x", requires: ">=99.0.0" })).toThrow(/does not satisfy/);
  });
});

describe("extend", () => {
  it("merges plain objects deeply across a three-level chain", () => {
    const middle = base.extend({ id: "middle", tags: { meta: { Api: { order: 5 } } } });
    const leaf = middle.extend({ id: "leaf", tags: { meta: { Net: { group: "net" } } } });
    expect(leaf.id).toBe("leaf");
    expect(leaf.tags!.meta).toEqual({ Api: { label: "API", order: 5 }, Net: { label: "Network", group: "net" } });
    expect(leaf.tags!.groups).toEqual(base.tags!.groups);
    expect(leaf.source).toEqual(base.source);
    expect(base.tags!.meta!.Api).toEqual({ label: "API", order: 1 });
    expect(Object.isFrozen(leaf)).toBe(true);
    expect(isDiagramDefinition(leaf)).toBe(true);
  });

  it("replaces arrays", () => {
    const next = base.extend({ tags: { groups: [{ id: "x" }] }, content: { footer: { links: [] } } });
    expect(next.tags!.groups).toEqual([{ id: "x" }]);
    expect(next.content!.footer).toEqual({ links: [], version: "v1" });
  });

  it("removes inherited values with null", () => {
    const next = base.extend({ source: { debug: null }, content: { texts: null }, hooks: null, baseState: null });
    expect(next.source).toEqual({ production: "https://example.test/base.svg" });
    expect(next.content!.texts).toBeUndefined();
    expect(next.hooks).toBeUndefined();
    expect(next.baseState).toBeUndefined();
  });

  it("merges views per key", () => {
    const next = base.extend({ views: { two: null, three: { state: { level: 0 } }, one: { state: { query: "x" } } } });
    expect(next.views).toEqual({ one: { state: { query: "x" } }, three: { state: { level: 0 } } });
  });

  it("merges baseState as a view delta", () => {
    const next = base.extend({ baseState: { camera: { rect: [0.5, 0.5, 0.5, 0.5] }, level: null, pins: ["A"] } });
    expect(next.baseState).toEqual({ camera: { rect: [0.5, 0.5, 0.5, 0.5] }, pins: ["A"] });
  });

  it("features: preset replaces, object overrides per feature", () => {
    const embed = base.extend({ features: "embed" });
    expect(embed.features).toEqual(PRESETS.embed);
    const live = embed.extend({ features: { input: { wheel: true }, panel: true } });
    expect(live.features).toEqual({ ...PRESETS.embed, panel: true, input: { ...PRESETS.embed.input, wheel: true } });
    const reset = live.extend({ features: { preset: "app", about: false } });
    expect(reset.features).toEqual({ ...PRESETS.app, about: false });
    expect(live.extend({ features: null }).features).toEqual(PRESETS.app);
  });

  it("replaces hooks", () => {
    const next = base.extend({ hooks: { tagLabel: (tag) => `leaf:${tag}` } });
    expect(next.hooks!.tagLabel!("A", {} as never)).toBe("leaf:A");
    expect(base.hooks!.tagLabel!("A", {} as never)).toBe("base:A");
  });

  it("validates the merged result", () => {
    expect(() => base.extend({ tags: { separator: 3 } } as never)).toThrow(/expected a string/);
    expect(() => base.extend(null as never)).toThrow(/expected an object/);
    expect(() => base.extend({ views: [] } as never)).toThrow(/views/);
  });
});

describe("presets", () => {
  it("resolves specs", () => {
    expect(resolveFeatures(undefined)).toEqual(PRESETS.app);
    expect(resolveFeatures({ annotations: false })).toEqual({ ...PRESETS.app, annotations: false });
    expect(resolveFeatures({ input: { pinch: false } }, resolveFeatures("embed"))).toEqual({
      ...PRESETS.embed,
      input: { ...PRESETS.embed.input, pinch: false },
    });
    expect(() => resolveFeatures([] as never)).toThrow(/preset name or an object/);
    expect(() => resolveFeatures({ preset: "x" } as never)).toThrow(/preset/);
    expect(() => resolveFeatures({ annotations: "view" } as never)).toThrow(/annotations/);
    expect(() => resolveFeatures({ feedback: "modal" } as never)).toThrow(/feedback/);
    expect(() => resolveFeatures({ input: 1 } as never)).toThrow(/input: expected an object/);
    expect(() => resolveFeatures({ input: { wheel: 1 } } as never)).toThrow(/boolean/);
  });

  it("matches the documented table", () => {
    const embed = PRESETS.embed;
    expect([embed.panel, embed.urlSync, embed.persistence, embed.shortcuts, embed.about, embed.footer, embed.linkInfo]).toEqual(
      Array(7).fill(false),
    );
    expect([embed.annotations, embed.tooltips, embed.copySlide, embed.feedback]).toEqual(["render", true, false, "container"]);
    expect(PRESETS.app.annotations).toBe("edit");
    expect(PRESETS.app.feedback).toBe("page");
  });
});

describe("semver", () => {
  it.each([
    ["0.1.0", "^0.1.0", true],
    ["0.1.5", "^0.1.0", true],
    ["0.2.0", "^0.1.0", false],
    ["1.4.0", "^1.2.3", true],
    ["2.0.0", "^1.2.3", false],
    ["0.0.3", "^0.0.3", true],
    ["0.0.4", "^0.0.3", false],
    ["1.2.9", "~1.2.3", true],
    ["1.3.0", "~1.2.3", false],
    ["1.0.0", ">=1.0.0 <2.0.0", true],
    ["2.0.0", ">=1.0.0 <2.0.0", false],
    ["2.0.0", "^1.0.0 || ^2.0.0", true],
    ["1.0.0", "1.x", true],
    ["1.5.0", "1.4", false],
    ["1.4.7", "1.4.x", true],
    ["3.0.0", "*", true],
    ["1.0.0", "=1.0.0", true],
    ["1.0.1", "1.0.0", false],
    ["1.0.0", "> 0.9.0", true],
    ["1.0.0", "<= 0.9.0", false],
    ["0.9.0", "<1.0.0", true],
  ])("%s satisfies %s: %s", (version, range, expected) => {
    expect(satisfies(version, range)).toBe(expected);
  });

  it("rejects garbage", () => {
    expect(() => satisfies("x", "^1.0.0")).toThrow(/Invalid version/);
    expect(() => satisfies("1.0.0", "^1.x.2")).toThrow(/Invalid version comparator/);
    expect(() => satisfies("1.0.0", ">=1.x")).toThrow(/Invalid version comparator/);
  });
});

describe("definition: htmlWhitelist", () => {
  it("rejects tags and attributes that would let script in", () => {
    expect(() => defineDiagram({ id: "x", annotations: { htmlWhitelist: { script: [] } } })).toThrow(/htmlWhitelist\.script: tag is never allowed/);
    expect(() => defineDiagram({ id: "x", annotations: { htmlWhitelist: { b: ["onclick"] } } })).toThrow(/attribute "onclick" is never allowed/);
    expect(() => defineDiagram({ id: "x", annotations: { htmlWhitelist: { a: ["href"] } } })).not.toThrow();
  });
});
