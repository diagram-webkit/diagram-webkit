import { describe, expect, it } from "vitest";
import * as inputs from "./golden/inputs.mjs";
import {
  cleanMultiline,
  decodeAnnotations,
  escapeHTML,
  FIT_VALUE,
  getFilterResultSummary,
  normalizeQuery,
  parseFilterParams,
  parseHelpContent,
  parseViewportValue,
  processUserDescription,
  sanitizeUserHtml,
  serializeRect,
  writeUrlSearch,
} from "../src/core";
import { golden, goldenTagModel, parseHtml, goldenConfig } from "./helpers";

const model = goldenTagModel();

// The original sanitizer emitted text unescaped (an XSS: "&lt;img onerror=..&gt;"
// became live markup). These samples differ on purpose; the rendered text is
// the same.
const SANITIZE_DEVIATIONS: Record<string, string> = {
  "&lt;tag&gt; &amp; entities": "&lt;tag&gt; &amp; entities",
  "a & b\n\nc": "a &amp; b<br><br>c",
};

describe("golden: tags", () => {
  const data = golden<any>("tags");

  it("parseTags", () => {
    data.parseTags.forEach(([input, output]: [string, string[]]) => expect(model.parseTags(input), input).toEqual(output));
  });

  it("per tag", () => {
    data.perName.forEach((entry: any) => {
      const tag = entry.tag;
      expect(model.getTagParent(tag), tag).toEqual(entry.parent);
      expect(model.getTagLeafName(tag), tag).toEqual(entry.leaf);
      expect(model.isLevelTag(tag), tag).toEqual(entry.isLevel);
      expect(model.isCssTag(tag), tag).toEqual(entry.isCss);
      expect(model.parseLevelTag(tag), tag).toEqual(entry.level);
      expect(model.getTagMeta(tag), tag).toEqual(entry.meta);
      expect(model.getTagDescription(tag), tag).toEqual(entry.description);
      expect(model.getTagDescription(tag, { inherit: true }), tag).toEqual(entry.descriptionInherited);
      expect(model.isDeclaredTag(tag), tag).toEqual(entry.declared);
    });
  });

  it("per tag set", () => {
    data.perSet.forEach((entry: any) => {
      const tags = entry.tags;
      const label = tags.join(" ");
      expect(model.getTagLevel(tags), label).toEqual(entry.level);
      expect(model.getNonLevelTags(tags), label).toEqual(entry.nonLevel);
      expect(model.getCustomCssClassesForTags(tags), label).toEqual(entry.cssClasses);
      expect(model.getSortedVisibleTags(tags), label).toEqual(entry.sorted);
      expect(model.buildTagBadgesHtml(tags), label).toEqual(entry.badges);
      expect(model.getPrimarySeverityTag(tags), label).toEqual(entry.severityTag);
      expect(model.getSeverityClassForTags(tags), label).toEqual(entry.severityClass);
      expect(model.hasPriorityTag(tags), label).toEqual(entry.hasPriority);
    });
  });

  it("groups and ordering", () => {
    expect(["priority", "general", "missing"].map((id) => model.getTagGroupMeta(id))).toEqual(data.groups);
    inputs.SORT_LISTS.forEach((list: string[], index: number) => {
      expect([...list].sort(model.compareTagsByFilterOrder)).toEqual(data.sorted[index]);
    });
  });

  it("visibility", () => {
    const parsed = inputs.TAG_SAMPLES.map((value: string) => model.parseTags(value));
    data.visibility.forEach((entry: any) => {
      const visibility = new Map<string, boolean>(entry.hidden.map((tag: string) => [tag, false]));
      parsed.forEach((tags: string[], index: number) => {
        const expected = entry.sets[index];
        expect(model.isTagSetVisible(tags, visibility)).toEqual(expected.visible);
        expect(model.isTagSetWithinSelectedLevel(tags, entry.level)).toEqual(expected.withinLevel);
        expect(model.isTagSetDisabledByHiddenGroup(tags, visibility)).toEqual(expected.disabledByGroup);
        expect(model.getHiddenDisableTags(tags, visibility)).toEqual(expected.hiddenDisable);
      });
    });
  });
});

describe("golden: help", () => {
  const data = golden<any>("help");
  it("parseHelpContent", () => {
    data.parse.forEach(([input, output]: [string, unknown]) => expect(parseHelpContent(input), JSON.stringify(input)).toEqual(output));
  });
  it("normalizeQuery", () => {
    data.normalizeQuery.forEach(([input, output]: [string, string]) => expect(normalizeQuery(input)).toEqual(output));
  });
  it("summary", () => {
    data.summary.forEach(([args, output]: [[number, number, string], string]) => expect(getFilterResultSummary(...args)).toEqual(output));
  });
});

