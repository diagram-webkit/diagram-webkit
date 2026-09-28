// Loads a definition module through Vite, so the imports a browser build
// allows (JSON, ?raw, asset URLs) also work from Node.
import { runnerImport } from "vite";
import { loadDefinitionWith } from "./definition-loader.js";

export function loadDefinition(file) {
  return loadDefinitionWith(runnerImport, file);
}
