// Loads a definition module through Vite, so the imports a browser build
// allows (JSON, ?raw, asset URLs) also work from Node.
import path from "node:path";
import { runnerImport } from "vite";
import { isDiagramDefinition } from "diagram-webkit/core";
import { localEngineAliases, localEngineDir } from "./local-engine.js";

export async function loadDefinition(file) {
  const absolute = path.resolve(file);
  // configFile: false - the project's config would load this plugin again.
  const engineDir = localEngineDir();
  const { module } = await runnerImport(absolute, {
    root: path.dirname(absolute),
    configFile: false,
    logLevel: "error",
    ...(engineDir && { resolve: { alias: localEngineAliases(engineDir, "dist") } }),
  });
  const definition = module.default;
  if (!isDiagramDefinition(definition)) {
    throw new Error(`${file}: default export is not a definition from defineDiagram()`);
  }
  return definition;
}