describe("golden: html", () => {
  const data = golden<any>("html");
  const whitelist = goldenConfig.htmlWhitelist;

  it("escapeHTML", () => {
    data.escape.forEach(([input, output]: [unknown, string]) => {
      expect(escapeHTML(input === "__undefined__" ? undefined : input), JSON.stringify(input)).toEqual(output);
    });
  });
  it("cleanMultiline", () => {
    data.cleanMultiline.forEach(([input, output]: [string, string]) => expect(cleanMultiline(input)).toEqual(output));
  });
  it("sanitizeUserHtml", () => {
    data.sanitize.forEach(([input, output]: [string, string]) => {
      expect(sanitizeUserHtml(input, parseHtml, whitelist), input).toEqual(SANITIZE_DEVIATIONS[input] ?? output);
    });
  });
  it("processUserDescription", () => {
    data.description.forEach(([input, output]: [string, string]) => {
      expect(processUserDescription(input, parseHtml, whitelist), input).toEqual(SANITIZE_DEVIATIONS[input] ?? output);
    });
  });
  it("hardening: unsafe URLs, handlers and tags go, text stays", () => {
    const links = { a: ["href", "title"], img: ["src"] };
    const cases: [string, string][] = [
      ['<a href="javascript:alert(1)">x</a>', "<a>x</a>"],
      ['<a href=" JaVa\tScRiPt:alert(1)">x</a>', "<a>x</a>"],
      ['<a href="data:text/html,<b>">x</a>', "<a>x</a>"],
      ['<a href="https://example.org/?a=1&b=2" title="t">x</a>', '<a href="https://example.org/?a=1&amp;b=2" title="t" rel="noopener noreferrer">x</a>'],
      ['<a href="/docs#part">x</a>', '<a href="/docs#part" rel="noopener noreferrer">x</a>'],
      ['<a href="mailto:a@b.c">x</a>', '<a href="mailto:a@b.c" rel="noopener noreferrer">x</a>'],
      ['<img src="x" onerror="alert(1)">', '<img src="x"></img>'],
      ["<iframe>in</iframe><svg><b>s</b></svg>", "ins"],
      ['<unknown-tag data-x="1">still text</unknown-tag>', "still text"],
    ];
    cases.forEach(([input, output]) => expect(sanitizeUserHtml(input, parseHtml, links), input).toBe(output));
    // A whitelist cannot opt in to the unsafe parts.
    expect(sanitizeUserHtml('<b onclick="x" style="color:red">a</b><script>b</script>', parseHtml, { b: ["onclick", "style"], script: [] })).toBe("<b>a</b>b");
  });

  it("never lets markup out through text", () => {
    expect(processUserDescription("&lt;img src=x onerror=alert(1)&gt;", parseHtml, whitelist)).toBe("&lt;img src=x onerror=alert(1)&gt;");
    expect(sanitizeUserHtml('<b title="x&quot; onmouseover=&quot;y">a</b>', parseHtml, { b: ["title"] })).toBe(
      '<b title="x&quot; onmouseover=&quot;y">a</b>',
    );
  });
});

describe("golden: url", () => {
  const data = golden<any>("url");

  it("parse filter params", () => {
    data.parseFilter.forEach(([search, output]: [string, Record<string, unknown>]) => {
      const parsed = parseFilterParams(search);
      // constraint=pinned ("only show pinned") is removed on purpose.
      const { constraints: _removed, ...expected } = output;
      const goldenShape = Object.fromEntries(Object.keys(expected).map((key) => [key, (parsed as unknown as Record<string, unknown>)[key]]));
      expect(goldenShape, search).toEqual(expected);
    });
  });

  it("parse annotations", () => {
    data.parseAnnotations.forEach(([search, output]: [string, unknown]) => {
      const raw = new URLSearchParams(search).get("annotations");
      expect(decodeAnnotations(raw, goldenConfig.maxUserAnnotations), search).toEqual(output);
    });
  });

  it("parse viewport", () => {
    data.viewport.forEach(([search, output]: [string, { parsed: unknown; urlValue: string | null }]) => {
      const parsed = parseViewportValue(new URLSearchParams(search).get("v"));
      expect(parsed, search).toEqual(output.parsed);
      const urlValue = parsed.fit ? FIT_VALUE : parsed.rect ? serializeRect(parsed.rect) : null;
      expect(urlValue, search).toEqual(output.urlValue);
    });
  });

  it("write", () => {
    const expected = new Map<string, string>(data.write);
    // Scenarios with constraint=pinned no longer apply (see parse filter params).
    inputs.URL_WRITE_SCENARIOS.filter((scenario: any) => !scenario.state.constraints?.length).forEach((scenario: any) => {
      const [searchPart, hash = ""] = scenario.search.split("#");
      const state = scenario.state;
      const entries: [string, boolean][] = (state.hidden || []).map((tag: string) => [tag, false]);
      entries.push(["Visible", true]);
      const written = writeUrlSearch(searchPart, {
        annotations: state.annotations || [],
        viewport: state.viewport === undefined ? null : state.viewport,
        panelOpen: Boolean(state.visible),
        query: state.query || "",
        hiddenTags: model.getExplicitHiddenTags(entries),
        pins: [...(state.pins || [])].sort((a: string, b: string) => a.localeCompare(b)),
        level: state.level ?? 3,
        defaultLevel: state.defaultLevel ?? 3,
        tagsExpanded: Boolean(state.tagsExpanded),
      });
      expect(`${written}${hash ? `#${hash}` : ""}`, scenario.name).toEqual(expected.get(scenario.name));
    });
  });
});
