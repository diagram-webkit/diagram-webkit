#!/usr/bin/env node
// diagram-webkit validate <svg> [--definition <file>]
// diagram-webkit url-to-slide "<url>" [--definition <file>] [--title <text>]
// diagram-webkit tag-tree <markdown> [--heading <text>]
//
// With DIAGRAM_WEBKIT_DIR set, the CLI of that checkout runs instead (it uses
// the checkout's dist/: run `npm run build` there after engine changes).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { parseArgs } from "node:util";
import {
  createTagModel,
  DEFAULT_METADATA_ATTRS,
  DEFAULT_TAGS_CONFIG,
  extractCells,
  serializeSlide,
  urlToState,
  validateCells,
  validateViews,
} from "diagram-webkit/core";
import { localCounterpart, localEngineDir } from "./local-engine.js";
import { readTagTreeMarkdown, writeTagTreeModule } from "./tag-tree-markdown.js";

const USAGE = `usage:
  diagram-webkit validate <svg> [--definition <file>]
  diagram-webkit url-to-slide "<url>" [--definition <file>] [--title <text>]
  diagram-webkit tag-tree <markdown> [--heading <text>] [--out <module.js>]`;

async function definitionFrom(file) {
  if (!file) return null;
  const { loadDefinition } = await import("./load-definition.js");
  return loadDefinition(file);
}

async function validate(svgFile, options) {
  const definition = await definitionFrom(options.definition);
  const tags = definition ? definition.tags || {} : {};
  const model = createTagModel({
    ...DEFAULT_TAGS_CONFIG,
    ...tags,
    roles: { ...DEFAULT_TAGS_CONFIG.roles, ...(tags.roles || {}) },
  });
  const attrs = { ...DEFAULT_METADATA_ATTRS, ...((definition && definition.metadata) || {}) };
  const cells = extractCells(fs.readFileSync(svgFile, "utf8"), attrs);
  const issues = validateCells(cells, model);
  if (definition) issues.push(...validateViews(definition.views, definition.baseState, cells));
  issues.forEach((issue) => {
    const where = issue.cell ? ` [${issue.cell}]` : "";
    console.log(`${issue.level}: ${issue.code}${where}: ${issue.message}`);
  });
  const errors = issues.filter((issue) => issue.level === "error").length;
  console.log(`${cells.length} cells, ${cells.filter((cell) => cell.help !== null).length} with help, ${errors} errors, ${issues.length - errors} warnings`);
  return errors > 0 ? 1 : 0;
}

async function urlToSlide(rawUrl, options) {
  const definition = await definitionFrom(options.definition);
  const search = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?")).split("#")[0] : "";
  const max = (definition && definition.annotations && definition.annotations.max) || 10;
  const state = urlToState(search, max);
  const base = (definition && definition.baseState) || {};
  console.log(serializeSlide(state.view, base, { title: options.title }));
  return 0;
}

function tagTree(file, options) {
  const heading = options.heading || "Tag tree";
  if (options.out) {
    const changed = writeTagTreeModule(file, options.out, heading);
    console.log(`${options.out}: ${changed ? "written" : "up to date"}`);
    return 0;
  }
  console.log(JSON.stringify(readTagTreeMarkdown(file, heading), null, 2));
  return 0;
}

async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      definition: { type: "string" },
      title: { type: "string" },
      heading: { type: "string" },
      out: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, target] = positionals;
  if (values.help || !command || !target) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  switch (command) {
    case "validate":
      return validate(target, values);
    case "url-to-slide":
      return urlToSlide(target, values);
    case "tag-tree":
      return tagTree(target, values);
    default:
      console.error(`unknown command: ${command}\n${USAGE}`);
      return 2;
  }
}

function runLocal(argv) {
  const engineDir = localEngineDir();
  const delegate = engineDir && localCounterpart(engineDir, import.meta.url);
  if (!delegate) return null;
  console.error(`diagram-webkit: local engine ${engineDir}`);
  const result = spawnSync(process.execPath, [delegate, ...argv], { stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const argv = process.argv.slice(2);
process.exitCode = runLocal(argv) ?? (await main(argv));
