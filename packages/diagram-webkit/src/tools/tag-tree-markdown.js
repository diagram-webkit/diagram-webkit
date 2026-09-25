// Tag descriptions from a markdown list; see core/tag-tree-markdown.ts.
import fs from "node:fs";
import path from "node:path";
import { parseTagTreeMarkdown } from "diagram-webkit/core";

export { parseTagTreeMarkdown };

export function readTagTreeMarkdown(file, heading = "Tag tree") {
  return parseTagTreeMarkdown(fs.readFileSync(file, "utf8"), heading);
}

// An importable module, so a definition needs no ?raw import (those break
// Node loading and Vite's dependency pre-bundling in consumers).
export function tagTreeModule(descriptions, source) {
  const entries = Object.keys(descriptions)
    .sort()
    .map((tag) => `  ${JSON.stringify(tag)}: ${JSON.stringify(descriptions[tag])},`)
    .join("\n");
  return `// Generated from ${source} by diagram-webkit. Do not edit.\nexport default {\n${entries}\n};\n`;
}

// Writes the module only when it changed; returns true if it did.
export function writeTagTreeModule(markdownFile, outFile, heading = "Tag tree") {
  const next = tagTreeModule(readTagTreeMarkdown(markdownFile, heading), path.basename(markdownFile));
  if (fs.existsSync(outFile) && fs.readFileSync(outFile, "utf8") === next) return false;
  fs.writeFileSync(outFile, next);
  return true;
}
