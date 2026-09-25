export const PARAMS = Object.freeze({
  viewport: "v",
  annotations: "annotations",
  menu: "menu",
  query: "filter-query",
  hideTags: "filter-hide-tags",
  onlyTags: "only-tags",
  pins: "pins",
  level: "filter-level",
  tags: "tags",
  highlight: "highlight",
  focus: "focus",
  focusMode: "focus-mode",
  debug: "debug",
  // Local mode only (no diagram in the definition): which SVG to open, as a
  // link or as the SVG itself.
  svg: "svg",
});

// Parameters that belong to the filter; all are dropped together when the
// filter is back at its defaults.
export const FILTER_PARAMS = Object.freeze([
  PARAMS.menu,
  PARAMS.query,
  PARAMS.hideTags,
  PARAMS.onlyTags,
  PARAMS.pins,
  PARAMS.level,
  PARAMS.tags,
  PARAMS.highlight,
  PARAMS.focus,
  PARAMS.focusMode,
]);

// kind: text | list (comma-separated) | enum (one of values) | enum-multi
// (comma-separated subset of values) | blob | flag (presence only).
// "" in values stands for leaving the parameter out.
export type ParamKind = "text" | "list" | "enum" | "enum-multi" | "blob" | "flag";

// How the URL parameters are grouped where they are explained (the help
// dialog), in this order.
export const PARAM_GROUPS = Object.freeze(["view", "notes", "interface", "filters", "focus", "diagram", "development"] as const);
export type ParamGroup = (typeof PARAM_GROUPS)[number];

export interface ParamDoc {
  name: string;
  kind: ParamKind;
  group: ParamGroup;
  values?: readonly string[];
  description: string;
}

export function paramDocs(maxLevel: number): ParamDoc[] {
  return [
    { name: PARAMS.viewport, kind: "text", group: "view", description: "Position and zoom: centre x, y, width, height (0-1 of the diagram), or fit" },
    { name: PARAMS.annotations, kind: "blob", group: "notes", description: "Your notes on the diagram (encoded)" },
    { name: PARAMS.menu, kind: "enum", group: "interface", values: ["true", "false"], description: "Menu open" },
    { name: PARAMS.query, kind: "text", group: "filters", description: "Search text" },
    { name: PARAMS.hideTags, kind: "list", group: "filters", description: "Hidden topics" },
    { name: PARAMS.pins, kind: "list", group: "focus", description: "Pinned parts" },
    {
      name: PARAMS.level,
      kind: "enum",
      group: "filters",
      values: Array.from({ length: Math.max(0, maxLevel) + 1 }, (_, level) => `${level}`),
      description: "Detail level (left out at the highest)",
    },
    { name: PARAMS.tags, kind: "enum", group: "interface", values: ["open", ""], description: "Topic tree expanded in the menu" },
    { name: PARAMS.onlyTags, kind: "list", group: "filters", description: "Show only these topics (with their parents and children)" },
    { name: PARAMS.highlight, kind: "list", group: "focus", description: "Highlighted parts: slugs, tag:X, id:X, mode:outline|pulse|dim-others" },
    { name: PARAMS.focus, kind: "list", group: "focus", description: "Topics in focus: the view fits them and they are highlighted" },
    { name: PARAMS.focusMode, kind: "enum", group: "focus", values: ["dim-others", ""], description: "Dim everything but the topics in focus" },
    { name: PARAMS.debug, kind: "flag", group: "development", description: "Development: local diagram source and logs" },
    { name: PARAMS.svg, kind: "text", group: "diagram", description: "The diagram: a link to an SVG, or the SVG itself (compressed)" },
  ];
}
