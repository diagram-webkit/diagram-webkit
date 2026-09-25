// Reads tag descriptions from a markdown list under a heading:
//   ## Tag tree
//   - `Network` — description
//     - `Network.Egress` — description
export const TAG_TREE_LINE = /^\s*-\s+`([^`]+)`(?:\s+—\s+(.+))?\s*$/;

export function parseTagTreeMarkdown(source: string, heading = "Tag tree"): Record<string, string> {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) {
    throw new Error(`Tag tree markdown has no '## ${heading}' section`);
  }

  const descriptions: Record<string, string> = {};
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("## ")) break;
    const match = line.match(TAG_TREE_LINE);
    if (!match) continue;
    descriptions[match[1]] = (match[2] || "").trim();
  }

  if (Object.keys(descriptions).length === 0) {
    throw new Error(`No tags parsed from the '## ${heading}' section`);
  }
  return descriptions;
}
