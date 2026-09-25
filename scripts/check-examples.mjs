// Checks that each example's folder name matches its dependency pattern:
//   direct--<name>              depends on diagram-webkit only
//   via--<name>--on-<base>      depends on the base example only, imports it
//   split--<name>--on-<base>    depends on diagram-webkit + the base example,
//                               imports diagram-webkit and <base>/definition
// and that no example reaches into packages/*/src.
//
//   node scripts/check-examples.mjs [examples-dir]
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../examples"));
const FOLDER = /^(direct|via|split)--([a-z0-9-]+?)(?:--on-([a-z0-9-]+))?$/;
const IMPORT = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g;
const SOURCE_EXT = new Set([".js", ".mjs", ".ts", ".html"]);
const errors = [];

function fail(folder, message) {
  errors.push(`${folder}: ${message}`);
}

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "dist") return [];
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return SOURCE_EXT.has(path.extname(entry.name)) ? [file] : [];
  });
}

function imports(dir) {
  const found = new Set();
  sourceFiles(dir).forEach((file) => {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(IMPORT)) found.add(match[1] || match[2] || match[3]);
  });
  return found;
}

const folders = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
// <name> -> folders. A name used as --on-<base> must resolve to one folder;
// the same <name> under two patterns (via--x, split--x) is the point of them.
const byName = new Map();
folders.forEach((folder) => {
  const match = folder.match(FOLDER);
  if (match) byName.set(match[2], [...(byName.get(match[2]) || []), folder]);
});
const names = new Map([...byName].filter(([, list]) => list.length === 1).map(([name, list]) => [name, list[0]]));

folders.forEach((folder) => {
  const match = folder.match(FOLDER);
  if (!match) return fail(folder, "name must be <direct|via|split>--<name>[--on-<base>]");
  const [, pattern, , base] = match;
  const dir = path.join(root, folder);
  const manifestFile = path.join(dir, "package.json");
  if (!fs.existsSync(manifestFile)) return fail(folder, "package.json missing");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (manifest.name !== `example-${folder}`) fail(folder, `package name must be "example-${folder}", is "${manifest.name}"`);
  ["index.html", "vite.config.js"].forEach((file) => fs.existsSync(path.join(dir, file)) || fail(folder, `${file} missing`));

  const deps = Object.keys(manifest.dependencies || {}).filter((dep) => dep === "diagram-webkit" || dep.startsWith("example-"));
  const used = imports(dir);
  used.forEach((specifier) => {
    if (/packages\/[^/]+\/src/.test(specifier)) fail(folder, `imports package source: ${specifier}`);
  });
  const usesWebkit = [...used].some((specifier) => specifier === "diagram-webkit" || specifier.startsWith("diagram-webkit/"));
  const baseFolder = base ? names.get(base) : null;
  const basePackage = baseFolder ? `example-${baseFolder}` : null;
  const usesBase = [...used].filter((specifier) => basePackage && (specifier === basePackage || specifier.startsWith(`${basePackage}/`)));
  const expectDeps = (wanted) => {
    if (deps.sort().join(",") !== [...wanted].sort().join(",")) fail(folder, `dependencies must be ${wanted.join(" + ")}, are ${deps.join(" + ") || "(none)"}`);
  };

  if (pattern === "direct") {
    if (base) fail(folder, "direct examples have no --on-<base>");
    expectDeps(["diagram-webkit"]);
    if (!usesWebkit) fail(folder, "must import diagram-webkit");
    return;
  }
  if (!base) return fail(folder, `${pattern} examples need --on-<base>`);
  if (!baseFolder) {
    const candidates = byName.get(base) || [];
    return fail(folder, candidates.length ? `base "${base}" is ambiguous: ${candidates.join(", ")}` : `base example "${base}" does not exist`);
  }
  const baseDep = manifest.dependencies[basePackage];
  if (baseDep !== `file:../${baseFolder}`) fail(folder, `${basePackage} must be "file:../${baseFolder}", is ${JSON.stringify(baseDep)}`);
  if (pattern === "via") {
    expectDeps([basePackage]);
    if (usesWebkit) fail(folder, "via examples must not import diagram-webkit");
    if (usesBase.length === 0) fail(folder, `must import ${basePackage}`);
    if (usesBase.includes(`${basePackage}/definition`)) fail(folder, `via imports the re-export, not ${basePackage}/definition`);
  } else {
    expectDeps(["diagram-webkit", basePackage]);
    if (!usesWebkit) fail(folder, "split examples must import diagram-webkit");
    if (!usesBase.includes(`${basePackage}/definition`)) fail(folder, `must import ${basePackage}/definition`);
    if (usesBase.some((specifier) => specifier !== `${basePackage}/definition`)) fail(folder, `may only import ${basePackage}/definition`);
  }
});

if (errors.length > 0) {
  errors.forEach((error) => console.error(error));
  process.exit(1);
}
console.log(`${folders.length} examples ok`);
