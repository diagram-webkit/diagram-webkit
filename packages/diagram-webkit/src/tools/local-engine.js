// DIAGRAM_WEBKIT_DIR=<checkout>: develop a diagram against a local
// diagram-webkit. In the browser build (Vite plugin) diagram-webkit resolves
// to the checkout's src/, so engine edits hot-reload without a build. Node
// (loadDefinition, the CLI) uses the checkout's dist/: Vite's module runner
// cannot load the engine's ?inline CSS from source.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LOCAL_ENGINE_ENV = "DIAGRAM_WEBKIT_DIR";
const PACKAGE_NAME = "diagram-webkit";

// Entry points of the package exports.
const ENTRIES = {
  source: { "": "src/index.ts", "/core": "src/core/index.ts", "/reveal": "src/reveal/index.ts" },
  dist: { "": "dist/index.js", "/core": "dist/core.js", "/reveal": "dist/reveal.js" },
};

function packageName(dir) {
  const file = path.join(dir, "package.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")).name;
}

// The package directory of the checkout named by DIAGRAM_WEBKIT_DIR (the repo
// root or packages/diagram-webkit), or null when the variable is not set.
export function localEngineDir(env = process.env) {
  const value = env[LOCAL_ENGINE_ENV];
  if (!value) return null;
  const base = path.resolve(value);
  const dir = [path.join(base, "packages", PACKAGE_NAME), base].find((candidate) => packageName(candidate) === PACKAGE_NAME);
  if (!dir) {
    throw new Error(`${LOCAL_ENGINE_ENV}=${value}: no ${PACKAGE_NAME} package there (give the repo root or packages/${PACKAGE_NAME})`);
  }
  return fs.realpathSync(dir);
}

/** @param {"source" | "dist"} kind */
export function localEngineAliases(dir, kind) {
  return Object.entries(ENTRIES[kind]).map(([subpath, entry]) => {
    const file = path.join(dir, entry);
    if (kind === "dist" && !fs.existsSync(file)) {
      throw new Error(`${LOCAL_ENGINE_ENV}: ${file} is missing; run \`npm run build\` in the diagram-webkit checkout`);
    }
    return { find: new RegExp(`^${PACKAGE_NAME}${subpath.replace("/", "\\/")}$`), replacement: file };
  });
}

// The same file in the local checkout, when that is not the file running now.
export function localCounterpart(dir, moduleUrl) {
  const self = fs.realpathSync(fileURLToPath(moduleUrl));
  const other = path.join(dir, "src", "tools", path.basename(self));
  if (other === self) return null;
  if (!fs.existsSync(other)) throw new Error(`${LOCAL_ENGINE_ENV}: ${other} does not exist`);
  return other;
}
