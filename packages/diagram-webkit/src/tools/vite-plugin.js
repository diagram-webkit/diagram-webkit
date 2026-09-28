// Vite plugin for a diagram page: fills <head> and <noscript> from the
// definition, and keeps the generated tag-description module in sync with
// its markdown.
//
//   diagramWebkit({
//     definition: "./definition.js",
//     tagTree: { file: "METADATA.md", heading: "Tag tree", out: "config/tag-descriptions.generated.js" },
//     singleFile: true, // build: one index.html with the JS and CSS inlined (offline, file://)
//   })
//
// With DIAGRAM_WEBKIT_DIR set, diagram-webkit resolves to the source of that
// checkout (local-engine.js), and the plugin's hooks come from it too (below).
// A Vite config gets a Promise of the plugin then, which Vite accepts.
import { pathToFileURL } from "node:url";
import { runnerImport, searchForWorkspaceRoot } from "vite";
import { localCounterpart, localEngineDir } from "./local-engine.js";
import { createPlugin } from "./vite-plugin-core.js";

// With DIAGRAM_WEBKIT_DIR, the checkout's plugin (vite-plugin-core.js) runs,
// like the CLI does, so plugin changes show without a release. It gets this
// project's Vite passed in and never loads the checkout's own.
export function diagramWebkit(options = {}) {
  const engineDir = localEngineDir();
  const host = { searchForWorkspaceRoot, runnerImport };
  const local = engineDir && localCounterpart(engineDir, new URL("./vite-plugin-core.js", import.meta.url).href);
  if (!local) return createPlugin(options, engineDir, host);
  return import(pathToFileURL(local).href).then((checkout) => checkout.createPlugin(options, engineDir, host));
}

export default diagramWebkit;
