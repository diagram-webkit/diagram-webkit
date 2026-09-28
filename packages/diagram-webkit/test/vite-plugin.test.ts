import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODE_META_NAME } from "../src/core";
import { diagramWebkit } from "../src/tools/vite-plugin.js";

const PACKAGE_DIR = fs.realpathSync(path.resolve(__dirname, ".."));
const logger = { info: () => {} };

async function headTags(plugin: any, command: "serve" | "build") {
  plugin.configResolved({ root: PACKAGE_DIR, command, logger });
  const { tags } = await plugin.transformIndexHtml.handler("<!doctype html><html><head></head><body></body></html>");
  return tags.filter((tag: any) => tag.tag === "meta" && tag.attrs.name === MODE_META_NAME);
}

describe("vite plugin", () => {
  it("marks dev-server pages as development mode, builds not", async () => {
    const options = { page: { title: "T" } };
    expect(await headTags(diagramWebkit(options), "serve")).toEqual([
      { tag: "meta", attrs: { name: MODE_META_NAME, content: "development" }, injectTo: "head" },
    ]);
    expect(await headTags(diagramWebkit(options), "build")).toEqual([]);
  });
});
