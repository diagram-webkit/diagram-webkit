import type { NamedView } from "./codec/slide";
import type { DiagramView, ElementQuery } from "./state";
import type { TagModel } from "./tags";

export interface MetadataAttrs {
  idAttr: string;
  tagsAttr: string;
  helpAttr: string;
  slugAttr: string;
}

export const DEFAULT_METADATA_ATTRS: MetadataAttrs = Object.freeze({
  idAttr: "data-cell-id",
  tagsAttr: "data-tags",
  helpAttr: "data-help",
  slugAttr: "data-slug",
});

export interface Cell {
  id: string;
  tags: string[];
  help: string | null;
  slug: string | null;
}

export interface Issue {
  level: "error" | "warning";
  code: string;
  message: string;
  cell?: string;
}

export const SLUG_PATTERN = /^[A-Z][A-Za-z0-9]{0,19}$/;
export const MAX_TAG_DEPTH = 3;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

// Pulls the metadata attributes out of an SVG without a DOM. The cell id is
// taken from the element itself or its nearest wrapping element that has one
// (draw.io puts data-cell-id on the outer <g>).
export function extractCells(svgText: string, attrs: MetadataAttrs = DEFAULT_METADATA_ATTRS): Cell[] {
  const cells: Cell[] = [];
  const tagRe = /<([a-zA-Z][\w:-]*)(\s[^<>]*?)?(\/?)>|<\/([a-zA-Z][\w:-]*)\s*>/g;
  const attrRe = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const idStack: (string | null)[] = [];
  let lastId: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(svgText))) {
    if (match[4]) {
      idStack.pop();
      continue;
    }
    const values: Record<string, string> = {};
    let attr: RegExpExecArray | null;
    attrRe.lastIndex = 0;
    while ((attr = attrRe.exec(match[2] || ""))) values[attr[1]] = decodeEntities(attr[2] ?? attr[3]);
    const ownId = values[attrs.idAttr] ?? null;
    const inheritedId = ownId ?? [...idStack].reverse().find((id) => id !== null) ?? null;
    if (ownId !== null) lastId = ownId;
    if (attrs.tagsAttr in values || attrs.helpAttr in values) {
      cells.push({
        id: inheritedId ?? values.id ?? lastId ?? `#${cells.length}`,
        tags: (values[attrs.tagsAttr] || "").split(/[\s,]+/).filter(Boolean),
        help: values[attrs.helpAttr] ?? null,
        slug: values[attrs.slugAttr] ?? null,
      });
    }
    if (!match[3]) idStack.push(ownId);
  }
  return cells;
}

export function validateCells(cells: readonly Cell[], model: TagModel): Issue[] {
  const issues: Issue[] = [];
  const slugs = new Map<string, string[]>();
  const separator = model.config.separator;

  cells.forEach((cell) => {
    const slug = (cell.slug || "").trim();
    if (cell.help !== null) {
      if (!slug) {
        issues.push({ level: "error", code: "missing-slug", cell: cell.id, message: `help without ${"data-slug"}` });
      } else {
        if (!SLUG_PATTERN.test(slug)) {
          issues.push({ level: "error", code: "slug-format", cell: cell.id, message: `slug ${slug} is not PascalCase [A-Za-z0-9], max 20 chars` });
        }
        slugs.set(slug, [...(slugs.get(slug) || []), cell.id]);
      }
    } else if (slug) {
      issues.push({ level: "warning", code: "slug-without-help", cell: cell.id, message: `slug ${slug} on a cell without help` });
    }

    const tags = new Set(cell.tags);
    cell.tags.filter(model.isTopicTag).forEach((tag) => {
      if (tag.split(separator).length > MAX_TAG_DEPTH) {
        issues.push({ level: "error", code: "tag-depth", cell: cell.id, message: `${tag} is deeper than ${MAX_TAG_DEPTH} levels` });
      }
      const parent = model.getTagParent(tag);
      if (parent && !tags.has(parent) && !model.config.deriveAncestors) {
        issues.push({ level: "error", code: "missing-ancestor", cell: cell.id, message: `${tag} without its parent ${parent}` });
      }
    });
  });

  slugs.forEach((ids, slug) => {
    if (ids.length > 1) {
      issues.push({ level: "error", code: "duplicate-slug", message: `slug ${slug} used by ${ids.join(", ")}` });
    }
  });
  return issues;
}

function checkQuery(query: ElementQuery | undefined, known: { ids: Set<string>; slugs: Set<string>; tags: Set<string> }, where: string, issues: Issue[]): void {
  if (!query) return;
  (query.ids || []).forEach((id) => known.ids.has(id) || issues.push({ level: "error", code: "unknown-id", message: `${where}: unknown id ${id}` }));
  (query.slugs || []).forEach((slug) => known.slugs.has(slug) || issues.push({ level: "error", code: "unknown-slug", message: `${where}: unknown slug ${slug}` }));
  (query.tags || []).forEach((tag) => known.tags.has(tag) || issues.push({ level: "error", code: "unknown-tag", message: `${where}: unknown tag ${tag}` }));
}

export function validateView(view: DiagramView, cells: readonly Cell[], where: string): Issue[] {
  const issues: Issue[] = [];
  const known = {
    ids: new Set(cells.map((cell) => cell.id)),
    slugs: new Set(cells.map((cell) => (cell.slug || "").trim()).filter(Boolean)),
    tags: new Set(cells.flatMap((cell) => cell.tags)),
  };
  checkQuery({ tags: view.hiddenTags }, known, `${where}.hiddenTags`, issues);
  checkQuery({ tags: view.onlyTags }, known, `${where}.onlyTags`, issues);
  checkQuery({ slugs: view.pins }, known, `${where}.pins`, issues);
  checkQuery(view.highlight, known, `${where}.highlight`, issues);
  if (view.camera && "focus" in view.camera) checkQuery(view.camera.focus, known, `${where}.camera.focus`, issues);
  return issues;
}

export function validateViews(
  views: Readonly<Record<string, NamedView>> | undefined,
  baseState: DiagramView | undefined,
  cells: readonly Cell[],
): Issue[] {
  const issues = baseState ? validateView(baseState, cells, "baseState") : [];
  Object.entries(views || {}).forEach(([name, view]) => issues.push(...validateView(view.state, cells, `views.${name}`)));
  return issues;
}
