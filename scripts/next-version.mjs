// Decides whether diagram-webkit needs a release, and which version.
// Prints GitHub Actions outputs: publish=true|false, version=<x.y.z>.
//
//   node scripts/next-version.mjs >> "$GITHUB_OUTPUT"
//
// Released when anything that goes into the npm package changed since the
// commit the latest npm version was built from (npm records it as gitHead).
// Version: the next patch of the latest npm version; "[minor]" or "[major]" in
// a commit message since then bumps that part instead. A higher version set by
// hand in the package's package.json wins.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PACKAGE = "diagram-webkit";
const ROOT = path.resolve(import.meta.dirname, "..");
const PACKAGE_JSON = path.join(ROOT, "packages", PACKAGE, "package.json");
// What ends up in the tarball: the package (not its tests), plus the README
// and LICENSE that prepack copies in.
const PACKAGE_PATHS = [`packages/${PACKAGE}`, `:(exclude)packages/${PACKAGE}/test`, "README.md", "LICENSE"];
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function run(command, args) {
  return execFileSync(command, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function parse(version) {
  const match = SEMVER.exec(version);
  if (!match) throw new Error(`not a plain x.y.z version: "${version}"`);
  return match.slice(1).map(Number);
}

function compare(a, b) {
  const [x, y] = [parse(a), parse(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

function bump(version, level) {
  const [major, minor, patch] = parse(version);
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// The latest published version and its commit; null before the first publish.
function published() {
  let raw;
  try {
    raw = run("npm", ["view", PACKAGE, "version", "gitHead", "--json"]);
  } catch (error) {
    if (/E404/.test(String(error.stderr))) return null;
    throw error;
  }
  const info = JSON.parse(raw);
  return { version: info.version, gitHead: info.gitHead || null };
}

function inHistory(commit) {
  try {
    run("git", ["cat-file", "-e", `${commit}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function changedSince(commit) {
  return run("git", ["diff", "--name-only", commit, "HEAD", "--", ...PACKAGE_PATHS]).split("\n").filter(Boolean);
}

function level(commit) {
  const messages = run("git", ["log", "--format=%B", `${commit}..HEAD`]);
  if (/\[major\]/i.test(messages)) return "major";
  if (/\[minor\]/i.test(messages)) return "minor";
  return "patch";
}

function decide() {
  const local = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8")).version;
  const latest = published();
  if (!latest) return { publish: true, version: local, reason: "not on npm yet" };
  let bumpLevel = "patch";
  if (latest.gitHead && inHistory(latest.gitHead)) {
    const changed = changedSince(latest.gitHead);
    if (changed.length === 0) return { publish: false, version: latest.version, reason: `no package changes since ${latest.version}` };
    bumpLevel = level(latest.gitHead);
    console.error(`changed since ${latest.version} (${latest.gitHead.slice(0, 7)}): ${changed.join(", ")}`);
  } else {
    console.error(`the commit of ${latest.version} is not in this history; releasing`);
  }
  const next = bump(latest.version, bumpLevel);
  const version = compare(local, next) > 0 ? local : next;
  return { publish: true, version, reason: `${latest.version} -> ${version} (${compare(local, next) > 0 ? "package.json" : bumpLevel})` };
}

const result = decide();
console.error(`${PACKAGE}: ${result.publish ? "release" : "no release"}, ${result.reason}`);
console.log(`publish=${result.publish}`);
console.log(`version=${result.version}`);
