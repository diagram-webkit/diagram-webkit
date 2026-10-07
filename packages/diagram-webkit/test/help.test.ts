import { describe, expect, it } from "vitest";
import { buildHelpExample, createTagModel, DEFAULT_TAGS_CONFIG, HELP_TAB, helpMatchesSearch, highlightExample, parseExampleAttrName, searchTab, validateCells, validateView } from "../src/core";

const model = createTagModel(DEFAULT_TAGS_CONFIG);

describe("help examples", () => {
  it("parses help.<formatter>.<name> attribute names", () => {
    expect(parseExampleAttrName("data-help.yaml.falco_rule", "data-help")).toEqual({ formatter: "yaml", name: "falco_rule" });
    expect(parseExampleAttrName("data-help.YAML.a.b", "data-help")).toEqual({ formatter: "yaml", name: "a.b" });
    expect(parseExampleAttrName("data-help.yaml", "data-help")).toEqual({ formatter: "yaml", name: "" });
    expect(parseExampleAttrName("data-help", "data-help")).toBeNull();
    expect(parseExampleAttrName("data-helper.x.y", "data-help")).toBeNull();
  });

  it("builds a title and trims the code", () => {
    expect(buildHelpExample("shell", "install_it", "\n$ make\r\n\n")).toMatchObject({ title: "install it", code: "$ make" });
  });

  it("searches help and examples; the search shows the tab that matched", () => {
    const record = { searchText: "falco\nruntime detection", examples: [buildHelpExample("yaml", "rule", "- rule: Shell"), buildHelpExample("log", "alert", "Shell spawned")] };
    expect(helpMatchesSearch(record, "spawned")).toBe(true);
    expect(helpMatchesSearch(record, "nothing")).toBe(false);
    expect(searchTab(record, "")).toBe(HELP_TAB);
    expect(searchTab(record, "falco")).toBe(HELP_TAB);
    expect(searchTab(record, "shell")).toBe(0);
    expect(searchTab(record, "spawned")).toBe(1);
    expect(searchTab(record, "alert")).toBe(1);
  });

  it("highlights tokens and escapes everything", () => {
    expect(highlightExample("FROM alpine AS build # base", "containerfile")).toBe(
      '<span class="dwk-code-keyword">FROM</span> alpine <span class="dwk-code-keyword">AS</span> build <span class="dwk-code-comment"># base</span>',
    );
    expect(highlightExample("- rule: <x>\n  enabled: true", "yaml")).toBe(
      '- <span class="dwk-code-key">rule</span>: &lt;x&gt;\n  <span class="dwk-code-key">enabled</span>: <span class="dwk-code-literal">true</span>',
    );
    expect(highlightExample('{"a": 1}', "json")).toBe('{<span class="dwk-code-key">"a"</span>: <span class="dwk-code-literal">1</span>}');
    expect(highlightExample("$ kubectl get pods -A", "shell")).toBe('<span class="dwk-code-prompt">$</span> kubectl get pods <span class="dwk-code-flag">-A</span>');
    expect(highlightExample("2026-10-03T12:00:00Z ERROR boom", "log")).toBe(
      '<span class="dwk-code-time">2026-10-03T12:00:00Z</span> <span class="dwk-code-level-error">ERROR</span> boom',
    );
    expect(highlightExample("<b>x</b>", "unknown")).toBe("&lt;b&gt;x&lt;/b&gt;");
    expect(highlightExample("<b>x</b>", "text")).toBe("&lt;b&gt;x&lt;/b&gt;");
  });

  it("validates a view's tooltip against the cells", () => {
    const cells = [{ id: "c", tags: [], help: "Cache", slug: "Cache", examples: [{ formatter: "log", name: "cache_log" }] }];
    const codes = (tooltip: { slug: string; tab?: string }) => validateView({ tooltip }, cells, "v").map((issue) => issue.code);
    expect(codes({ slug: "Cache" })).toEqual([]);
    expect(codes({ slug: "Cache", tab: "cache_log" })).toEqual([]);
    expect(codes({ slug: "Cache", tab: "other" })).toEqual(["unknown-tooltip-tab"]);
    expect(codes({ slug: "Nope" })).toEqual(["unknown-tooltip"]);
  });

  it("validates examples", () => {
    const cell = { id: "c", tags: [], slug: "Cell" };
    const codes = (examples: { formatter: string; name: string }[], help: string | null = "Title") =>
      validateCells([{ ...cell, help, slug: help === null ? null : "Cell", examples }], model).map((issue) => `${issue.level}:${issue.code}`);
    expect(codes([{ formatter: "yaml", name: "rule" }])).toEqual([]);
    expect(codes([{ formatter: "cobol", name: "rule" }])).toEqual(["warning:unknown-example-formatter"]);
    expect(codes([{ formatter: "yaml", name: "" }])).toEqual(["error:example-format"]);
    expect(codes([{ formatter: "yaml", name: "rule" }], null)).toEqual(["error:example-without-help"]);
  });
});
