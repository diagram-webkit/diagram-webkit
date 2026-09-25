import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createTagModel,
  DEFAULT_TAGS_CONFIG,
  extractCells,
  formatText,
  parseTagTreeMarkdown,
  resolveTexts,
  validateCells,
  validateViews,
  baseAnnotationType,
  encodeAnnotations,
  decodeAnnotations,
  stripRuntimeKeys,
} from "../src/core";
import { goldenTagModel } from "./helpers";

const EXAMPLE_SVG = path.resolve(__dirname, "../../../examples/direct--basic-diagram/example.svg");
const model = createTagModel(DEFAULT_TAGS_CONFIG);

describe("extractCells", () => {
  it("reads draw.io metadata", () => {
    const cells = extractCells(fs.readFileSync(EXAMPLE_SVG, "utf8"));
    expect(cells.map((cell) => cell.id)).toContain("m-db");
    const db = cells.find((cell) => cell.id === "m-db")!;
    expect(db).toEqual({
      id: "m-db",
      tags: ["pri-1", "Data"],
      help: "Database access\nOnly the web app may connect.\nCredentials come from a secret store.",
      slug: "DbAccess",
    });
  });

  it("decodes entities and handles quoting", () => {
    const cells = extractCells(`<svg><g data-cell-id="a"><g data-tags='x &amp; y' data-help="T&#10;&lt;b&gt;&#x41;&quot;"/></g><g data-tags="z"></g></svg>`);
    expect(cells).toEqual([
      { id: "a", tags: ["x", "&", "y"], help: 'T\n<b>A"', slug: null },
      { id: "a", tags: ["z"], help: null, slug: null },
    ]);
  });
});

describe("validateCells", () => {
  it("accepts the example diagram", () => {
    expect(validateCells(extractCells(fs.readFileSync(EXAMPLE_SVG, "utf8")), model)).toEqual([]);
  });

  it("reports slug and ancestor problems", () => {
    const issues = validateCells(
      [
        { id: "1", tags: ["A.B"], help: "x", slug: null },
        { id: "2", tags: ["A", "A.B.C.D", "A.B.C", "A.B"], help: "x", slug: "Dup" },
        { id: "3", tags: [], help: "x", slug: "Dup" },
        { id: "4", tags: [], help: "x", slug: "not-pascal" },
        { id: "5", tags: [], help: null, slug: "Orphan" },
      ],
      model,
    );
    expect(issues.map((issue) => issue.code).sort()).toEqual(
      ["duplicate-slug", "missing-ancestor", "missing-slug", "slug-format", "slug-without-help", "tag-depth"].sort(),
    );
  });

  it("derived ancestors are not required", () => {
    const derived = createTagModel({ ...DEFAULT_TAGS_CONFIG, deriveAncestors: true });
    expect(validateCells([{ id: "1", tags: ["A.B"], help: null, slug: null }], derived)).toEqual([]);
    expect(derived.parseTags("A.B.C level-1")).toEqual(["A.B.C", "level-1", "A.B", "A"]);
  });

});

describe("validateViews", () => {
  it("reports unknown references", () => {
    const cells = extractCells(fs.readFileSync(EXAMPLE_SVG, "utf8"));
    const views = JSON.parse(fs.readFileSync(path.resolve(EXAMPLE_SVG, "../views.json"), "utf8")).views;
    expect(validateViews(views, undefined, cells)).toEqual([]);
    const issues = validateViews(
      { bad: { state: { pins: ["Nope"], hiddenTags: ["Nah"], highlight: { ids: ["x"] }, camera: { focus: { slugs: ["Zip"] } } } } },
      { onlyTags: ["Gone"] },
      cells,
    );
    expect(issues.map((issue) => issue.code).sort()).toEqual(["unknown-id", "unknown-slug", "unknown-slug", "unknown-tag", "unknown-tag"]);
  });
});

describe("tag tree markdown", () => {
  it("parses nested entries under a heading", () => {
    expect(parseTagTreeMarkdown("## Tags\n- `A` — first\n  - `A.B`\n## Next\n- `C`", "Tags")).toEqual({ A: "first", "A.B": "" });
  });

  it("fails fast", () => {
    expect(() => parseTagTreeMarkdown("# nothing")).toThrow(/no '## Tag tree'/);
    expect(() => parseTagTreeMarkdown("## Tag tree\ntext")).toThrow(/No tags parsed/);
  });
});

describe("texts", () => {
  it("formats and validates", () => {
    expect(formatText("{a} and {b} and {c}", { a: 1, b: "x" })).toBe("1 and x and {c}");
    expect(resolveTexts({ loading: "Wait" }).loading).toBe("Wait");
    expect(() => resolveTexts({ nope: "x" })).toThrow(/unknown keys/);
  });
});

describe("annotations", () => {
  it("helpers", () => {
    expect(baseAnnotationType("area-info")).toBe("info");
    expect(stripRuntimeKeys([{ x: 1, _el: {} }])).toEqual([{ x: 1 }]);
    const list = [{ x: 0.5, y: 0.5, type: "user-info", title: "é", description: "", shape: "rectangle" as const }];
    expect(decodeAnnotations(encodeAnnotations(list), 10)).toEqual(list);
    expect(decodeAnnotations(btoa("{}"), 10)).toEqual([]);
  });
});

describe("tag model extras", () => {
  const tagModel = goldenTagModel();
  it("hidden tags for onlyTags keep ancestors and descendants", () => {
    const all = ["Network", "Network.Egress", "Network.Egress.Gateway", "Api", "Api.Rbac", "level-1", "css-x", "info"];
    expect(tagModel.hiddenTagsForOnly(["Network.Egress"], all)).toEqual(["Api", "Api.Rbac", "info"]);
  });

  it("hidden ancestor and panel style", () => {
    const visibility = new Map([["Network", false]]);
    expect(tagModel.getHiddenAncestor("Network.Egress.Gateway", visibility)).toBe("Network");
    expect(tagModel.getHiddenAncestor("Api.Rbac", visibility)).toBeNull();
    expect(tagModel.getSeverityPanelStyle(["pri-2", "info"])).toEqual({
      borderColor: "#B45F06",
      borderWidth: "3px",
      boxShadow: "inset 0 0 0 1px rgba(180, 95, 6, 0.35)",
    });
    expect(tagModel.getSeverityPanelStyle(["Api"])).toBeNull();
    expect(tagModel.buildTagBadgesHtml(["Api"], (tag) => `<${tag}>`)).toContain("&lt;Api&gt;");
    expect(() => createTagModel({ ...DEFAULT_TAGS_CONFIG, roles: { ...DEFAULT_TAGS_CONFIG.roles, level: "(" } })).toThrow(/tags\.roles\.level/);
  });
});
