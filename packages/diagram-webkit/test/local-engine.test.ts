import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { localEngineAliases, localEngineDir } from "../src/tools/local-engine.js";

const PACKAGE_DIR = fs.realpathSync(path.resolve(__dirname, ".."));
const REPO_DIR = path.resolve(PACKAGE_DIR, "../..");

describe("localEngineDir", () => {
  it("is off without DIAGRAM_WEBKIT_DIR", () => {
    expect(localEngineDir({})).toBeNull();
  });

  it("takes the repo root or the package directory", () => {
    expect(localEngineDir({ DIAGRAM_WEBKIT_DIR: REPO_DIR })).toBe(PACKAGE_DIR);
    expect(localEngineDir({ DIAGRAM_WEBKIT_DIR: PACKAGE_DIR })).toBe(PACKAGE_DIR);
  });

  it("fails on a directory without the package", () => {
    expect(() => localEngineDir({ DIAGRAM_WEBKIT_DIR: path.join(REPO_DIR, "docs") })).toThrow(/no diagram-webkit package there/);
  });
});

describe("localEngineAliases", () => {
  it("maps each export to an existing source file", () => {
    const aliases = localEngineAliases(PACKAGE_DIR, "source");
    const resolve = (id: string) => aliases.find((alias: { find: RegExp }) => alias.find.test(id))?.replacement;
    expect(resolve("diagram-webkit")).toBe(path.join(PACKAGE_DIR, "src/index.ts"));
    expect(resolve("diagram-webkit/core")).toBe(path.join(PACKAGE_DIR, "src/core/index.ts"));
    expect(resolve("diagram-webkit/reveal")).toBe(path.join(PACKAGE_DIR, "src/reveal/index.ts"));
    expect(resolve("diagram-webkit/tools/vite")).toBeUndefined();
    aliases.forEach((alias: { replacement: string }) => expect(fs.existsSync(alias.replacement)).toBe(true));
  });
});
