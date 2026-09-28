import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MODE_META_NAME } from "../src/core";
import { createPlugin } from "../src/tools/vite-plugin-core.js";

const PACKAGE_DIR = fs.realpathSync(path.resolve(__dirname, ".."));
const TOOLS_DIR = path.join(PACKAGE_DIR, "src/tools");
const host = { searchForWorkspaceRoot: (root: string) => root, runnerImport: () => Promise.reject(new Error("not used")) };
const logger = { info: () => {} };

async function headTags(plugin: any, command: "serve" | "build") {
  plugin.configResolved({ root: PACKAGE_DIR, command, logger });
  const { tags } = await plugin.transformIndexHtml.handler("<!doctype html><html><head></head><body></body></html>");
  return tags.filter((tag: any) => tag.tag === "meta" && tag.attrs.name === MODE_META_NAME);
}

describe("vite plugin", () => {
  it("marks dev-server pages as development mode, builds not", async () => {
    const options = { page: { title: "T" } };
    expect(await headTags(createPlugin(options, null, host), "serve")).toEqual([
      { tag: "meta", attrs: { name: MODE_META_NAME, content: "development" }, injectTo: "head" },
    ]);
    expect(await headTags(createPlugin(options, null, host), "build")).toEqual([]);
  });

  describe("with DIAGRAM_WEBKIT_DIR", () => {
    // An "installed" copy of the tools inside this package, so "vite" and
    // "diagram-webkit/core" resolve as they would in a project.
    const installed = path.join(PACKAGE_DIR, "test/.installed-tools");
    const saved = process.env.DIAGRAM_WEBKIT_DIR;
    afterEach(() => {
      fs.rmSync(installed, { recursive: true, force: true });
      if (saved === undefined) delete process.env.DIAGRAM_WEBKIT_DIR;
      else process.env.DIAGRAM_WEBKIT_DIR = saved;
    });

    it("runs the checkout's plugin, with the project's Vite passed in", async () => {
      fs.cpSync(TOOLS_DIR, installed, { recursive: true });
      // A marker only the installed copy has: the checkout's plugin must not carry it.
      const core = path.join(installed, "vite-plugin-core.js");
      fs.writeFileSync(core, fs.readFileSync(core, "utf8").replace('name: "diagram-webkit"', 'name: "installed-copy"'));
      process.env.DIAGRAM_WEBKIT_DIR = PACKAGE_DIR;
      const { diagramWebkit } = await import(pathToFileURL(path.join(installed, "vite-plugin.js")).href);
      const result = diagramWebkit({ page: { title: "T" } });
      expect(result).toBeInstanceOf(Promise);
      const plugin = await result;
      expect(plugin.name).toBe("diagram-webkit");
      expect(await headTags(plugin, "serve")).toHaveLength(1);
    });

    it("uses itself when it is the checkout", async () => {
      process.env.DIAGRAM_WEBKIT_DIR = PACKAGE_DIR;
      const { diagramWebkit } = await import("../src/tools/vite-plugin.js");
      expect(diagramWebkit({ page: {} })).not.toBeInstanceOf(Promise);
    });
  });
});
