import fs from "node:fs";
import path from "node:path";
import { Window } from "happy-dom";
import { createTagModel, DEFAULT_TAGS_CONFIG, type HtmlNode, type HtmlParser, type TagsConfig } from "../src/core";

// Outputs of the original implementation for the inputs in golden/inputs.mjs,
// with the tag configuration they were made with (golden/config.json).
export const GOLDEN_DIR = path.resolve(__dirname, "golden");

export function golden<T = unknown>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, `${name}.json`), "utf8")) as T;
}

interface GoldenConfig {
  tagFilters: { groups: TagsConfig["groups"]; tags: TagsConfig["meta"] };
  tagDescriptions: Record<string, string>;
  htmlWhitelist: Record<string, string[]>;
  maxUserAnnotations: number;
}

export const goldenConfig = golden<GoldenConfig>("config");

export function goldenTagModel() {
  return createTagModel({
    ...DEFAULT_TAGS_CONFIG,
    groups: goldenConfig.tagFilters.groups,
    meta: goldenConfig.tagFilters.tags,
    descriptions: goldenConfig.tagDescriptions,
  });
}

const window = new Window();

function toNode(node: Node): HtmlNode {
  if (node.nodeType === 3) return { type: "text", text: node.textContent || "" };
  if (node.nodeType !== 1) return { type: "other" };
  const element = node as Element;
  const attrs: Record<string, string> = {};
  Array.from(element.attributes).forEach((attr) => {
    attrs[attr.name] = attr.value;
  });
  return { type: "element", tag: element.tagName.toLowerCase(), attrs, children: Array.from(element.childNodes).map(toNode) };
}

export const parseHtml: HtmlParser = (html) => {
  const doc = new window.DOMParser().parseFromString(`<!doctype html><body>${html}`, "text/html");
  return Array.from(doc.body.childNodes as unknown as Node[]).map(toNode);
};
