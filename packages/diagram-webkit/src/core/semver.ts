// Just enough of semver for `requires`: ||, space-separated comparators,
// ^, ~, <, <=, >, >=, =, x-ranges. Prerelease tags are not supported.
type Version = [number, number, number];

function parseVersion(raw: string): Version | null {
  const match = raw.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compare(a: Version, b: Version): number {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

// "1", "1.2", "1.x", "*" -> [lower, upperExclusive]
function xRange(raw: string): [Version, Version | null] | null {
  const parts = raw === "" ? [] : raw.split(".");
  const fixed: number[] = [];
  for (const [index, part] of parts.entries()) {
    if (/^\d+$/.test(part)) {
      // A number after an x ("1.x.2") is not a range.
      if (fixed.length < index) return null;
      fixed.push(Number(part));
    } else if (!/^(x|\*)$/i.test(part)) {
      return null;
    }
  }
  if (parts.length > 3 || fixed.length === 3) return null;
  if (fixed.length === 0) return [[0, 0, 0], null];
  if (fixed.length === 1) return [[fixed[0], 0, 0], [fixed[0] + 1, 0, 0]];
  return [[fixed[0], fixed[1], 0], [fixed[0], fixed[1] + 1, 0]];
}

function satisfiesComparator(version: Version, comparator: string): boolean {
  const match = comparator.match(/^(\^|~|>=|<=|>|<|=)?\s*(.+)$/);
  if (!match) throw new Error(`Invalid version comparator: ${comparator}`);
  const [, op = "", target] = match;
  const exact = parseVersion(target);
  if (!exact) {
    const range = xRange(target.replace(/^v/, ""));
    if (!range || (op !== "" && op !== "=")) throw new Error(`Invalid version comparator: ${comparator}`);
    return compare(version, range[0]) >= 0 && (!range[1] || compare(version, range[1]) < 0);
  }
  switch (op) {
    case "^": {
      const upper: Version = exact[0] > 0 ? [exact[0] + 1, 0, 0] : exact[1] > 0 ? [0, exact[1] + 1, 0] : [0, 0, exact[2] + 1];
      return compare(version, exact) >= 0 && compare(version, upper) < 0;
    }
    case "~":
      return compare(version, exact) >= 0 && compare(version, [exact[0], exact[1] + 1, 0]) < 0;
    case ">=":
      return compare(version, exact) >= 0;
    case "<=":
      return compare(version, exact) <= 0;
    case ">":
      return compare(version, exact) > 0;
    case "<":
      return compare(version, exact) < 0;
    default:
      return compare(version, exact) === 0;
  }
}

export function satisfies(versionRaw: string, range: string): boolean {
  const version = parseVersion(versionRaw);
  if (!version) throw new Error(`Invalid version: ${versionRaw}`);
  return range.split("||").some((set) =>
    set
      .trim()
      .replace(/(\^|~|>=|<=|>|<|=)\s+/g, "$1")
      .split(/\s+/)
      .filter(Boolean)
      .every((comparator) => satisfiesComparator(version, comparator)),
  );
}
