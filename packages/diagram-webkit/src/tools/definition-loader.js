// Loads a definition module through Vite's runnerImport, so the imports a
// browser build allows (JSON, ?raw, asset URLs) also work from Node. Imports
// no Vite itself: the caller passes runnerImport from the Vite it runs with
// (load-definition.js, or the project's Vite for the plugin).
import path from "node:path";
import { isDiagramDefinition } from "diagram-webkit/core";
import { localEngineAliases, localEngineDir } from "./local-engine.js";

export async function loadDefinitionWith(runnerImport, file) {
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
